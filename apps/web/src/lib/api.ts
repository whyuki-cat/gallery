import type {
  DeleteLibraryRequest,
  DeleteLibraryResponse,
  LibraryCreateRequest,
  LibraryOverview,
  LibraryUpdateRequest,
  LibraryView,
  MigrationStartResponse,
  MigrationView,
  SetDeletePasswordRequest,
  SetMediaRootRequest,
  StartMigrationRequest,
} from '@/features/library/types'
import type {
  ApplyRequest,
  ApplyResponse,
  DeleteRequest,
  DeleteResponse,
  DirectoryListing,
  RootsResponse,
  SingleRenameRequest,
  StatItem,
} from '@/features/rename/types'
import type { TrimExportRequest, TrimExportResponse } from '@/features/trim/types'
import type {
  AddWorkAssetInput,
  CreateWorkImportRequest,
  RenameWorkInput,
  WorkAssetView,
  WorkDeleteResult,
  WorkDetail,
  WorkImportView,
  WorkListResponse,
} from '@/features/works/types'

export class ApiError extends Error {
  readonly code: string
  readonly status: number

  constructor(message: string, code: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase()
  const headers = new Headers(init.headers)

  if (method !== 'GET' && method !== 'HEAD') {
    headers.set('x-gallery-client', '1')
  }
  if (init.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  let response: Response
  try {
    response = await fetch(path, { ...init, headers })
  } catch {
    throw new ApiError('无法连接到本地服务', 'network', 0)
  }

  const text = await response.text()
  let payload: unknown = null

  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      payload = null
    }
  }

  if (!response.ok) {
    const record = (payload ?? {}) as { message?: string; error?: string; items?: unknown }
    throw new ApiError(
      record.message ?? `请求失败（${response.status}）`,
      record.error ?? 'unknown',
      response.status,
    )
  }

  return payload as T
}

async function requestText(path: string, init: RequestInit = {}): Promise<string> {
  let response: Response
  try {
    response = await fetch(path, init)
  } catch {
    throw new ApiError('无法连接到本地服务', 'network', 0)
  }

  const text = await response.text()
  if (!response.ok) {
    let payload: unknown = null
    try {
      payload = JSON.parse(text)
    } catch {
      payload = null
    }
    const record = (payload ?? {}) as { message?: string; error?: string }
    throw new ApiError(
      record.message ?? `请求失败（${response.status}）`,
      record.error ?? 'unknown',
      response.status,
    )
  }
  return text
}

export const api = {
  roots: () => request<RootsResponse>('/api/fs/roots'),

  list: (path: string, showHidden: boolean) =>
    request<DirectoryListing>(
      `/api/fs/list?path=${encodeURIComponent(path)}&hidden=${showHidden ? '1' : '0'}`,
    ),

  stats: (paths: string[]) =>
    request<{ items: StatItem[] }>('/api/fs/stats', {
      method: 'POST',
      body: JSON.stringify({ paths }),
    }),

  deleteFiles: (body: DeleteRequest) =>
    request<DeleteResponse>('/api/fs/delete', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  apply: (body: ApplyRequest) =>
    request<ApplyResponse>('/api/rename/apply', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  renameOne: (body: SingleRenameRequest) =>
    request<ApplyResponse>('/api/rename/single', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  trimExport: (body: TrimExportRequest) =>
    request<TrimExportResponse>('/api/trim/export', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  libraryOverview: () => request<LibraryOverview>('/api/library/overview'),

  setMediaRoot: (body: SetMediaRootRequest) =>
    request<{ ok: true }>('/api/library/config', {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  startMigration: (body: StartMigrationRequest) =>
    request<MigrationStartResponse>('/api/library/config/migrate', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  migrationStatus: (id: string) =>
    request<MigrationView>(`/api/library/config/migrate/${encodeURIComponent(id)}`),

  setDeletePassword: (body: SetDeletePasswordRequest) =>
    request<{ configured: true }>('/api/library/security', {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  createLibrary: (body: LibraryCreateRequest) =>
    request<LibraryView>('/api/library/libraries', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  updateLibrary: (id: string, body: LibraryUpdateRequest) =>
    request<LibraryView>(`/api/library/libraries/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  deleteLibrary: (id: string, body: DeleteLibraryRequest) =>
    request<DeleteLibraryResponse>(
      `/api/library/libraries/${encodeURIComponent(id)}/delete`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
    ),

  listWorks: (
    libraryId: string,
    options: { kind?: string; q?: string; sort?: string } = {},
  ) => {
    const params = new URLSearchParams()
    if (options.kind) params.set('kind', options.kind)
    if (options.q) params.set('q', options.q)
    if (options.sort) params.set('sort', options.sort)
    const query = params.size > 0 ? `?${params.toString()}` : ''
    return request<WorkListResponse>(
      `/api/library/${encodeURIComponent(libraryId)}/works${query}`,
    )
  },

  startWorkImport: (libraryId: string, body: CreateWorkImportRequest) =>
    request<WorkImportView>(
      `/api/library/${encodeURIComponent(libraryId)}/works/imports`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
    ),

  workImport: (importId: string) =>
    request<WorkImportView>(`/api/works/imports/${encodeURIComponent(importId)}`),

  work: (workId: string) =>
    request<WorkDetail>(`/api/works/${encodeURIComponent(workId)}`),

  renameWork: (workId: string, body: RenameWorkInput) =>
    request<WorkDetail>(`/api/works/${encodeURIComponent(workId)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  deleteWork: (workId: string) =>
    request<WorkDeleteResult>(`/api/works/${encodeURIComponent(workId)}/delete`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),

  addWorkAsset: (workId: string, body: AddWorkAssetInput) =>
    request<{ asset: WorkAssetView }>(
      `/api/works/${encodeURIComponent(workId)}/assets`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
    ),

  removeWorkAsset: (workId: string, assetId: string) =>
    request<{ ok: true }>(
      `/api/works/${encodeURIComponent(workId)}/assets/${encodeURIComponent(assetId)}`,
      { method: 'DELETE' },
    ),

  workNfo: (workId: string) => requestText(workNfoUrl(workId)),
}

export function rawUrl(path: string): string {
  return `/api/fs/raw?path=${encodeURIComponent(path)}`
}

export function thumbUrl(path: string, width = 320): string {
  return `/api/fs/thumb?path=${encodeURIComponent(path)}&w=${width}`
}

function workBaseUrl(workId: string): string {
  return `/api/works/${encodeURIComponent(workId)}`
}

export function workVideoUrl(workId: string): string {
  return `${workBaseUrl(workId)}/video`
}

export function workThumbnailUrl(workId: string, width = 480): string {
  return `${workBaseUrl(workId)}/thumbnail?w=${width}`
}

export function workPosterUrl(workId: string, width = 600): string {
  return `${workBaseUrl(workId)}/poster?w=${width}`
}

export function workBackdropUrl(workId: string, width = 1600): string {
  return `${workBaseUrl(workId)}/backdrop?w=${width}`
}

export function workNfoUrl(workId: string): string {
  return `${workBaseUrl(workId)}/nfo`
}

export function workSubtitleUrl(workId: string, assetId: string): string {
  return `${workBaseUrl(workId)}/subtitles/${encodeURIComponent(assetId)}`
}

export function workAssetUrl(workId: string, assetId: string): string {
  return `${workBaseUrl(workId)}/assets/${encodeURIComponent(assetId)}`
}

export function workAssetThumbUrl(
  workId: string,
  assetId: string,
  width = 320,
): string {
  return `${workBaseUrl(workId)}/assets/${encodeURIComponent(assetId)}/thumb?w=${width}`
}

export function normalizePath(value: string): string {
  if (/^[A-Za-z]:/.test(value) || value.includes('\\')) {
    return value.replace(/\//g, '\\')
  }
  return value
}

export function joinPath(dir: string, name: string): string {
  if (!dir) return name
  const normalized = normalizePath(dir)
  const separator = normalized.includes('\\') ? '\\' : '/'
  return normalized.endsWith(separator) ? `${normalized}${name}` : `${normalized}${separator}${name}`
}
