export type LibraryOrganization = 'collection' | 'convention'

export type LibraryType = 'movie' | 'series' | 'photo'

export type RootStatus =
  | 'unset'
  | 'ok'
  | 'missing'
  | 'not-directory'
  | 'unreadable'
  | 'unwritable'
  | 'symlink'

export type LibraryStatus = 'ok' | 'partial' | 'missing' | 'unreadable' | 'symlink'

export type MigrationState =
  | 'pending'
  | 'copying'
  | 'switching'
  | 'cleanup'
  | 'cleanup_failed'
  | 'succeeded'
  | 'failed'
  | 'interrupted'

export interface LibraryCreateInput {
  name: string
  organization: LibraryOrganization
  type?: LibraryType | null
  sources?: string[]
}

export interface LibraryUpdateInput {
  name?: string
  type?: LibraryType | null
  sources?: string[]
}

export interface MediaLibrary {
  id: string
  name: string
  organization: LibraryOrganization
  type: LibraryType | null
  convention: 'jellyfin' | null
  folder: string | null
  sources: string[]
  createdAt: string
  updatedAt: string
}

export interface LibraryView {
  id: string
  name: string
  organization: LibraryOrganization
  type: LibraryType | null
  convention: 'jellyfin' | null
  sources: string[]
  createdAt: string
  updatedAt: string
  status: LibraryStatus
  issues: string[]
}

export interface MigrationView {
  id: string
  state: MigrationState
  fromRoot: string
  toRoot: string
  current: number
  total: number
  currentLibraryName: string | null
  error: string | null
  warnings: string[]
}

export interface LibraryOverview {
  databasePath: string
  mediaRoot: string | null
  rootStatus: RootStatus
  deletePasswordConfigured: boolean
  migration: MigrationView | null
  libraries: LibraryView[]
}

export interface LibraryIssue {
  code: string
  message: string
}

export const LIBRARY_ORGANIZATION_LABELS: Record<LibraryOrganization, string> = {
  collection: '作品集',
  convention: '文件规范',
}

export const LIBRARY_TYPE_LABELS: Record<LibraryType, string> = {
  movie: '电影',
  series: '电视剧',
  photo: '图片',
}
