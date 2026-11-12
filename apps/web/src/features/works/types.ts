import type {
  AddWorkAssetInput,
  LibraryView,
  RenameWorkInput,
  WorkAssetKind,
  WorkAssetRole,
  WorkAssetView,
  WorkDeleteResult,
  WorkDetail,
  WorkImportState,
  WorkImportView,
  WorkIssue,
  WorkKind,
  WorkMetadata,
  WorkPerson,
  WorkStatus,
  WorkSummary,
} from '@gallery/core'

export type {
  AddWorkAssetInput,
  LibraryView,
  RenameWorkInput,
  WorkAssetKind,
  WorkAssetRole,
  WorkAssetView,
  WorkDeleteResult,
  WorkDetail,
  WorkImportState,
  WorkImportView,
  WorkIssue,
  WorkKind,
  WorkMetadata,
  WorkPerson,
  WorkStatus,
  WorkSummary,
}

export { WORK_KIND_LABELS, WORK_STATUS_LABELS } from '@gallery/core'

export interface WorkListResponse {
  library: LibraryView
  works: WorkSummary[]
}

export interface CreateWorkImportRequest {
  name: string
  kind: 'movie'
  videoPath: string
}

export const WORK_CHANGED_EVENT = 'gallery:works-changed'

export function notifyWorksChanged(): void {
  window.dispatchEvent(new Event(WORK_CHANGED_EVENT))
}
