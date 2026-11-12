import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { buildApp } from '../src/app.js'
import { hasFfmpeg, runFfmpeg } from '../src/lib/ffmpeg.js'

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVQImWPojvn2H4QZYAwAYxYLcfo9f2UAAAAASUVORK5CYII=',
  'base64',
)

let dir = ''
let root = ''
let nextRoot = ''
let sourceDir = ''
let sourceVideo = ''
let sourceNfo = ''
let sourcePoster = ''
let sourceBackdrop = ''
let sourceSubtitle = ''
let sourceExtraImage = ''
let sourceExtraVideo = ''
let dbPath = ''
let app: Awaited<ReturnType<typeof buildApp>>

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'gallery-works-'))
  root = join(dir, 'media')
  nextRoot = join(dir, 'media-next')
  sourceDir = join(dir, 'source')
  await mkdir(root)
  await mkdir(sourceDir)
  sourceVideo = join(sourceDir, 'movie.mkv')
  sourceNfo = join(sourceDir, 'movie.nfo')
  sourcePoster = join(sourceDir, 'poster.png')
  sourceBackdrop = join(sourceDir, 'backdrop.png')
  sourceSubtitle = join(sourceDir, 'movie.zh-CN.srt')
  sourceExtraImage = join(sourceDir, 'still.png')
  sourceExtraVideo = join(sourceDir, 'behind.mp4')
  await writeFile(sourceVideo, '0123456789')
  await writeFile(
    sourceNfo,
    `<movie><title>NFO 标题</title><year>2020</year><plot>简介</plot><genre>科幻</genre><actor><name>演员</name><role>角色</role></actor></movie>`,
  )
  await writeFile(sourcePoster, PNG)
  await writeFile(sourceBackdrop, PNG)
  await writeFile(sourceSubtitle, '1\n00:00:01,000 --> 00:00:02,000\n你好\n')
  await writeFile(sourceExtraImage, PNG)
  await writeFile(sourceExtraVideo, 'extra-video')
  dbPath = join(dir, 'gallery.db')
  process.env.LOG_LEVEL = 'silent'
  app = await buildApp({ dbPath })
})

afterEach(async () => {
  await app.close()
  await rm(dir, { recursive: true, force: true })
})

function api(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  url: string,
  payload?: unknown,
  withClient = true,
) {
  return app.inject({
    method,
    url,
    headers: withClient ? { 'x-gallery-client': '1' } : {},
    payload: payload as Record<string, unknown> | undefined,
  })
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function setRoot(): Promise<void> {
  const response = await api('PUT', '/api/library/config', { mediaRoot: root })
  expect(response.statusCode).toBe(200)
}

async function createCollection(name: string): Promise<{ id: string; folder: string }> {
  const before = new Set(await readdir(root))
  const response = await api('POST', '/api/library/libraries', {
    name,
    organization: 'collection',
    type: 'movie',
  })
  expect(response.statusCode).toBe(201)
  const folder = (await readdir(root)).find((item) => !before.has(item))
  expect(folder).toBeTruthy()
  return { id: response.json().id as string, folder: folder! }
}

async function waitForImport(importId: string): Promise<Record<string, unknown>> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const response = await api('GET', `/api/works/imports/${importId}`)
    expect(response.statusCode).toBe(200)
    const body = response.json() as Record<string, unknown>
    if (body.state === 'succeeded' || body.state === 'failed') return body
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 20))
  }
  throw new Error('等待作品导入超时')
}

async function createWork(
  libraryId: string,
  name = '星际穿越',
  videoPath = sourceVideo,
): Promise<string> {
  const response = await api('POST', `/api/library/${libraryId}/works/imports`, {
    name,
    kind: 'movie',
    videoPath,
  })
  expect(response.statusCode).toBe(202)
  const view = await waitForImport(response.json().id as string)
  expect(view.state).toBe('succeeded')
  return view.workId as string
}

async function workDirectories(libraryFolder: string): Promise<string[]> {
  const entries = await readdir(join(root, libraryFolder), { withFileTypes: true })
  return entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.gallery-import-'))
    .map((entry) => join(root, libraryFolder, entry.name))
}

async function workDirectory(libraryFolder: string): Promise<string> {
  const directories = await workDirectories(libraryFolder)
  expect(directories[0]).toBeTruthy()
  return directories[0]!
}

async function addAsset(
  workId: string,
  role: string,
  sourcePath: string,
  language?: string,
) {
  return api('POST', `/api/works/${workId}/assets`, {
    role,
    sourcePath,
    language,
  })
}

async function waitForMigration(id: string): Promise<Record<string, unknown>> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const response = await api('GET', `/api/library/config/migrate/${id}`)
    expect(response.statusCode).toBe(200)
    const body = response.json() as Record<string, unknown>
    if (body.state === 'succeeded' || body.state === 'cleanup_failed') return body
    if (body.state === 'failed' || body.state === 'interrupted') {
      throw new Error(`迁移失败：${String(body.error ?? body.state)}`)
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 30))
  }
  throw new Error('等待迁移超时')
}

describe('movie works API', () => {
  it('creates a work by copying the source video and streams it with Range', async () => {
    await setRoot()
    const library = await createCollection('电影作品集')
    const workId = await createWork(library.id)

    expect(await readFile(sourceVideo, 'utf8')).toBe('0123456789')

    const list = await api('GET', `/api/library/${library.id}/works`)
    expect(list.statusCode).toBe(200)
    expect(list.json().library.id).toBe(library.id)
    expect(list.json().works).toHaveLength(1)
    expect(list.json().works[0].name).toBe('星际穿越')
    expect(list.json().works[0].status).toBe('ok')

    const detail = await api('GET', `/api/works/${workId}`)
    expect(detail.statusCode).toBe(200)
    expect(detail.json().kind).toBe('movie')
    expect(detail.json().video.role).toBe('video')
    expect(detail.json().status).toBe('ok')

    const directory = await workDirectory(library.folder)
    const files = await readdir(directory)
    expect(files.some((file) => file.endsWith('.mkv'))).toBe(true)

    const full = await api('GET', `/api/works/${workId}/video`)
    expect(full.statusCode).toBe(200)
    expect(full.body).toBe('0123456789')

    const range = await api('GET', `/api/works/${workId}/video`, undefined)
    expect(range.statusCode).toBe(200)
    const ranged = await app.inject({
      method: 'GET',
      url: `/api/works/${workId}/video`,
      headers: { range: 'bytes=0-3' },
    })
    expect(ranged.statusCode).toBe(206)
    expect(ranged.headers['content-range']).toBe('bytes 0-3/10')
    expect(ranged.body).toBe('0123')
  })

  it('adds optional resources and converts subtitles to WebVTT', async () => {
    await setRoot()
    const library = await createCollection('资源作品集')
    const workId = await createWork(library.id)

    expect((await addAsset(workId, 'nfo', sourceNfo)).statusCode).toBe(201)
    expect((await addAsset(workId, 'poster', sourcePoster)).statusCode).toBe(201)
    expect((await addAsset(workId, 'backdrop', sourceBackdrop)).statusCode).toBe(201)
    expect((await addAsset(workId, 'subtitle', sourceSubtitle)).statusCode).toBe(201)
    expect((await addAsset(workId, 'extra', sourceExtraImage)).statusCode).toBe(201)
    expect((await addAsset(workId, 'extra', sourceExtraVideo)).statusCode).toBe(201)

    const detail = await api('GET', `/api/works/${workId}`)
    const body = detail.json()
    expect(body.name).toBe('星际穿越')
    expect(body.metadata.title).toBe('NFO 标题')
    expect(body.metadata.year).toBe(2020)
    expect(body.metadataError).toBeNull()
    expect(body.nfo).not.toBeNull()
    expect(body.poster).not.toBeNull()
    expect(body.backdrop).not.toBeNull()
    expect(body.subtitles).toHaveLength(1)
    expect(body.subtitles[0].language).toBe('zh-CN')
    expect(body.extras).toHaveLength(2)

    const nfo = await api('GET', `/api/works/${workId}/nfo`)
    expect(nfo.statusCode).toBe(200)
    expect(nfo.body).toContain('NFO 标题')

    const subtitle = await api(
      'GET',
      `/api/works/${workId}/subtitles/${body.subtitles[0].id}`,
    )
    expect(subtitle.statusCode).toBe(200)
    expect(subtitle.headers['content-type']).toContain('text/vtt')
    expect(subtitle.body).toContain('WEBVTT')
    expect(subtitle.body).toContain('你好')

    const poster = await api('GET', `/api/works/${workId}/poster`)
    expect(poster.statusCode).toBe(200)
    expect(poster.headers['content-type']).toBe('image/jpeg')

    const extra = body.extras.find((asset: { kind: string }) => asset.kind === 'video')
    const extraResponse = await api('GET', `/api/works/${workId}/assets/${extra.id}`)
    expect(extraResponse.statusCode).toBe(200)
    expect(extraResponse.body).toBe('extra-video')

    await writeFile(sourceNfo, '<movie><title>损坏')
    expect((await addAsset(workId, 'nfo', sourceNfo)).statusCode).toBe(201)
    const invalid = await api('GET', `/api/works/${workId}`)
    expect(invalid.json().name).toBe('星际穿越')
    expect(invalid.json().metadataError).toContain('XML')

    const badSubtitle = join(sourceDir, 'bad.srt')
    await writeFile(badSubtitle, '不是有效字幕')
    const bad = await addAsset(workId, 'subtitle', badSubtitle)
    expect(bad.statusCode).toBe(201)
    const badSubtitleResponse = await api(
      'GET',
      `/api/works/${workId}/subtitles/${bad.json().asset.id}`,
    )
    expect(badSubtitleResponse.statusCode).toBe(422)
    expect(badSubtitleResponse.json().error).toBe('subtitle-conversion-failed')

    const subtitleId = body.subtitles[0].id as string
    expect((await api('DELETE', `/api/works/${workId}/assets/${subtitleId}`)).statusCode).toBe(200)
    const afterRemove = await api('GET', `/api/works/${workId}`)
    expect(afterRemove.json().subtitles.map((asset: { id: string }) => asset.id)).not.toContain(
      subtitleId,
    )
  })

  it('generates a video thumbnail when ffmpeg is available', async () => {
    if (!(await hasFfmpeg())) return

    const realVideo = join(sourceDir, 'real.mp4')
    await runFfmpeg([
      '-y',
      '-f',
      'lavfi',
      '-i',
      'testsrc=size=160x120:rate=10',
      '-t',
      '2',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      realVideo,
    ])

    await setRoot()
    const library = await createCollection('缩略图作品集')
    const workId = await createWork(library.id, '缩略图电影', realVideo)
    const thumbnail = await api('GET', `/api/works/${workId}/thumbnail`)
    expect(thumbnail.statusCode).toBe(200)
    expect(thumbnail.headers['content-type']).toBe('image/jpeg')
  })

  it('reports missing and partial resource status', async () => {
    await setRoot()
    const library = await createCollection('状态作品集')
    const workId = await createWork(library.id)
    const directory = await workDirectory(library.folder)
    const videoName = (await readdir(directory)).find((name) => name.endsWith('.mkv'))!
    await rm(join(directory, videoName))

    const missing = await api('GET', `/api/works/${workId}`)
    expect(missing.json().status).toBe('missing')

    const secondId = await createWork(library.id, '第二部')
    expect((await addAsset(secondId, 'poster', sourcePoster)).statusCode).toBe(201)
    const directories = await workDirectories(library.folder)
    const secondDirectory = (
      await Promise.all(
        directories.map(async (directory) => ({
          directory,
          files: await readdir(directory),
        })),
      )
    ).find((item) => item.files.includes('poster.png'))?.directory
    expect(secondDirectory).toBeTruthy()
    await rm(join(secondDirectory!, 'poster.png'))
    const partial = await api('GET', `/api/works/${secondId}`)
    expect(partial.json().status).toBe('partial')

    await mkdir(join(secondDirectory!, 'poster.png'))
    const unreadable = await api('GET', `/api/works/${secondId}`)
    expect(unreadable.json().status).toBe('unreadable')

    try {
      await rm(join(secondDirectory!, 'poster.png'), { recursive: true, force: true })
      await symlink(sourcePoster, join(secondDirectory!, 'poster.png'), 'file')
      const linked = await api('GET', `/api/works/${secondId}`)
      expect(linked.json().status).toBe('symlink')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EPERM') throw error
    }
  })

  it('deletes a work without a delete password', async () => {
    await setRoot()
    const library = await createCollection('删除作品集')
    const workId = await createWork(library.id)
    const directory = await workDirectory(library.folder)

    const deleted = await api('POST', `/api/works/${workId}/delete`, {})
    expect(deleted.statusCode).toBe(200)
    expect(deleted.json().deleted).toBe(true)
    expect(await exists(directory)).toBe(false)

    const list = await api('GET', `/api/library/${library.id}/works`)
    expect(list.json().works).toEqual([])

    const secondId = await createWork(library.id, '目录已丢失')
    const secondDirectory = await workDirectory(library.folder)
    await rm(secondDirectory, { recursive: true, force: true })
    const missing = await api('POST', `/api/works/${secondId}/delete`, {})
    expect(missing.statusCode).toBe(200)
    expect(missing.json().deleted).toBe(true)
  })

  it('rejects convention libraries, forged IDs and missing client headers', async () => {
    await setRoot()
    const sourceA = join(dir, 'source-a')
    await mkdir(sourceA)
    const convention = await api('POST', '/api/library/libraries', {
      name: '文件规范',
      organization: 'convention',
      sources: [sourceA],
    })
    const conventionId = convention.json().id as string

    const rejected = await api('POST', `/api/library/${conventionId}/works/imports`, {
      name: '电影',
      kind: 'movie',
      videoPath: sourceVideo,
    })
    expect(rejected.statusCode).toBe(400)
    expect(rejected.json().error).toBe('unsupported-library-organization')

    const list = await api('GET', `/api/library/${conventionId}/works`)
    expect(list.statusCode).toBe(400)

    const forged = await api('GET', '/api/works/not-a-work')
    expect(forged.statusCode).toBe(404)

    const noHeader = await api(
      'POST',
      `/api/library/${conventionId}/works/imports`,
      { name: '电影', kind: 'movie', videoPath: sourceVideo },
      false,
    )
    expect(noHeader.statusCode).toBe(403)
  })

  it('rolls back the work directory when the database write fails', async () => {
    await setRoot()
    const library = await createCollection('回滚作品集')
    const raw = new Database(dbPath)
    raw.exec(
      "CREATE TRIGGER fail_work_insert BEFORE INSERT ON works BEGIN SELECT RAISE(ABORT, 'forced failure'); END",
    )
    raw.close()

    try {
      const response = await api('POST', `/api/library/${library.id}/works/imports`, {
        name: '回滚电影',
        kind: 'movie',
        videoPath: sourceVideo,
      })
      const view = await waitForImport(response.json().id as string)
      expect(view.state).toBe('failed')
      expect(await readdir(join(root, library.folder))).toEqual([])
      expect(await readFile(sourceVideo, 'utf8')).toBe('0123456789')
    } finally {
      const cleanup = new Database(dbPath)
      cleanup.exec('DROP TRIGGER IF EXISTS fail_work_insert')
      cleanup.close()
    }
  })

  it('keeps works available after migrating the media root', async () => {
    await setRoot()
    await api('PUT', '/api/library/security', { newPassword: 'password123' })
    const library = await createCollection('迁移作品集')
    const workId = await createWork(library.id)
    expect((await addAsset(workId, 'poster', sourcePoster)).statusCode).toBe(201)

    const start = await api('POST', '/api/library/config/migrate', {
      mediaRoot: nextRoot,
      password: 'password123',
    })
    expect(start.statusCode).toBe(202)
    expect((await waitForMigration(start.json().migrationId as string)).state).toBe('succeeded')

    const detail = await api('GET', `/api/works/${workId}`)
    expect(detail.statusCode).toBe(200)
    expect(detail.json().status).toBe('ok')
    const poster = await api('GET', `/api/works/${workId}/poster`)
    expect(poster.statusCode).toBe(200)
    expect(await exists(join(root, library.folder))).toBe(false)
  })

  it('searches and sorts works by name', async () => {
    await setRoot()
    const library = await createCollection('搜索作品集')
    await createWork(library.id, 'B 电影')
    await createWork(library.id, 'A 电影')

    const sorted = await api('GET', `/api/library/${library.id}/works?sort=name`)
    expect(sorted.json().works.map((work: { name: string }) => work.name)).toEqual([
      'A 电影',
      'B 电影',
    ])

    const searched = await api('GET', `/api/library/${library.id}/works?q=A`)
    expect(searched.json().works).toHaveLength(1)
    expect(searched.json().works[0].name).toBe('A 电影')
  })
})
