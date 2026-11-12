import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { DatabaseService } from '../src/lib/db.js'
import { insertLibrary, setMediaRoot } from '../src/lib/library-repository.js'
import { WorkImportManager } from '../src/lib/work-import-service.js'
import { listWorkRows } from '../src/lib/work-repository.js'

let dir = ''
let service: DatabaseService | null = null
let manager: WorkImportManager | null = null
let root = ''
let libraryFolder = ''

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'gallery-work-import-'))
  root = join(dir, 'media')
  libraryFolder = '电影'
  await mkdir(join(root, libraryFolder), { recursive: true })

  service = new DatabaseService(join(dir, 'gallery.db'))
  const db = service.get()
  setMediaRoot(db, root)
  insertLibrary(db, {
    id: 'library-1',
    name: '电影库',
    nameKey: '电影库',
    organization: 'collection',
    type: 'movie',
    folder: libraryFolder,
    folderKey: libraryFolder.toLocaleLowerCase(),
    convention: null,
    createdAt: 'now',
    updatedAt: 'now',
  })
  manager = new WorkImportManager(service)
})

afterEach(async () => {
  service?.close()
  service = null
  manager = null
  await rm(dir, { recursive: true, force: true })
})

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function wait(importId: string) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const view = manager!.get(importId)
    if (view.state === 'succeeded' || view.state === 'failed') return view
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 20))
  }
  throw new Error('等待导入超时')
}

describe('WorkImportManager', () => {
  it('reserves folder names for concurrent imports and keeps the source file', async () => {
    const source = join(dir, 'movie.mkv')
    await writeFile(source, 'video-data')

    const first = await manager!.start('library-1', {
      name: '同名电影',
      kind: 'movie',
      videoPath: source,
    })
    const second = await manager!.start('library-1', {
      name: '同名电影',
      kind: 'movie',
      videoPath: source,
    })
    const firstView = await wait(first.id)
    const secondView = await wait(second.id)

    expect(firstView.state).toBe('succeeded')
    expect(secondView.state).toBe('succeeded')
    const rows = listWorkRows(service!.get(), 'library-1')
    expect(rows).toHaveLength(2)
    expect(rows[0]?.folder).not.toBe(rows[1]?.folder)
    expect(await readFile(source, 'utf8')).toBe('video-data')
  })

  it('cleans stale import directories on startup', async () => {
    const stale = join(root, libraryFolder, '.gallery-import-stale')
    const keep = join(root, libraryFolder, 'keep')
    await mkdir(stale)
    await mkdir(keep)

    await manager!.cleanupStale()

    expect(await exists(stale)).toBe(false)
    expect(await exists(keep)).toBe(true)
  })
})
