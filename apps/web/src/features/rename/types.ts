import type { ConflictStrategy, RenameIssue, RenameOp } from '@gallery/core'

export interface Location {
  name: string
  path: string
}

export interface Capabilities {
  thumbnail: boolean
  videoThumbnail: boolean
}

export interface RootsResponse {
  platform: string
  roots: Location[]
  common: Location[]
  capabilities: Capabilities
}

export interface FsEntry {
  name: string
  type: 'file' | 'directory'
  extension: string
}

export interface ActivateModifiers {
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
}

export interface DirectoryListing {
  path: string
  parent: string | null
  entries: FsEntry[]
}

export interface StatItem {
  path: string
  name: string
  size: number | null
  mtimeMs: number | null
  birthtimeMs: number | null
  directory: boolean
  error: string | null
}

export interface ApplyRequest {
  dir: string
  names: string[]
  operations: RenameOp[]
  strategy: ConflictStrategy
}

export interface SingleRenameRequest {
  dir: string
  from: string
  to: string
}

export interface DeleteRequest {
  dir: string
  names: string[]
}

export interface DeleteResponse {
  deleted: string[]
  failed: Array<{ name: string; message: string }>
}

export interface PlannedItem {
  source: string
  target: string
  issues: RenameIssue[]
  skipped: boolean
}

export interface ApplyResponse {
  renamed: Array<{ from: string; to: string }>
  skipped: string[]
  failed: Array<{ from: string; to: string; message: string }>
  rolledBack: boolean
  warnings?: RenameIssue[]
  message?: string
}

export type NoticeKind = 'ok' | 'error' | 'info'

export interface Notice {
  kind: NoticeKind
  text: string
}
