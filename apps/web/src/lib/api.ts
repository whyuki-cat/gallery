import type {
  ApplyRequest,
  ApplyResponse,
  DirectoryListing,
  RenameRecord,
  RootsResponse,
  SingleRenameRequest,
  StatItem,
  UndoResponse,
} from '@/features/rename/types'

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

  undo: () =>
    request<UndoResponse>('/api/rename/undo', {
      method: 'POST',
      body: '{}',
    }),

  history: (limit = 20) =>
    request<{ items: RenameRecord[] }>(`/api/rename/history?limit=${limit}`),
}

export function rawUrl(path: string): string {
  return `/api/fs/raw?path=${encodeURIComponent(path)}`
}

export function thumbUrl(path: string, width = 320): string {
  return `/api/fs/thumb?path=${encodeURIComponent(path)}&w=${width}`
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
