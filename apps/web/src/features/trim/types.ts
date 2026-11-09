import type { TrimExportKind, TrimSegment } from '@gallery/core'

export interface TrimOutput {
  name: string
  path: string
  size: number
}

export interface TrimExportRequest {
  path: string
  output: TrimExportKind
  segments: TrimSegment[]
}

export interface TrimExportResponse {
  outputs: TrimOutput[]
  failed: Array<{ index: number; message: string }>
}

type TrimNoticeKind = 'ok' | 'error' | 'info'

export interface TrimNotice {
  kind: TrimNoticeKind
  text: string
}
