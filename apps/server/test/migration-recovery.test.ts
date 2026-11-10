import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { DatabaseService } from '../src/lib/db.js'
import { MigrationManager } from '../src/lib/migration-service.js'
import {
  insertMigration,
  insertMigrationItem,
  setMediaRoot,
} from '../src/lib/library-repository.js'

let dir = ''
let service: DatabaseService | null = null

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'gallery-migration-recovery-'))
})

afterEach(async () => {
  service?.close()
  service = null
  await rm(dir, { recursive: true, force: true })
})

async function exists(path: string): Promise<boolean> {
  try {
    await readFile(path)
    return true
  } catch {
    return false
  }
}

describe('migration recovery', () => {
  it('rolls back copied targets when the copy phase was interrupted', async () => {
    const oldRoot = join(dir, 'old')
    const newRoot = join(dir, 'new')
    const folder = '作品集'
    await mkdir(join(oldRoot, folder), { recursive: true })
    await mkdir(join(newRoot, folder), { recursive: true })
    await writeFile(join(oldRoot, folder, 'a.txt'), 'A')
    await writeFile(join(newRoot, folder, 'a.txt'), 'A')

    service = new DatabaseService(join(dir, 'gallery.db'))
    const db = service.get()
    setMediaRoot(db, oldRoot)
    insertMigration(db, {
      id: 'migration-copy',
      from_root: oldRoot,
      to_root: newRoot,
      state: 'copying',
      error: null,
      created_at: '2026-11-10T00:00:00.000Z',
      updated_at: '2026-11-10T00:00:00.000Z',
    })
    insertMigrationItem(db, {
      migration_id: 'migration-copy',
      library_id: 'library-1',
      folder,
      state: 'copied',
      error: null,
    })

    const manager = new MigrationManager(service)
    const view = await manager.latest()

    expect(view?.state).toBe('interrupted')
    expect(await exists(join(newRoot, folder, 'a.txt'))).toBe(false)
    expect(await readFile(join(oldRoot, folder, 'a.txt'), 'utf8')).toBe('A')
  })

  it('resumes cleanup when the switch phase had already committed', async () => {
    const oldRoot = join(dir, 'old')
    const newRoot = join(dir, 'new')
    const folder = '作品集'
    await mkdir(join(oldRoot, folder), { recursive: true })
    await mkdir(join(newRoot, folder), { recursive: true })
    await writeFile(join(oldRoot, folder, 'a.txt'), 'A')
    await writeFile(join(newRoot, folder, 'a.txt'), 'A')

    service = new DatabaseService(join(dir, 'gallery.db'))
    const db = service.get()
    setMediaRoot(db, newRoot)
    insertMigration(db, {
      id: 'migration-switch',
      from_root: oldRoot,
      to_root: newRoot,
      state: 'switching',
      error: null,
      created_at: '2026-11-10T00:00:00.000Z',
      updated_at: '2026-11-10T00:00:00.000Z',
    })
    insertMigrationItem(db, {
      migration_id: 'migration-switch',
      library_id: 'library-1',
      folder,
      state: 'copied',
      error: null,
    })

    const manager = new MigrationManager(service)
    const view = await manager.latest()

    expect(view?.state).toBe('succeeded')
    expect(await exists(join(oldRoot, folder, 'a.txt'))).toBe(false)
    expect(await readFile(join(newRoot, folder, 'a.txt'), 'utf8')).toBe('A')
  })
})
