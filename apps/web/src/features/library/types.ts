import type {
  LibraryOrganization,
  LibraryOverview,
  LibraryStatus,
  LibraryType,
  LibraryView,
  MigrationState,
  MigrationView,
  RootStatus,
} from '@gallery/core'

export type {
  LibraryOrganization,
  LibraryOverview,
  LibraryStatus,
  LibraryType,
  LibraryView,
  MigrationState,
  MigrationView,
  RootStatus,
}

export interface LibraryCreateRequest {
  name: string
  organization: LibraryOrganization
  type?: LibraryType | null
  sources?: string[]
}

export interface LibraryUpdateRequest {
  name?: string
  type?: LibraryType | null
  sources?: string[]
}

export interface SetMediaRootRequest {
  mediaRoot: string
  create?: boolean
}

export interface StartMigrationRequest {
  mediaRoot: string
  password: string
}

export interface SetDeletePasswordRequest {
  currentPassword?: string
  newPassword: string
}

export interface DeleteLibraryRequest {
  password?: string
}

export interface DeleteLibraryResponse {
  deleted: boolean
  retainedSources: string[]
  failed: Array<{ path: string; message: string }>
}

export interface MigrationStartResponse {
  migrationId: string
}

export const LIBRARY_CHANGED_EVENT = 'gallery:library-changed'

export function notifyLibraryChanged(): void {
  window.dispatchEvent(new Event(LIBRARY_CHANGED_EVENT))
}

export const ORGANIZATION_LABELS: Record<LibraryOrganization, string> = {
  collection: '作品集',
  convention: '文件规范',
}

export const TYPE_LABELS: Record<LibraryType, string> = {
  movie: '电影',
  series: '电视剧',
  photo: '图片',
}

export const STATUS_LABELS: Record<LibraryStatus, string> = {
  ok: '可用',
  partial: '部分不可用',
  missing: '路径缺失',
  unreadable: '不可读',
  symlink: '符号链接',
}

export function isActiveMigration(state: MigrationState): boolean {
  return (
    state === 'pending' ||
    state === 'copying' ||
    state === 'switching' ||
    state === 'cleanup'
  )
}
