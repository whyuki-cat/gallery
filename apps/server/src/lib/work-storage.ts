import { constants } from 'node:fs'
import {
  access,
  copyFile,
  lstat,
  mkdir,
  readdir,
  rename,
  rm,
} from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { basename, dirname, extname, isAbsolute, join, resolve } from 'node:path'

import type Database from 'better-sqlite3'
import { isValidFolderSegment, sanitizeFolderName, type MediaLibrary } from '@gallery/core'

import { HttpError } from './errors.js'
import { getMediaRoot, findLibrary } from './library-repository.js'
import { assertRootUsable } from './library-service.js'
import { isImagePath, isVideoPath, mimeForPath } from './mime.js'
import { resolveUserPath, isInside } from './paths.js'

export const WORK_IMPORT_PREFIX = '.gallery-import-'
export const MAX_NFO_BYTES = 2 * 1024 * 1024
export const MAX_SUBTITLE_BYTES = 5 * 1024 * 1024
export const MAX_IMAGE_BYTES = 30 * 1024 * 1024

export interface CollectionLibraryContext {
  library: MediaLibrary
  root: string
  libraryPath: string
}

export interface SourceFile {
  path: string
  name: string
  extension: string
  size: number
  mime: string
}

export type SourceFileKind = 'video' | 'image' | 'nfo' | 'subtitle' | 'media'

export async function lstatSafe(path: string) {
  try {
    return await lstat(path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

export async function getCollectionLibraryContext(
  db: Database.Database,
  libraryId: string,
  options: { requireUsable?: boolean } = {},
): Promise<CollectionLibraryContext> {
  const library = findLibrary(db, libraryId)
  if (!library) {
    throw new HttpError(404, 'library-not-found', '媒体库不存在')
  }
  if (library.organization !== 'collection') {
    throw new HttpError(400, 'unsupported-library-organization', '文件规范媒体库不支持作品')
  }
  if (!library.folder) {
    throw new HttpError(500, 'invalid-library', '作品集媒体库缺少目录')
  }

  const requireUsable = options.requireUsable !== false
  const root = requireUsable ? await assertRootUsable(db) : getMediaRoot(db)
  if (!root) {
    throw new HttpError(400, 'root-not-configured', '请先在设置中配置媒体根路径')
  }

  const libraryPath = resolve(root, library.folder)
  if (!isInside(root, libraryPath) || libraryPath === root) {
    throw new HttpError(400, 'invalid-library', '作品集媒体库目录非法')
  }

  if (requireUsable) {
    const info = await lstatSafe(libraryPath)
    if (!info) {
      throw new HttpError(400, 'library-unavailable', '作品集媒体库目录不存在')
    }
    if (info.isSymbolicLink()) {
      throw new HttpError(403, 'symlink', '作品集媒体库目录不能是符号链接')
    }
    if (!info.isDirectory()) {
      throw new HttpError(400, 'library-unavailable', '作品集媒体库路径不是目录')
    }

    try {
      await access(libraryPath, constants.R_OK | constants.W_OK)
    } catch {
      throw new HttpError(400, 'library-unavailable', '作品集媒体库目录不可读写')
    }
  }

  return { library, root, libraryPath }
}

export function resolveWorkPath(context: CollectionLibraryContext, folder: string): string {
  if (!isValidFolderSegment(folder)) {
    throw new HttpError(400, 'invalid-work-folder', '作品目录名非法')
  }
  const target = resolve(context.libraryPath, folder)
  if (!isInside(context.libraryPath, target) || target === context.libraryPath) {
    throw new HttpError(400, 'invalid-work-folder', '作品目录超出媒体库范围')
  }
  return target
}

export function resolveWorkAssetPath(workPath: string, relativePath: string): string {
  if (
    relativePath.trim() === '' ||
    relativePath.includes('\0') ||
    isAbsolute(relativePath) ||
    relativePath.startsWith('..') ||
    relativePath.includes('/../') ||
    relativePath.includes('\\..\\')
  ) {
    throw new HttpError(400, 'invalid-asset-path', '作品资源路径非法')
  }

  const target = resolve(workPath, relativePath)
  if (!isInside(workPath, target) || target === workPath) {
    throw new HttpError(403, 'invalid-asset-path', '作品资源超出作品目录')
  }
  return target
}

export function relativeVideoName(folder: string, extension: string): string {
  return `${folder}${extension}`
}

export function sanitizeFileName(value: string): string {
  const name = basename(value)
  const extension = extname(name).toLocaleLowerCase()
  const base = sanitizeFolderName(name.slice(0, name.length - extension.length))
  return `${base}${extension}`
}

export async function uniqueFileName(dir: string, originalName: string): Promise<string> {
  const safe = sanitizeFileName(originalName)
  const extension = extname(safe)
  const base = safe.slice(0, safe.length - extension.length)

  for (let index = 1; index < 10_000; index += 1) {
    const candidate = index === 1 ? safe : `${base}-${index}${extension}`
    if (!(await lstatSafe(join(dir, candidate)))) return candidate
  }

  return `${base}-${Date.now()}${extension}`
}

export async function validateSourceFile(
  input: unknown,
  kind: SourceFileKind,
): Promise<SourceFile> {
  const path = resolveUserPath(input)
  const info = await lstatSafe(path)

  if (!info) {
    throw new HttpError(400, 'source-missing', '源文件不存在')
  }
  if (info.isSymbolicLink()) {
    throw new HttpError(403, 'symlink', '源文件不能是符号链接')
  }
  if (!info.isFile()) {
    throw new HttpError(400, 'source-not-file', '源路径不是普通文件')
  }

  try {
    await access(path, constants.R_OK)
  } catch {
    throw new HttpError(400, 'source-unreadable', '源文件不可读')
  }

  const extension = extname(path).toLocaleLowerCase()
  const isVideo = isVideoPath(path)
  const isImage = isImagePath(path)
  const isNfo = extension === '.nfo'
  const isSubtitle = extension === '.srt'

  if (kind === 'video' && !isVideo) {
    throw new HttpError(400, 'unsupported-source', '请选择受支持的视频文件')
  }
  if (kind === 'image' && !isImage) {
    throw new HttpError(400, 'unsupported-source', '请选择受支持的图片文件')
  }
  if (kind === 'nfo' && !isNfo) {
    throw new HttpError(400, 'unsupported-source', '请选择 .nfo 文件')
  }
  if (kind === 'subtitle' && !isSubtitle) {
    throw new HttpError(400, 'unsupported-source', '请选择 .srt 字幕文件')
  }
  if (kind === 'media' && !isVideo && !isImage) {
    throw new HttpError(400, 'unsupported-source', '花絮只支持视频或图片')
  }

  if (info.size === 0 && kind !== 'nfo') {
    throw new HttpError(400, 'empty-source', '源文件为空')
  }
  if (kind === 'nfo' && info.size > MAX_NFO_BYTES) {
    throw new HttpError(400, 'source-too-large', 'NFO 文件不能超过 2 MB')
  }
  if (kind === 'subtitle' && info.size > MAX_SUBTITLE_BYTES) {
    throw new HttpError(400, 'source-too-large', '字幕文件不能超过 5 MB')
  }
  if (kind === 'image' && info.size > MAX_IMAGE_BYTES) {
    throw new HttpError(400, 'source-too-large', '图片文件不能超过 30 MB')
  }

  return {
    path,
    name: basename(path),
    extension,
    size: info.size,
    mime: mimeForPath(path),
  }
}

/**
 * 先复制到同目录临时文件，再原子替换目标，避免写坏已有资源。
 */
export async function copyFileAtomic(
  source: string,
  target: string,
  options: { replace?: boolean } = {},
): Promise<void> {
  await mkdir(dirname(target), { recursive: true })
  const temporary = join(
    dirname(target),
    `.gallery-copy-${randomUUID()}${extname(target)}`,
  )

  try {
    await copyFile(source, temporary, constants.COPYFILE_EXCL)
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined)
    throw error
  }

  let backup: string | null = null
  try {
    const existing = await lstatSafe(target)
    if (existing && !options.replace) {
      throw new HttpError(409, 'asset-exists', '目标资源已存在')
    }
    if (existing) {
      backup = `${target}.gallery-old-${randomUUID()}`
      await rename(target, backup)
    }

    await rename(temporary, target)

    if (backup) {
      await rm(backup, { force: true })
    }
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined)
    if (backup) {
      try {
        await rm(target, { force: true })
        await rename(backup, target)
      } catch {
        // 恢复失败时保留原始错误，调用方会报告资源异常
      }
    }
    throw error
  }
}

export async function listWorkDirectoryKeys(libraryPath: string): Promise<string[]> {
  try {
    const entries = await readdir(libraryPath, { withFileTypes: true })
    return entries
      .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
      .map((entry) => entry.name.toLocaleLowerCase())
  } catch {
    return []
  }
}


