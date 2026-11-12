import type Database from 'better-sqlite3'
import type { WorkAssetKind, WorkAssetRole, WorkKind } from '@gallery/core'

export interface WorkRow {
  id: string
  library_id: string
  kind: WorkKind
  name: string
  folder: string
  folder_key: string
  year: number | null
  metadata_json: string | null
  metadata_error: string | null
  created_at: string
  updated_at: string
}

export interface WorkInsert {
  id: string
  libraryId: string
  kind: WorkKind
  name: string
  folder: string
  folderKey: string
  year: number | null
  metadataJson: string | null
  metadataError: string | null
  createdAt: string
  updatedAt: string
}

export interface WorkAssetRow {
  id: string
  work_id: string
  role: WorkAssetRole
  kind: WorkAssetKind
  relative_path: string
  original_name: string
  mime: string
  size: number
  language: string | null
  label: string | null
  position: number
  created_at: string
}

export interface WorkAssetInsert {
  id: string
  workId: string
  role: WorkAssetRole
  kind: WorkAssetKind
  relativePath: string
  originalName: string
  mime: string
  size: number
  language: string | null
  label: string | null
  position: number
  createdAt: string
}

export function insertWork(db: Database.Database, input: WorkInsert): void {
  db.prepare(
    `INSERT INTO works
      (id, library_id, kind, name, folder, folder_key, year, metadata_json, metadata_error, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    input.id,
    input.libraryId,
    input.kind,
    input.name,
    input.folder,
    input.folderKey,
    input.year,
    input.metadataJson,
    input.metadataError,
    input.createdAt,
    input.updatedAt,
  )
}

export function findWorkRow(db: Database.Database, id: string): WorkRow | null {
  const row = db.prepare('SELECT * FROM works WHERE id = ?').get(id) as WorkRow | undefined
  return row ?? null
}

export function listWorkRows(db: Database.Database, libraryId: string): WorkRow[] {
  return db
    .prepare('SELECT * FROM works WHERE library_id = ? ORDER BY created_at ASC')
    .all(libraryId) as WorkRow[]
}

export function listWorkFolderKeys(db: Database.Database, libraryId: string): string[] {
  const rows = db
    .prepare('SELECT folder_key FROM works WHERE library_id = ?')
    .all(libraryId) as Array<{ folder_key: string }>
  return rows.map((row) => row.folder_key)
}

export function countWorks(db: Database.Database, libraryId: string): number {
  const row = db
    .prepare('SELECT COUNT(*) AS count FROM works WHERE library_id = ?')
    .get(libraryId) as { count: number }
  return row.count
}

export function updateWorkNameRow(
  db: Database.Database,
  id: string,
  name: string,
  updatedAt: string,
): void {
  db.prepare('UPDATE works SET name = ?, updated_at = ? WHERE id = ?').run(name, updatedAt, id)
}

export function updateWorkMetadataRow(
  db: Database.Database,
  id: string,
  metadata: {
    year: number | null
    metadataJson: string | null
    metadataError: string | null
    updatedAt: string
  },
): void {
  db.prepare(
    'UPDATE works SET year = ?, metadata_json = ?, metadata_error = ?, updated_at = ? WHERE id = ?',
  ).run(
    metadata.year,
    metadata.metadataJson,
    metadata.metadataError,
    metadata.updatedAt,
    id,
  )
}

export function deleteWorkRow(db: Database.Database, id: string): void {
  db.prepare('DELETE FROM works WHERE id = ?').run(id)
}

export function insertWorkAsset(db: Database.Database, input: WorkAssetInsert): void {
  db.prepare(
    `INSERT INTO work_assets
      (id, work_id, role, kind, relative_path, original_name, mime, size, language, label, position, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    input.id,
    input.workId,
    input.role,
    input.kind,
    input.relativePath,
    input.originalName,
    input.mime,
    input.size,
    input.language,
    input.label,
    input.position,
    input.createdAt,
  )
}

export function findWorkAssetRow(db: Database.Database, id: string): WorkAssetRow | null {
  const row = db.prepare('SELECT * FROM work_assets WHERE id = ?').get(id) as
    | WorkAssetRow
    | undefined
  return row ?? null
}

export function listWorkAssetRows(db: Database.Database, workId: string): WorkAssetRow[] {
  return db
    .prepare(
      'SELECT * FROM work_assets WHERE work_id = ? ORDER BY role ASC, position ASC, created_at ASC',
    )
    .all(workId) as WorkAssetRow[]
}

export function findWorkAssetByRole(
  db: Database.Database,
  workId: string,
  role: WorkAssetRole,
): WorkAssetRow | null {
  const row = db
    .prepare('SELECT * FROM work_assets WHERE work_id = ? AND role = ? LIMIT 1')
    .get(workId, role) as WorkAssetRow | undefined
  return row ?? null
}

export function findWorkAssetByRelativePath(
  db: Database.Database,
  workId: string,
  relativePath: string,
): WorkAssetRow | null {
  const row = db
    .prepare('SELECT * FROM work_assets WHERE work_id = ? AND relative_path = ? LIMIT 1')
    .get(workId, relativePath) as WorkAssetRow | undefined
  return row ?? null
}

export function nextAssetPosition(
  db: Database.Database,
  workId: string,
  role: WorkAssetRole,
): number {
  const row = db
    .prepare('SELECT COALESCE(MAX(position), -1) + 1 AS next FROM work_assets WHERE work_id = ? AND role = ?')
    .get(workId, role) as { next: number }
  return row.next
}

export function deleteWorkAssetRow(db: Database.Database, id: string): void {
  db.prepare('DELETE FROM work_assets WHERE id = ?').run(id)
}

export function deleteWorkAssetsByRole(
  db: Database.Database,
  workId: string,
  role: WorkAssetRole,
): void {
  db.prepare('DELETE FROM work_assets WHERE work_id = ? AND role = ?').run(workId, role)
}
