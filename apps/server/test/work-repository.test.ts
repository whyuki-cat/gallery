import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { DatabaseService } from '../src/lib/db.js'
import {
  deleteWorkAssetRow,
  deleteWorkRow,
  findWorkAssetRow,
  findWorkRow,
  insertWork,
  insertWorkAsset,
  listWorkAssetRows,
  listWorkFolderKeys,
  listWorkRows,
  updateWorkMetadataRow,
  updateWorkNameRow,
} from '../src/lib/work-repository.js'

let dir = ''
let service: DatabaseService | null = null

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'gallery-work-repo-'))
})

afterEach(async () => {
  service?.close()
  service = null
  await rm(dir, { recursive: true, force: true })
})

function db(): Database.Database {
  service = new DatabaseService(join(dir, 'gallery.db'))
  const database = service.get()
  database
    .prepare(
      `INSERT INTO libraries
        (id, name, name_key, organization, type, folder, folder_key, convention, created_at, updated_at)
       VALUES ('library-1', '作品集', '作品集', 'collection', 'movie', '作品集', '作品集', NULL, 'now', 'now')`,
    )
    .run()
  return database
}

let workCounter = 0

function addWork(database: Database.Database, name = '电影', folder = '电影'): string {
  const id = `work-${(workCounter += 1)}`
  insertWork(database, {
    id,
    libraryId: 'library-1',
    kind: 'movie',
    name,
    folder,
    folderKey: folder.toLocaleLowerCase(),
    year: null,
    metadataJson: null,
    metadataError: null,
    createdAt: 'now',
    updatedAt: 'now',
  })
  return id
}

function addAsset(
  database: Database.Database,
  workId: string,
  role: 'video' | 'nfo' | 'poster' | 'backdrop' | 'subtitle' | 'extra',
  relativePath: string,
  kind: 'video' | 'image' | 'text',
  position = 0,
): string {
  const id = `asset-${Math.random().toString(16).slice(2)}`
  insertWorkAsset(database, {
    id,
    workId,
    role,
    kind,
    relativePath,
    originalName: relativePath,
    mime: 'application/octet-stream',
    size: 1,
    language: null,
    label: null,
    position,
    createdAt: 'now',
  })
  return id
}

describe('work repository', () => {
  it('inserts and lists works by library', () => {
    const database = db()
    const first = addWork(database, '第一部', '第一部')
    const second = addWork(database, '第二部', '第二部')

    expect(findWorkRow(database, first)?.name).toBe('第一部')
    expect(listWorkRows(database, 'library-1').map((row) => row.id)).toEqual([first, second])
    expect(listWorkFolderKeys(database, 'library-1')).toEqual(['第一部', '第二部'])

    updateWorkNameRow(database, first, '改名', 'later')
    expect(findWorkRow(database, first)?.name).toBe('改名')

    updateWorkMetadataRow(database, first, {
      year: 2020,
      metadataJson: '{"title":"NFO"}',
      metadataError: null,
      updatedAt: 'later',
    })
    expect(findWorkRow(database, first)?.year).toBe(2020)
    expect(findWorkRow(database, first)?.metadata_json).toBe('{"title":"NFO"}')
  })

  it('enforces unique folder keys per library', () => {
    const database = db()
    addWork(database, '电影', '电影')
    expect(() => addWork(database, '电影副本', '电影')).toThrow(/UNIQUE/)
  })

  it('enforces one primary video, NFO, poster and backdrop', () => {
    const database = db()
    const workId = addWork(database)
    addAsset(database, workId, 'video', '电影.mkv', 'video')
    addAsset(database, workId, 'nfo', 'movie.nfo', 'text')
    addAsset(database, workId, 'poster', 'poster.jpg', 'image')
    addAsset(database, workId, 'backdrop', 'backdrop.jpg', 'image')

    expect(() => addAsset(database, workId, 'video', 'other.mkv', 'video')).toThrow(/UNIQUE/)
    expect(() => addAsset(database, workId, 'nfo', 'other.nfo', 'text')).toThrow(/UNIQUE/)
    expect(() => addAsset(database, workId, 'poster', 'other.jpg', 'image')).toThrow(/UNIQUE/)
    expect(() => addAsset(database, workId, 'backdrop', 'other.jpg', 'image')).toThrow(/UNIQUE/)
  })

  it('allows multiple subtitles and extras and cascades on work deletion', () => {
    const database = db()
    const workId = addWork(database)
    addAsset(database, workId, 'subtitle', '电影.zh-CN.srt', 'text', 0)
    addAsset(database, workId, 'subtitle', '电影.en.srt', 'text', 1)
    addAsset(database, workId, 'extra', 'extras/a.mp4', 'video', 0)
    addAsset(database, workId, 'extra', 'extras/b.jpg', 'image', 1)

    expect(listWorkAssetRows(database, workId)).toHaveLength(4)

    const subtitle = listWorkAssetRows(database, workId).find((row) => row.role === 'subtitle')!
    deleteWorkAssetRow(database, subtitle.id)
    expect(findWorkAssetRow(database, subtitle.id)).toBeNull()
    expect(listWorkAssetRows(database, workId)).toHaveLength(3)

    deleteWorkRow(database, workId)
    const remaining = database
      .prepare('SELECT COUNT(*) AS count FROM work_assets WHERE work_id = ?')
      .get(workId) as { count: number }
    expect(remaining.count).toBe(0)
  })

  it('cascades works when the library is deleted', () => {
    const database = db()
    const workId = addWork(database)
    addAsset(database, workId, 'video', '电影.mkv', 'video')

    database.prepare("DELETE FROM libraries WHERE id = 'library-1'").run()

    expect(findWorkRow(database, workId)).toBeNull()
    const remaining = database
      .prepare('SELECT COUNT(*) AS count FROM work_assets WHERE work_id = ?')
      .get(workId) as { count: number }
    expect(remaining.count).toBe(0)
  })
})
