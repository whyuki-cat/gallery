import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { DatabaseService, withTransaction } from '../src/lib/db.js'
import { HttpError } from '../src/lib/errors.js'

let dir = ''
let service: DatabaseService | null = null

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'gallery-db-'))
})

afterEach(async () => {
  service?.close()
  service = null
  await rm(dir, { recursive: true, force: true })
})

function open(): DatabaseService {
  service = new DatabaseService(join(dir, 'gallery.db'))
  return service
}

function insertLibrary(db: Database.Database, id: string, name: string): void {
  db.prepare(
    `INSERT INTO libraries
      (id, name, name_key, organization, type, folder, folder_key, convention, created_at, updated_at)
     VALUES (?, ?, ?, 'collection', NULL, ?, ?, NULL, ?, ?)`,
  ).run(id, name, name.toLocaleLowerCase(), name, name.toLocaleLowerCase(), 'now', 'now')
}

describe('DatabaseService', () => {
  it('creates the schema and sets the schema version', () => {
    const db = open().get()
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all() as Array<{ name: string }>
    const names = tables.map((row) => row.name)

    expect(names).toEqual(
      expect.arrayContaining([
        'libraries',
        'library_sources',
        'migration_items',
        'migrations',
        'settings',
      ]),
    )
    expect(db.pragma('user_version', { simple: true })).toBe(1)
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1)
  })

  it('enforces unique media library names', () => {
    const db = open().get()
    insertLibrary(db, 'one', 'Movies')
    expect(() => insertLibrary(db, 'two', 'movies')).toThrow(/UNIQUE/)
  })

  it('cascades source deletion', () => {
    const db = open().get()
    insertLibrary(db, 'one', 'Movies')
    db.prepare(
      "INSERT INTO library_sources (library_id, path, path_key, position) VALUES ('one', '/a', '/a', 0)",
    ).run()
    db.prepare("DELETE FROM libraries WHERE id = 'one'").run()
    const row = db.prepare('SELECT COUNT(*) AS count FROM library_sources').get() as {
      count: number
    }
    expect(row.count).toBe(0)
  })

  it('rolls back a failed transaction', () => {
    const db = open().get()
    expect(() =>
      withTransaction(db, () => {
        insertLibrary(db, 'one', 'Movies')
        throw new Error('boom')
      }),
    ).toThrow('boom')

    const row = db.prepare('SELECT COUNT(*) AS count FROM libraries').get() as { count: number }
    expect(row.count).toBe(0)
  })

  it('rejects a database from a newer program version', async () => {
    const path = join(dir, 'future.db')
    const raw = new Database(path)
    raw.pragma('user_version = 99')
    raw.close()

    service = new DatabaseService(path)
    expect(() => service?.get()).toThrowError(HttpError)
    try {
      service.get()
    } catch (error) {
      expect((error as HttpError).code).toBe('db-version-unsupported')
    }
  })

  it('reports database-unavailable when the path is a directory', async () => {
    const path = join(dir, 'not-a-file')
    await mkdir(path)

    service = new DatabaseService(path)
    const current = service
    try {
      current.get()
    } catch (error) {
      expect((error as HttpError).code).toBe('database-unavailable')
      expect((error as HttpError).message).toContain(path)
    }
  })
})
