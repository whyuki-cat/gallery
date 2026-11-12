export type WorkKind = 'movie' | 'short-video-collection' | 'photo-collection'

export type WorkStatus = 'ok' | 'partial' | 'missing' | 'unreadable' | 'symlink'

export type WorkAssetRole = 'video' | 'nfo' | 'poster' | 'backdrop' | 'subtitle' | 'extra'

export type WorkAssetKind = 'video' | 'image' | 'text'

export type WorkImportState = 'pending' | 'copying' | 'finalizing' | 'succeeded' | 'failed'

export interface WorkIssue {
  code: string
  message: string
}

export interface WorkPerson {
  name: string
  role: string | null
}

export interface WorkMetadata {
  title: string | null
  originalTitle: string | null
  sortTitle: string | null
  year: number | null
  premiered: string | null
  plot: string | null
  outline: string | null
  tagline: string | null
  runtimeMinutes: number | null
  rating: number | null
  genres: string[]
  directors: string[]
  writers: string[]
  actors: WorkPerson[]
  studios: string[]
  mpaa: string | null
  uniqueIds: Array<{ type: string; value: string }>
}

export interface WorkAssetView {
  id: string
  role: WorkAssetRole
  kind: WorkAssetKind
  fileName: string
  originalName: string
  size: number
  language: string | null
  label: string | null
}

export interface WorkSummary {
  id: string
  libraryId: string
  kind: WorkKind
  name: string
  year: number | null
  status: WorkStatus
  issues: WorkIssue[]
  posterUrl: string | null
  thumbnailUrl: string | null
  subtitleCount: number
  extraCount: number
  createdAt: string
  updatedAt: string
}

export interface WorkDetail extends WorkSummary {
  metadata: WorkMetadata | null
  metadataError: string | null
  video: WorkAssetView | null
  nfo: WorkAssetView | null
  poster: WorkAssetView | null
  backdrop: WorkAssetView | null
  subtitles: WorkAssetView[]
  extras: WorkAssetView[]
}

export interface WorkImportView {
  id: string
  state: WorkImportState
  bytesCopied: number
  totalBytes: number
  workId: string | null
  error: string | null
}

export interface CreateMovieWorkInput {
  name: string
  kind: 'movie'
  videoPath: string
}

export interface AddWorkAssetInput {
  role: Exclude<WorkAssetRole, 'video'>
  sourcePath: string
  language?: string
}

export interface RenameWorkInput {
  name: string
}

export interface WorkDeleteResult {
  deleted: boolean
  failed: Array<{ path: string; message: string }>
}

export const WORK_KIND_LABELS: Record<WorkKind, string> = {
  movie: '电影',
  'short-video-collection': '短视频集合',
  'photo-collection': '图片集合',
}

export const WORK_STATUS_LABELS: Record<WorkStatus, string> = {
  ok: '可用',
  partial: '部分资源缺失',
  missing: '文件缺失',
  unreadable: '不可读',
  symlink: '符号链接',
}
