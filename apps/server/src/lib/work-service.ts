import { constants } from 'node:fs'
import { access, lstat, mkdir, readFile, rm } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { randomUUID } from 'node:crypto'

import type Database from 'better-sqlite3'
import {
  inferSubtitleLanguage,
  isWorkAssetRole,
  normalizeWorkName,
  parseSubtitleLanguage,
  sanitizeFolderName,
  srtToWebVtt,
  validateWorkName,
  type AddWorkAssetInput,
  type LibraryView,
  type RenameWorkInput,
  type WorkAssetKind,
  type WorkAssetView,
  type WorkDeleteResult,
  type WorkDetail,
  type WorkIssue,
  type WorkKind,
  type WorkMetadata,
  type WorkStatus,
  type WorkSummary,
} from '@gallery/core'

import { withTransaction } from './db.js'
import { HttpError } from './errors.js'
import { getLibraryView } from './library-service.js'
import { findLibrary } from './library-repository.js'
import { isVideoPath } from './mime.js'
import { parseNfo } from './work-nfo.js'
import {
  deleteWorkAssetRow,
  deleteWorkRow,
  findWorkAssetByRelativePath,
  findWorkAssetByRole,
  findWorkAssetRow,
  findWorkRow,
  insertWorkAsset,
  listWorkAssetRows,
  listWorkRows,
  nextAssetPosition,
  updateWorkMetadataRow,
  updateWorkNameRow,
  type WorkAssetRow,
  type WorkRow,
} from './work-repository.js'
import {
  MAX_SUBTITLE_BYTES,
  copyFileAtomic,
  getCollectionLibraryContext,
  lstatSafe,
  resolveWorkAssetPath,
  resolveWorkPath,
  uniqueFileName,
  validateSourceFile,
  type CollectionLibraryContext,
  type SourceFile,
} from './work-storage.js'

export interface WorkListOptions {
  kind?: WorkKind
  search?: string
  sort?: 'created' | 'name' | 'year'
}

export interface WorkListResult {
  library: LibraryView
  works: WorkSummary[]
}

const STATUS_RANK: Record<WorkStatus, number> = {
  ok: 0,
  partial: 1,
  missing: 2,
  unreadable: 3,
  symlink: 4,
}

function worseStatus(current: WorkStatus, next: WorkStatus): WorkStatus {
  return STATUS_RANK[next] > STATUS_RANK[current] ? next : current
}

function issue(code: string, message: string): WorkIssue {
  return { code, message }
}

function assetView(row: WorkAssetRow): WorkAssetView {
  return {
    id: row.id,
    role: row.role,
    kind: row.kind,
    fileName: basename(row.relative_path),
    originalName: row.original_name,
    size: row.size,
    language: row.language,
    label: row.label,
  }
}

function parseMetadata(row: WorkRow): { metadata: WorkMetadata | null; error: string | null } {
  if (!row.metadata_json) {
    return { metadata: null, error: row.metadata_error }
  }

  try {
    return { metadata: JSON.parse(row.metadata_json) as WorkMetadata, error: row.metadata_error }
  } catch {
    return { metadata: null, error: row.metadata_error ?? '元数据缓存无法解析' }
  }
}

async function probeFile(
  filePath: string,
  label: string,
): Promise<{ status: 'ok' | 'missing' | 'unreadable' | 'symlink'; issue: WorkIssue | null }> {
  let info
  try {
    info = await lstat(filePath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { status: 'missing', issue: issue('asset-missing', `${label}文件不存在`) }
    }
    return { status: 'unreadable', issue: issue('asset-unreadable', `${label}文件不可读`) }
  }

  if (info.isSymbolicLink()) {
    return { status: 'symlink', issue: issue('asset-symlink', `${label}是符号链接`) }
  }
  if (!info.isFile()) {
    return { status: 'unreadable', issue: issue('asset-unreadable', `${label}不是普通文件`) }
  }

  try {
    await access(filePath, constants.R_OK)
    return { status: 'ok', issue: null }
  } catch {
    return { status: 'unreadable', issue: issue('asset-unreadable', `${label}文件不可读`) }
  }
}

interface WorkStatusResult {
  status: WorkStatus
  issues: WorkIssue[]
}

async function computeWorkStatus(
  context: CollectionLibraryContext,
  work: WorkRow,
  assets: WorkAssetRow[],
): Promise<WorkStatusResult> {
  let status: WorkStatus = 'ok'
  const issues: WorkIssue[] = []
  const workPath = resolveWorkPath(context, work.folder)

  let directory
  try {
    directory = await lstat(workPath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {
        status: 'missing',
        issues: [issue('work-directory-missing', '作品目录不存在')],
      }
    }
    return {
      status: 'unreadable',
      issues: [issue('work-directory-unreadable', '作品目录不可读')],
    }
  }

  if (directory.isSymbolicLink()) {
    return { status: 'symlink', issues: [issue('work-directory-symlink', '作品目录是符号链接')] }
  }
  if (!directory.isDirectory()) {
    return {
      status: 'unreadable',
      issues: [issue('work-directory-unreadable', '作品目录不是文件夹')],
    }
  }

  const video = assets.find((asset) => asset.role === 'video')
  if (!video) {
    status = worseStatus(status, 'missing')
    issues.push(issue('video-missing', '主视频不存在'))
  } else {
    const probe = await probeFile(resolveWorkAssetPath(workPath, video.relative_path), '主视频')
    status = worseStatus(status, probe.status === 'ok' ? 'ok' : probe.status)
    if (probe.issue) issues.push(probe.issue)
  }

  for (const asset of assets) {
    if (asset.role === 'video') continue
    const label =
      asset.role === 'nfo'
        ? 'NFO'
        : asset.role === 'poster'
          ? '海报'
          : asset.role === 'backdrop'
            ? '背景图'
            : asset.role === 'subtitle'
              ? '字幕'
              : '花絮'
    const probe = await probeFile(resolveWorkAssetPath(workPath, asset.relative_path), label)
    if (probe.status === 'ok') continue
    status = worseStatus(status, probe.status === 'missing' ? 'partial' : probe.status)
    if (probe.issue) issues.push(probe.issue)
  }

  return { status, issues }
}

async function buildSummary(
  context: CollectionLibraryContext,
  work: WorkRow,
  assets: WorkAssetRow[],
): Promise<WorkSummary> {
  const { status, issues } = await computeWorkStatus(context, work, assets)
  const video = assets.find((asset) => asset.role === 'video')
  const poster = assets.find((asset) => asset.role === 'poster')

  return {
    id: work.id,
    libraryId: work.library_id,
    kind: work.kind,
    name: work.name,
    year: work.year,
    status,
    issues,
    posterUrl: poster ? `/api/works/${work.id}/poster` : null,
    thumbnailUrl: video ? `/api/works/${work.id}/thumbnail` : null,
    subtitleCount: assets.filter((asset) => asset.role === 'subtitle').length,
    extraCount: assets.filter((asset) => asset.role === 'extra').length,
    createdAt: work.created_at,
    updatedAt: work.updated_at,
  }
}

function summaryWithoutDirectory(work: WorkRow, assets: WorkAssetRow[]): WorkSummary {
  const video = assets.find((asset) => asset.role === 'video')
  const poster = assets.find((asset) => asset.role === 'poster')
  return {
    id: work.id,
    libraryId: work.library_id,
    kind: work.kind,
    name: work.name,
    year: work.year,
    status: 'missing',
    issues: [issue('library-unavailable', '媒体库目录不可用')],
    posterUrl: poster ? `/api/works/${work.id}/poster` : null,
    thumbnailUrl: video ? `/api/works/${work.id}/thumbnail` : null,
    subtitleCount: assets.filter((asset) => asset.role === 'subtitle').length,
    extraCount: assets.filter((asset) => asset.role === 'extra').length,
    createdAt: work.created_at,
    updatedAt: work.updated_at,
  }
}

async function getAllWorkAssets(db: Database.Database, workId: string): Promise<WorkAssetRow[]> {
  return listWorkAssetRows(db, workId)
}

export async function listWorks(
  db: Database.Database,
  libraryId: string,
  options: WorkListOptions = {},
): Promise<WorkListResult> {
  const library = findLibrary(db, libraryId)
  if (!library) {
    throw new HttpError(404, 'library-not-found', '媒体库不存在')
  }
  if (library.organization !== 'collection') {
    throw new HttpError(400, 'unsupported-library-organization', '文件规范媒体库不支持作品')
  }
  if (options.kind && options.kind !== 'movie') {
    throw new HttpError(400, 'unsupported-work-kind', '本期只支持电影作品')
  }

  const rows = listWorkRows(db, libraryId).filter(
    (row) => !options.kind || row.kind === options.kind,
  )
  const search = options.search?.trim().toLocaleLowerCase()
  const filtered = search
    ? rows.filter((row) => row.name.toLocaleLowerCase().includes(search))
    : rows

  if (options.sort === 'name') {
    filtered.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN', { numeric: true }))
  } else if (options.sort === 'year') {
    filtered.sort((a, b) => {
      if (a.year === null && b.year === null) return a.name.localeCompare(b.name, 'zh-CN')
      if (a.year === null) return 1
      if (b.year === null) return -1
      return b.year - a.year
    })
  } else {
    filtered.sort((a, b) => b.created_at.localeCompare(a.created_at))
  }

  let context: CollectionLibraryContext | null = null
  try {
    context = await getCollectionLibraryContext(db, libraryId, { requireUsable: false })
  } catch (error) {
    if (!(error instanceof HttpError) || error.code !== 'root-not-configured') {
      throw error
    }
  }

  const works = await Promise.all(
    filtered.map(async (row) => {
      const assets = await getAllWorkAssets(db, row.id)
      return context
        ? buildSummary(context, row, assets)
        : summaryWithoutDirectory(row, assets)
    }),
  )

  return { library: await getLibraryView(db, library), works }
}

export async function getWorkDetail(
  db: Database.Database,
  workId: string,
): Promise<WorkDetail> {
  const work = findWorkRow(db, workId)
  if (!work) {
    throw new HttpError(404, 'work-not-found', '作品不存在')
  }
  let context: CollectionLibraryContext | null = null
  try {
    context = await getCollectionLibraryContext(db, work.library_id, {
      requireUsable: false,
    })
  } catch (error) {
    if (!(error instanceof HttpError) || error.code !== 'root-not-configured') {
      throw error
    }
  }
  const assets = await getAllWorkAssets(db, workId)
  const summary = context
    ? await buildSummary(context, work, assets)
    : summaryWithoutDirectory(work, assets)
  const { metadata, error } = parseMetadata(work)
  const video = assets.find((asset) => asset.role === 'video')
  const nfo = assets.find((asset) => asset.role === 'nfo')
  const poster = assets.find((asset) => asset.role === 'poster')
  const backdrop = assets.find((asset) => asset.role === 'backdrop')
  const subtitles = assets.filter((asset) => asset.role === 'subtitle')
  const extras = assets.filter((asset) => asset.role === 'extra')

  return {
    ...summary,
    metadata,
    metadataError: error,
    video: video ? assetView(video) : null,
    nfo: nfo ? assetView(nfo) : null,
    poster: poster ? assetView(poster) : null,
    backdrop: backdrop ? assetView(backdrop) : null,
    subtitles: subtitles.map(assetView),
    extras: extras.map(assetView),
  }
}

export async function renameWork(
  db: Database.Database,
  workId: string,
  input: RenameWorkInput,
): Promise<WorkDetail> {
  const work = findWorkRow(db, workId)
  if (!work) {
    throw new HttpError(404, 'work-not-found', '作品不存在')
  }
  const name = normalizeWorkName(input.name)
  const issue = validateWorkName(name)[0]
  if (issue) {
    throw new HttpError(400, issue.code, issue.message)
  }
  updateWorkNameRow(db, workId, name, new Date().toISOString())
  return getWorkDetail(db, workId)
}

export async function deleteWork(
  db: Database.Database,
  workId: string,
): Promise<WorkDeleteResult> {
  const work = findWorkRow(db, workId)
  if (!work) {
    throw new HttpError(404, 'work-not-found', '作品不存在')
  }
  const context = await getCollectionLibraryContext(db, work.library_id, {
    requireUsable: false,
  })
  const workPath = resolveWorkPath(context, work.folder)

  let info
  try {
    info = await lstat(workPath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error
    }
  }

  if (info?.isSymbolicLink()) {
    throw new HttpError(403, 'symlink', '作品目录不能是符号链接')
  }
  if (info && !info.isDirectory()) {
    throw new HttpError(409, 'invalid-work-folder', '作品路径不是目录')
  }

  if (info) {
    try {
      await rm(workPath, { recursive: true, force: false })
    } catch (error) {
      return {
        deleted: false,
        failed: [
          {
            path: workPath,
            message: error instanceof Error ? error.message : '删除作品失败',
          },
        ],
      }
    }
  }

  deleteWorkRow(db, workId)
  return { deleted: true, failed: [] }
}

function assetKindForRole(role: string, source: SourceFile): WorkAssetKind {
  if (role === 'nfo' || role === 'subtitle') return 'text'
  if (role === 'extra') return isVideoPath(source.path) ? 'video' : 'image'
  return 'image'
}

async function requireWorkDirectory(workPath: string): Promise<void> {
  const info = await lstatSafe(workPath)
  if (!info) throw new HttpError(404, 'work-directory-missing', '作品目录不存在')
  if (info.isSymbolicLink()) throw new HttpError(403, 'symlink', '作品目录不能是符号链接')
  if (!info.isDirectory()) throw new HttpError(409, 'invalid-work-folder', '作品路径不是目录')
}

async function replaceSingleAsset(
  db: Database.Database,
  work: WorkRow,
  context: CollectionLibraryContext,
  role: 'nfo' | 'poster' | 'backdrop',
  source: SourceFile,
): Promise<WorkAssetView> {
  const workPath = resolveWorkPath(context, work.folder)
  await requireWorkDirectory(workPath)

  const existing = findWorkAssetByRole(db, work.id, role)
  const relativePath =
    role === 'nfo'
      ? 'movie.nfo'
      : `${role}${source.extension}`
  const target = resolveWorkAssetPath(workPath, relativePath)

  await copyFileAtomic(source.path, target, { replace: true })

  let parsed: { metadata: WorkMetadata | null; error: string | null } | null = null
  if (role === 'nfo') {
    parsed = parseNfo(await readFile(target, 'utf8'))
  }

  const now = new Date().toISOString()
  const assetId = randomUUID()
  try {
    withTransaction(db, () => {
      if (existing) deleteWorkAssetRow(db, existing.id)
      insertWorkAsset(db, {
        id: assetId,
        workId: work.id,
        role,
        kind: role === 'nfo' ? 'text' : 'image',
        relativePath,
        originalName: source.name,
        mime: source.mime,
        size: source.size,
        language: null,
        label: null,
        position: 0,
        createdAt: now,
      })
      if (parsed) {
        updateWorkMetadataRow(db, work.id, {
          year: parsed.metadata?.year ?? null,
          metadataJson: parsed.metadata ? JSON.stringify(parsed.metadata) : null,
          metadataError: parsed.error,
          updatedAt: now,
        })
      }
    })
  } catch (error) {
    if (!existing || existing.relative_path !== relativePath) {
      await rm(target, { force: true }).catch(() => undefined)
    }
    throw error
  }

  if (existing && existing.relative_path !== relativePath) {
    await rm(resolveWorkAssetPath(workPath, existing.relative_path), { force: true }).catch(
      () => undefined,
    )
  }

  const row = findWorkAssetRow(db, assetId)!
  return assetView(row)
}

async function addSubtitleAsset(
  db: Database.Database,
  work: WorkRow,
  context: CollectionLibraryContext,
  source: SourceFile,
  languageInput: string | undefined,
): Promise<WorkAssetView> {
  const workPath = resolveWorkPath(context, work.folder)
  await requireWorkDirectory(workPath)

  const info = languageInput
    ? parseSubtitleLanguage(languageInput)
    : inferSubtitleLanguage(source.name, work.folder)
  const tag =
    info.language ??
    (info.label === '默认字幕' ? '' : sanitizeFolderName(info.label))
  const relativePath = tag ? `${work.folder}.${tag}.srt` : `${work.folder}.srt`
  const target = resolveWorkAssetPath(workPath, relativePath)
  const existing = findWorkAssetByRelativePath(db, work.id, relativePath)

  await copyFileAtomic(source.path, target, { replace: true })

  const now = new Date().toISOString()
  const assetId = randomUUID()
  try {
    withTransaction(db, () => {
      if (existing) deleteWorkAssetRow(db, existing.id)
      insertWorkAsset(db, {
        id: assetId,
        workId: work.id,
        role: 'subtitle',
        kind: 'text',
        relativePath,
        originalName: source.name,
        mime: source.mime,
        size: source.size,
        language: info.language,
        label: info.label,
        position: nextAssetPosition(db, work.id, 'subtitle'),
        createdAt: now,
      })
    })
  } catch (error) {
    if (!existing) {
      await rm(target, { force: true }).catch(() => undefined)
    }
    throw error
  }

  return assetView(findWorkAssetRow(db, assetId)!)
}

async function addExtraAsset(
  db: Database.Database,
  work: WorkRow,
  context: CollectionLibraryContext,
  source: SourceFile,
): Promise<WorkAssetView> {
  const workPath = resolveWorkPath(context, work.folder)
  await requireWorkDirectory(workPath)
  const extrasDir = join(workPath, 'extras')
  await mkdir(extrasDir, { recursive: true })
  const fileName = await uniqueFileName(extrasDir, source.name)
  const relativePath = `extras/${fileName}`
  const target = resolveWorkAssetPath(workPath, relativePath)

  await copyFileAtomic(source.path, target, { replace: false })

  const now = new Date().toISOString()
  const assetId = randomUUID()
  try {
    withTransaction(db, () => {
      insertWorkAsset(db, {
        id: assetId,
        workId: work.id,
        role: 'extra',
        kind: assetKindForRole('extra', source),
        relativePath,
        originalName: source.name,
        mime: source.mime,
        size: source.size,
        language: null,
        label: null,
        position: nextAssetPosition(db, work.id, 'extra'),
        createdAt: now,
      })
    })
  } catch (error) {
    await rm(target, { force: true }).catch(() => undefined)
    throw error
  }

  return assetView(findWorkAssetRow(db, assetId)!)
}

export async function addWorkAsset(
  db: Database.Database,
  workId: string,
  input: AddWorkAssetInput,
): Promise<WorkAssetView> {
  const work = findWorkRow(db, workId)
  if (!work) {
    throw new HttpError(404, 'work-not-found', '作品不存在')
  }
  const role: string = input.role
  if (!isWorkAssetRole(role) || role === 'video') {
    throw new HttpError(400, 'invalid-asset-role', '资源类型无效')
  }

  const context = await getCollectionLibraryContext(db, work.library_id, {
    requireUsable: false,
  })

  if (input.role === 'nfo' || input.role === 'poster' || input.role === 'backdrop') {
    const source = await validateSourceFile(
      input.sourcePath,
      input.role === 'nfo' ? 'nfo' : 'image',
    )
    return replaceSingleAsset(db, work, context, input.role, source)
  }

  if (input.role === 'subtitle') {
    const source = await validateSourceFile(input.sourcePath, 'subtitle')
    return addSubtitleAsset(db, work, context, source, input.language)
  }

  const source = await validateSourceFile(input.sourcePath, 'media')
  return addExtraAsset(db, work, context, source)
}

export async function removeWorkAsset(
  db: Database.Database,
  workId: string,
  assetId: string,
): Promise<void> {
  const work = findWorkRow(db, workId)
  if (!work) {
    throw new HttpError(404, 'work-not-found', '作品不存在')
  }
  const asset = findWorkAssetRow(db, assetId)
  if (!asset || asset.work_id !== workId) {
    throw new HttpError(404, 'asset-not-found', '作品资源不存在')
  }

  const context = await getCollectionLibraryContext(db, work.library_id, {
    requireUsable: false,
  })
  const workPath = resolveWorkPath(context, work.folder)
  const target = resolveWorkAssetPath(workPath, asset.relative_path)

  const info = await lstatSafe(target)
  if (info?.isSymbolicLink()) {
    throw new HttpError(403, 'symlink', '资源是符号链接，拒绝操作')
  }
  if (info) {
    try {
      await rm(target, { force: false })
    } catch (error) {
      throw new HttpError(
        409,
        'asset-delete-failed',
        error instanceof Error ? error.message : '删除资源失败',
      )
    }
  }

  withTransaction(db, () => {
    deleteWorkAssetRow(db, asset.id)
    if (asset.role === 'nfo') {
      updateWorkMetadataRow(db, work.id, {
        year: null,
        metadataJson: null,
        metadataError: null,
        updatedAt: new Date().toISOString(),
      })
    }
  })
}

export interface WorkAssetFile {
  work: WorkRow
  asset: WorkAssetRow
  filePath: string
}

export async function getWorkAssetFile(
  db: Database.Database,
  workId: string,
  assetId: string,
): Promise<WorkAssetFile> {
  const work = findWorkRow(db, workId)
  if (!work) {
    throw new HttpError(404, 'work-not-found', '作品不存在')
  }
  const asset = findWorkAssetRow(db, assetId)
  if (!asset || asset.work_id !== workId) {
    throw new HttpError(404, 'asset-not-found', '作品资源不存在')
  }

  const context = await getCollectionLibraryContext(db, work.library_id, {
    requireUsable: false,
  })
  const workPath = resolveWorkPath(context, work.folder)
  const filePath = resolveWorkAssetPath(workPath, asset.relative_path)
  const info = await lstatSafe(filePath)
  if (!info) throw new HttpError(404, 'asset-not-found', '作品资源不存在')
  if (info.isSymbolicLink()) throw new HttpError(403, 'symlink', '不允许访问符号链接')
  if (!info.isFile()) throw new HttpError(400, 'not-a-file', '目标不是文件')

  try {
    await access(filePath, constants.R_OK)
  } catch {
    throw new HttpError(403, 'forbidden', '没有读取资源的权限')
  }

  return { work, asset, filePath }
}

export async function getWorkAssetByRole(
  db: Database.Database,
  workId: string,
  role: 'video' | 'poster' | 'backdrop' | 'nfo',
): Promise<WorkAssetFile> {
  const work = findWorkRow(db, workId)
  if (!work) {
    throw new HttpError(404, 'work-not-found', '作品不存在')
  }
  const asset = findWorkAssetByRole(db, workId, role)
  if (!asset) {
    throw new HttpError(404, 'asset-not-found', '作品资源不存在')
  }
  return getWorkAssetFile(db, workId, asset.id)
}

export async function getWorkNfoText(
  db: Database.Database,
  workId: string,
): Promise<string> {
  const file = await getWorkAssetByRole(db, workId, 'nfo')
  return readFile(file.filePath, 'utf8')
}

export async function getWorkSubtitleVtt(
  db: Database.Database,
  workId: string,
  assetId: string,
): Promise<string> {
  const file = await getWorkAssetFile(db, workId, assetId)
  if (file.asset.role !== 'subtitle') {
    throw new HttpError(400, 'not-a-subtitle', '目标不是字幕文件')
  }
  const info = await lstat(file.filePath)
  if (info.size > MAX_SUBTITLE_BYTES) {
    throw new HttpError(413, 'subtitle-too-large', '字幕文件过大')
  }

  const result = srtToWebVtt(await readFile(file.filePath, 'utf8'))
  if (result.cueCount === 0) {
    throw new HttpError(
      422,
      'subtitle-conversion-failed',
      result.warnings[0] ?? '字幕内容为空',
    )
  }
  return result.vtt
}


