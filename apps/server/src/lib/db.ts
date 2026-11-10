import { mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

import Database from 'better-sqlite3'

import { HttpError } from './errors.js'

const CURRENT_SCHEMA_VERSION = 1

const SCHEMA_V1 = `
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE libraries (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL UNIQUE,
  organization TEXT NOT NULL CHECK (organization IN ('collection','convention')),
  type TEXT CHECK (type IS NULL OR type IN ('movie','series','photo')),
  folder TEXT,
  folder_key TEXT UNIQUE,
  convention TEXT CHECK (convention IS NULL OR convention = 'jellyfin'),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (
    (organization = 'collection' AND folder IS NOT NULL AND convention IS NULL)
    OR
    (organization = 'convention' AND folder IS NULL AND convention = 'jellyfin')
  )
);

CREATE TABLE library_sources (
  library_id TEXT NOT NULL REFERENCES libraries(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  path_key TEXT NOT NULL,
  position INTEGER NOT NULL,
  PRIMARY KEY (library_id, path_key)
);

CREATE INDEX idx_library_sources_path_key ON library_sources(path_key);

CREATE TABLE migrations (
  id TEXT PRIMARY KEY,
  from_root TEXT NOT NULL,
  to_root TEXT NOT NULL,
  state TEXT NOT NULL CHECK (
    state IN ('pending','copying','switching','cleanup','cleanup_failed','succeeded','failed','interrupted')
  ),
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE migration_items (
  migration_id TEXT NOT NULL REFERENCES migrations(id) ON DELETE CASCADE,
  library_id TEXT NOT NULL,
  folder TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('pending','copied','cleaned','failed')),
  error TEXT,
  PRIMARY KEY (migration_id, library_id)
);
`

export function resolveDatabasePath(explicit?: string): string {
  if (explicit && explicit.trim() !== '') return explicit
  const fromEnv = process.env.GALLERY_DB
  if (fromEnv && fromEnv.trim() !== '') return fromEnv
  return join(homedir(), '.gallery', 'gallery.db')
}

export function withTransaction<T>(db: Database.Database, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE')
  try {
    const result = fn()
    db.exec('COMMIT')
    return result
  } catch (error) {
    try {
      db.exec('ROLLBACK')
    } catch {
      // 回滚失败时保留原始错误，避免掩盖真正的失败原因
    }
    throw error
  }
}

function migrateSchema(db: Database.Database): void {
  const version = db.pragma('user_version', { simple: true }) as number

  if (version > CURRENT_SCHEMA_VERSION) {
    throw new HttpError(
      500,
      'db-version-unsupported',
      `数据库版本 ${version} 高于当前程序支持的版本 ${CURRENT_SCHEMA_VERSION}`,
    )
  }

  if (version < 1) {
    withTransaction(db, () => {
      db.exec(SCHEMA_V1)
      db.pragma(`user_version = ${CURRENT_SCHEMA_VERSION}`)
    })
  }
}

export class DatabaseService {
  readonly path: string
  private db: Database.Database | null = null

  constructor(path: string = resolveDatabasePath()) {
    this.path = path
  }

  get(): Database.Database {
    if (this.db) return this.db

    let db: Database.Database | null = null
    try {
      mkdirSync(dirname(this.path), { recursive: true })
      db = new Database(this.path)
      db.pragma('journal_mode = WAL')
      db.pragma('foreign_keys = ON')
      db.pragma('busy_timeout = 5000')
      migrateSchema(db)
      this.db = db
      return db
    } catch (error) {
      if (db) {
        try {
          db.close()
        } catch {
          // 关闭失败不掩盖原始错误
        }
      }
      if (error instanceof HttpError) throw error
      const reason = error instanceof Error ? error.message : '未知错误'
      throw new HttpError(
        503,
        'database-unavailable',
        `无法打开媒体库数据库（${this.path}）：${reason}`,
      )
    }
  }

  close(): void {
    if (!this.db) return
    try {
      this.db.close()
    } finally {
      this.db = null
    }
  }
}
