import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { buildApp } from '../src/app.js'

let dir = ''
let root = ''
let nextRoot = ''
let sourceA = ''
let sourceB = ''
let dbPath = ''
let app: Awaited<ReturnType<typeof buildApp>>

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'gallery-library-'))
  root = join(dir, 'media')
  nextRoot = join(dir, 'media-next')
  sourceA = join(dir, 'source-a')
  sourceB = join(dir, 'source-b')
  dbPath = join(dir, 'gallery.db')
  await mkdir(root)
  await mkdir(sourceA)
  await mkdir(sourceB)
  process.env.LOG_LEVEL = 'silent'
  app = await buildApp({ dbPath })
})

afterEach(async () => {
  await app.close()
  await rm(dir, { recursive: true, force: true })
})

function api(method: 'GET' | 'POST' | 'PUT' | 'PATCH', url: string, payload?: unknown) {
  return app.inject({
    method,
    url,
    headers: { 'x-gallery-client': '1' },
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
  const body = response.json() as { id: string }
  const folders = await readdir(root)
  const folder = folders.find((item) => !before.has(item))
  expect(folder).toBeTruthy()
  return { id: body.id, folder: folder! }
}

async function waitForMigration(id: string): Promise<Record<string, unknown>> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const response = await api('GET', `/api/library/config/migrate/${id}`)
    expect(response.statusCode).toBe(200)
    const body = response.json() as Record<string, unknown>
    if (body.state === 'succeeded' || body.state === 'cleanup_failed') return body
    if (body.state === 'failed' || body.state === 'interrupted') {
      throw new Error(`迁移失败：${String(body.error ?? body.state)}`)
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 50))
  }
  throw new Error('等待迁移超时')
}

describe('media library API', () => {
  it('configures the media root and returns overview', async () => {
    await setRoot()
    const response = await api('GET', '/api/library/overview')
    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.mediaRoot).toBe(root)
    expect(body.rootStatus).toBe('ok')
    expect(body.databasePath).toBe(dbPath)
    expect(body.deletePasswordConfigured).toBe(false)
    expect(body.libraries).toEqual([])
  })

  it('creates a collection library with a hidden folder', async () => {
    await setRoot()
    const created = await createCollection('宫崎骏作品集')
    expect(await exists(join(root, created.folder))).toBe(true)

    const overview = await api('GET', '/api/library/overview')
    const library = overview.json().libraries[0]
    expect(library.name).toBe('宫崎骏作品集')
    expect(library.organization).toBe('collection')
    expect(library.status).toBe('ok')
    expect(library).not.toHaveProperty('folder')
  })

  it('rejects duplicate names ignoring case', async () => {
    await setRoot()
    await createCollection('Movies')
    const response = await api('POST', '/api/library/libraries', {
      name: '  movies ',
      organization: 'collection',
    })
    expect(response.statusCode).toBe(409)
    expect(response.json().error).toBe('duplicate-name')
  })

  it('removes a newly created folder when the database write fails', async () => {
    await setRoot()
    const raw = new Database(dbPath)
    raw.exec(
      "CREATE TRIGGER fail_library_insert BEFORE INSERT ON libraries BEGIN SELECT RAISE(ABORT, 'forced failure'); END",
    )
    raw.close()

    try {
      const response = await api('POST', '/api/library/libraries', {
        name: '回滚测试',
        organization: 'collection',
      })
      expect(response.statusCode).toBeGreaterThanOrEqual(400)
      expect(await readdir(root)).toEqual([])
    } finally {
      const cleanup = new Database(dbPath)
      cleanup.exec('DROP TRIGGER IF EXISTS fail_library_insert')
      cleanup.close()
    }
  })

  it('creates a convention library with multiple sources', async () => {
    await setRoot()
    const response = await api('POST', '/api/library/libraries', {
      name: '剧集',
      organization: 'convention',
      type: 'series',
      sources: [sourceA, sourceB],
    })
    expect(response.statusCode).toBe(201)
    expect(response.json().sources).toEqual([resolve(sourceA), resolve(sourceB)])
    expect(response.json()).not.toHaveProperty('folder')
  })

  it('rejects sources that overlap a collection folder', async () => {
    await setRoot()
    const created = await createCollection('作品集')
    const response = await api('POST', '/api/library/libraries', {
      name: '冲突来源',
      organization: 'convention',
      sources: [join(root, created.folder)],
    })
    expect(response.statusCode).toBeGreaterThanOrEqual(400)
    expect(response.json().error).toBe('source-overlap')
  })

  it('edits name, type and convention sources while rejecting immutable fields', async () => {
    await setRoot()
    const created = await api('POST', '/api/library/libraries', {
      name: '可编辑',
      organization: 'convention',
      sources: [sourceA],
    })
    const id = created.json().id as string

    const updated = await api('PATCH', `/api/library/libraries/${id}`, {
      name: '已编辑',
      type: 'photo',
      sources: [sourceA, sourceB],
    })
    expect(updated.statusCode).toBe(200)
    expect(updated.json().name).toBe('已编辑')
    expect(updated.json().type).toBe('photo')
    expect(updated.json().sources).toEqual([resolve(sourceA), resolve(sourceB)])

    const organization = await api('PATCH', `/api/library/libraries/${id}`, {
      organization: 'collection',
    })
    expect(organization.statusCode).toBe(409)
    expect(organization.json().error).toBe('organization-immutable')

    const folder = await api('PATCH', `/api/library/libraries/${id}`, {
      folder: 'other',
    })
    expect(folder.statusCode).toBe(409)
    expect(folder.json().error).toBe('folder-immutable')
  })

  it('validates password changes', async () => {
    const short = await api('PUT', '/api/library/security', { newPassword: 'short' })
    expect(short.statusCode).toBe(400)

    await api('PUT', '/api/library/security', { newPassword: 'password123' })
    const wrong = await api('PUT', '/api/library/security', {
      currentPassword: 'wrong-password',
      newPassword: 'password456',
    })
    expect(wrong.statusCode).toBe(403)

    const changed = await api('PUT', '/api/library/security', {
      currentPassword: 'password123',
      newPassword: 'password456',
    })
    expect(changed.statusCode).toBe(200)
  })

  it('requires the delete password for collection deletion', async () => {
    await setRoot()
    const created = await createCollection('待删除')
    await writeFile(join(root, created.folder, 'movie.mp4'), 'data')

    const missing = await api('POST', `/api/library/libraries/${created.id}/delete`, {})
    expect(missing.statusCode).toBe(409)
    expect(missing.json().error).toBe('delete-password-not-configured')

    const password = await api('PUT', '/api/library/security', { newPassword: 'password123' })
    expect(password.statusCode).toBe(200)

    const wrong = await api('POST', `/api/library/libraries/${created.id}/delete`, {
      password: 'wrong-password',
    })
    expect(wrong.statusCode).toBe(403)

    const deleted = await api('POST', `/api/library/libraries/${created.id}/delete`, {
      password: 'password123',
    })
    expect(deleted.statusCode).toBe(200)
    expect(deleted.json().deleted).toBe(true)
    expect(await exists(join(root, created.folder))).toBe(false)

    const overview = await api('GET', '/api/library/overview')
    expect(overview.json().libraries).toEqual([])
  })

  it('removes a convention library without touching its sources', async () => {
    await setRoot()
    const response = await api('POST', '/api/library/libraries', {
      name: '只解除登记',
      organization: 'convention',
      sources: [sourceA],
    })
    const id = response.json().id as string
    await writeFile(join(sourceA, 'episode.mkv'), 'data')

    const deleted = await api('POST', `/api/library/libraries/${id}/delete`, {})
    expect(deleted.statusCode).toBe(200)
    expect(deleted.json().deleted).toBe(true)
    expect(deleted.json().retainedSources).toEqual([resolve(sourceA)])
    expect(await readFile(join(sourceA, 'episode.mkv'), 'utf8')).toBe('data')
  })

  it('requires migration when a collection library exists', async () => {
    await setRoot()
    await createCollection('已存在')
    const response = await api('PUT', '/api/library/config', { mediaRoot: nextRoot })
    expect(response.statusCode).toBe(409)
    expect(response.json().error).toBe('migration-required')
  })

  it('migrates collection folders and cleans old copies', async () => {
    await setRoot()
    await api('PUT', '/api/library/security', { newPassword: 'password123' })

    const first = await createCollection('作品一')
    const second = await createCollection('作品二')
    await writeFile(join(root, first.folder, 'a.txt'), 'A')
    await writeFile(join(root, second.folder, 'b.txt'), 'B')

    const start = await api('POST', '/api/library/config/migrate', {
      mediaRoot: nextRoot,
      password: 'password123',
    })
    expect(start.statusCode).toBe(202)
    const migrationId = start.json().migrationId as string

    const result = await waitForMigration(migrationId)
    expect(result.state).toBe('succeeded')

    expect(await readFile(join(nextRoot, first.folder, 'a.txt'), 'utf8')).toBe('A')
    expect(await readFile(join(nextRoot, second.folder, 'b.txt'), 'utf8')).toBe('B')
    expect(await exists(join(root, first.folder))).toBe(false)
    expect(await exists(join(root, second.folder))).toBe(false)

    const overview = await api('GET', '/api/library/overview')
    expect(overview.json().mediaRoot).toBe(nextRoot)
  })

  it('reports partial status when one source is missing', async () => {
    await setRoot()
    const created = await api('POST', '/api/library/libraries', {
      name: '部分来源',
      organization: 'convention',
      sources: [sourceA, sourceB],
    })
    const id = created.json().id as string
    await rm(sourceB, { recursive: true, force: true })

    const overview = await api('GET', '/api/library/overview')
    const library = overview.json().libraries.find((item: { id: string }) => item.id === id)
    expect(library.status).toBe('partial')
    expect(library.issues[0]).toContain(sourceB)
  })

  it('keeps libraries listed when the media root is missing', async () => {
    await setRoot()
    const created = await createCollection('根路径丢失')
    const convention = await api('POST', '/api/library/libraries', {
      name: '仍可编辑',
      organization: 'convention',
      sources: [sourceA],
    })
    await rm(root, { recursive: true, force: true })

    const overview = await api('GET', '/api/library/overview')
    expect(overview.json().rootStatus).toBe('missing')

    const collection = overview
      .json()
      .libraries.find((item: { id: string }) => item.id === created.id)
    expect(collection.status).toBe('missing')

    const createAgain = await api('POST', '/api/library/libraries', {
      name: '新作品集',
      organization: 'collection',
    })
    expect(createAgain.statusCode).toBe(400)
    expect(createAgain.json().error).toBe('root-unavailable')

    const editConvention = await api('PATCH', `/api/library/libraries/${convention.json().id}`, {
      name: '仍可编辑-已改',
    })
    expect(editConvention.statusCode).toBe(200)
  })

  it('rejects migration when the target folder already exists', async () => {
    await setRoot()
    await api('PUT', '/api/library/security', { newPassword: 'password123' })
    const created = await createCollection('冲突迁移')
    await mkdir(nextRoot, { recursive: true })
    await mkdir(join(nextRoot, created.folder))

    const response = await api('POST', '/api/library/config/migrate', {
      mediaRoot: nextRoot,
      password: 'password123',
    })
    expect(response.statusCode).toBe(409)
    expect(response.json().error).toBe('migration-conflict')
  })

  it('requires the client header for mutations', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/library/libraries',
      payload: { name: '无标识', organization: 'collection' },
    })
    expect(response.statusCode).toBe(403)
  })

  it('reports database-unavailable without preventing startup', async () => {
    const badApp = await buildApp({ dbPath: dir })
    try {
      const response = await badApp.inject({ method: 'GET', url: '/api/library/overview' })
      expect(response.statusCode).toBe(503)
      expect(response.json().error).toBe('database-unavailable')
    } finally {
      await badApp.close()
    }
  })
})
