import type Database from 'better-sqlite3'
import type {
  LibraryOrganization,
  LibraryType,
  MediaLibrary,
  MigrationState,
} from '@gallery/core'

export interface LibraryRow {
  id: string
  name: string
  name_key: string
  organization: LibraryOrganization
  type: LibraryType | null
  folder: string | null
  folder_key: string | null
  convention: 'jellyfin' | null
  created_at: string
  updated_at: string
}

export interface LibraryInsert {
  id: string
  name: string
  nameKey: string
  organization: LibraryOrganization
  type: LibraryType | null
  folder: string | null
  folderKey: string | null
  convention: 'jellyfin' | null
  createdAt: string
  updatedAt: string
}

export interface MigrationRow {
  id: string
  from_root: string
  to_root: string
  state: MigrationState
  error: string | null
  created_at: string
  updated_at: string
}

export interface MigrationItemRow {
  migration_id: string
  library_id: string
  folder: string
  state: 'pending' | 'copied' | 'cleaned' | 'failed'
  error: string | null
}

export function getSetting(db: Database.Database, key: string): string | null {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  return row?.value ?? null
}

export function setSetting(db: Database.Database, key: string, value: string): void {
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  ).run(key, value)
}

export function deleteSetting(db: Database.Database, key: string): void {
  db.prepare('DELETE FROM settings WHERE key = ?').run(key)
}

export function getMediaRoot(db: Database.Database): string | null {
  return getSetting(db, 'media_root')
}

export function setMediaRoot(db: Database.Database, root: string): void {
  setSetting(db, 'media_root', root)
}

export function getDeletePassword(db: Database.Database): string | null {
  return getSetting(db, 'delete_password')
}

export function setDeletePassword(db: Database.Database, value: string): void {
  setSetting(db, 'delete_password', value)
}

export function listLibraryRows(db: Database.Database): LibraryRow[] {
  return db.prepare('SELECT * FROM libraries ORDER BY created_at ASC').all() as LibraryRow[]
}

export function findLibraryRow(db: Database.Database, id: string): LibraryRow | null {
  const row = db.prepare('SELECT * FROM libraries WHERE id = ?').get(id) as LibraryRow | undefined
  return row ?? null
}

export function findLibraryByNameKey(
  db: Database.Database,
  nameKey: string,
): LibraryRow | null {
  const row = db
    .prepare('SELECT * FROM libraries WHERE name_key = ?')
    .get(nameKey) as LibraryRow | undefined
  return row ?? null
}

export function listLibraryNames(db: Database.Database): string[] {
  const rows = db.prepare('SELECT name FROM libraries').all() as Array<{ name: string }>
  return rows.map((row) => row.name)
}

export function listFolderKeys(db: Database.Database): string[] {
  const rows = db
    .prepare('SELECT folder_key FROM libraries WHERE folder_key IS NOT NULL')
    .all() as Array<{ folder_key: string }>
  return rows.map((row) => row.folder_key)
}

export function countCollectionLibraries(db: Database.Database): number {
  const row = db
    .prepare("SELECT COUNT(*) AS count FROM libraries WHERE organization = 'collection'")
    .get() as { count: number }
  return row.count
}

export function listCollectionFolders(db: Database.Database): Array<{ id: string; folder: string }> {
  const rows = db
    .prepare(
      "SELECT id, folder FROM libraries WHERE organization = 'collection' AND folder IS NOT NULL",
    )
    .all() as Array<{ id: string; folder: string }>
  return rows
}

export function listSourcesForLibraries(
  db: Database.Database,
): Array<{ libraryId: string; path: string }> {
  const rows = db
    .prepare('SELECT library_id, path FROM library_sources ORDER BY library_id, position ASC')
    .all() as Array<{ library_id: string; path: string }>
  return rows.map((row) => ({ libraryId: row.library_id, path: row.path }))
}

export function insertLibrary(db: Database.Database, input: LibraryInsert): void {
  db.prepare(
    `INSERT INTO libraries
      (id, name, name_key, organization, type, folder, folder_key, convention, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    input.id,
    input.name,
    input.nameKey,
    input.organization,
    input.type,
    input.folder,
    input.folderKey,
    input.convention,
    input.createdAt,
    input.updatedAt,
  )
}

export function updateLibraryRow(
  db: Database.Database,
  id: string,
  input: {
    name: string
    nameKey: string
    type: LibraryType | null
    updatedAt: string
  },
): void {
  db.prepare(
    'UPDATE libraries SET name = ?, name_key = ?, type = ?, updated_at = ? WHERE id = ?',
  ).run(input.name, input.nameKey, input.type, input.updatedAt, id)
}

export function deleteLibraryRow(db: Database.Database, id: string): void {
  db.prepare('DELETE FROM libraries WHERE id = ?').run(id)
}

export function listSourcePaths(db: Database.Database, libraryId: string): string[] {
  const rows = db
    .prepare('SELECT path FROM library_sources WHERE library_id = ? ORDER BY position ASC')
    .all(libraryId) as Array<{ path: string }>
  return rows.map((row) => row.path)
}

export function replaceSources(
  db: Database.Database,
  libraryId: string,
  sources: Array<{ path: string; key: string }>,
): void {
  db.prepare('DELETE FROM library_sources WHERE library_id = ?').run(libraryId)
  const insert = db.prepare(
    'INSERT INTO library_sources (library_id, path, path_key, position) VALUES (?, ?, ?, ?)',
  )
  sources.forEach((source, index) => {
    insert.run(libraryId, source.path, source.key, index)
  })
}

export function listLibraries(db: Database.Database): MediaLibrary[] {
  const rows = listLibraryRows(db)
  const sources = new Map<string, string[]>()
  for (const source of listSourcesForLibraries(db)) {
    const list = sources.get(source.libraryId) ?? []
    list.push(source.path)
    sources.set(source.libraryId, list)
  }

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    organization: row.organization,
    type: row.type,
    convention: row.convention,
    folder: row.folder,
    sources: sources.get(row.id) ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }))
}

export function findLibrary(db: Database.Database, id: string): MediaLibrary | null {
  const row = findLibraryRow(db, id)
  if (!row) return null
  return {
    id: row.id,
    name: row.name,
    organization: row.organization,
    type: row.type,
    convention: row.convention,
    folder: row.folder,
    sources: listSourcePaths(db, row.id),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function getLatestMigration(db: Database.Database): MigrationRow | null {
  const row = db
    .prepare('SELECT * FROM migrations ORDER BY created_at DESC LIMIT 1')
    .get() as MigrationRow | undefined
  return row ?? null
}

export function findMigration(db: Database.Database, id: string): MigrationRow | null {
  const row = db.prepare('SELECT * FROM migrations WHERE id = ?').get(id) as
    | MigrationRow
    | undefined
  return row ?? null
}

export function listActiveMigrations(db: Database.Database): MigrationRow[] {
  return db
    .prepare(
      "SELECT * FROM migrations WHERE state IN ('pending','copying','switching','cleanup') ORDER BY created_at ASC",
    )
    .all() as MigrationRow[]
}

export function insertMigration(
  db: Database.Database,
  row: MigrationRow,
): void {
  db.prepare(
    `INSERT INTO migrations (id, from_root, to_root, state, error, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(row.id, row.from_root, row.to_root, row.state, row.error, row.created_at, row.updated_at)
}

export function updateMigrationState(
  db: Database.Database,
  id: string,
  state: MigrationState,
  error: string | null = null,
): void {
  db.prepare(
    'UPDATE migrations SET state = ?, error = ?, updated_at = ? WHERE id = ?',
  ).run(state, error, new Date().toISOString(), id)
}

export function insertMigrationItem(
  db: Database.Database,
  item: MigrationItemRow,
): void {
  db.prepare(
    `INSERT INTO migration_items (migration_id, library_id, folder, state, error)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(item.migration_id, item.library_id, item.folder, item.state, item.error)
}

export function listMigrationItems(
  db: Database.Database,
  migrationId: string,
): MigrationItemRow[] {
  return db
    .prepare(
      'SELECT * FROM migration_items WHERE migration_id = ? ORDER BY rowid ASC',
    )
    .all(migrationId) as MigrationItemRow[]
}

export function updateMigrationItem(
  db: Database.Database,
  migrationId: string,
  libraryId: string,
  state: MigrationItemRow['state'],
  error: string | null = null,
): void {
  db.prepare(
    'UPDATE migration_items SET state = ?, error = ? WHERE migration_id = ? AND library_id = ?',
  ).run(state, error, migrationId, libraryId)
}
