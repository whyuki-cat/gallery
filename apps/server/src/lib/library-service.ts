import { constants } from 'node:fs'
import { access, lstat, mkdir, rmdir, rm } from 'node:fs/promises'
import { homedir, platform } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'

import type Database from 'better-sqlite3'
import {
  generateFolderName,
  libraryNameKey,
  normalizeLibraryName,
  summarizeLibraryStatus,
  validateLibraryName,
  type LibraryCreateInput,
  type LibraryOverview,
  type LibraryStatus,
  type LibraryType,
  type LibraryUpdateInput,
  type LibraryView,
  type MediaLibrary,
  type MigrationView,
  type RootStatus,
} from '@gallery/core'

import { HttpError } from './errors.js'
import { resolveUserPath } from './paths.js'
import { withTransaction } from './db.js'
import {
  countCollectionLibraries,
  deleteLibraryRow,
  findLibrary,
  getDeletePassword,
  getMediaRoot,
  insertLibrary,
  listCollectionFolders,
  listFolderKeys,
  listLibraries,
  listLibraryRows,
  listSourcesForLibraries,
  replaceSources,
  setMediaRoot,
  updateLibraryRow,
} from './library-repository.js'
import { assertDeletePassword } from './security-service.js'

interface NormalizedSource {
  path: string
  key: string
}

export interface DeleteLibraryResult {
  deleted: boolean
  retainedSources: string[]
  failed: Array<{ path: string; message: string }>
}

function normalizeForCompare(value: string): string {
  const resolved = resolve(value)
  return platform() === 'win32' ? resolved.toLocaleLowerCase() : resolved
}

function samePath(a: string, b: string): boolean {
  return normalizeForCompare(a) === normalizeForCompare(b)
}

function pathKey(value: string): string {
  return normalizeForCompare(value)
}

function contains(parent: string, child: string): boolean {
  const rel = relative(resolve(parent), resolve(child))
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

function overlaps(a: string, b: string): boolean {
  return contains(a, b) || contains(b, a)
}

function isDirectChild(parent: string, child: string): boolean {
  const rel = relative(resolve(parent), resolve(child))
  return (
    rel !== '' &&
    !rel.startsWith('..') &&
    !isAbsolute(rel) &&
    !rel.includes('/') &&
    !rel.includes('\\')
  )
}

async function lstatSafe(path: string) {
  try {
    return await lstat(path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

function statusMessage(status: LibraryStatus, path: string): string {
  switch (status) {
    case 'missing':
      return `目录不存在：${path}`
    case 'unreadable':
      return `目录不可读：${path}`
    case 'symlink':
      return `目录是符号链接：${path}`
    default:
      return ''
  }
}

async function probePath(path: string): Promise<LibraryStatus> {
  let info
  try {
    info = await lstat(path)
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'missing' : 'unreadable'
  }

  if (info.isSymbolicLink()) return 'symlink'
  if (!info.isDirectory()) return 'unreadable'

  try {
    await access(path, constants.R_OK)
    return 'ok'
  } catch {
    return 'unreadable'
  }
}

export async function probeRoot(path: string): Promise<RootStatus> {
  let info
  try {
    info = await lstat(path)
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'missing' : 'unreadable'
  }

  if (info.isSymbolicLink()) return 'symlink'
  if (!info.isDirectory()) return 'not-directory'

  try {
    await access(path, constants.R_OK)
  } catch {
    return 'unreadable'
  }
  try {
    await access(path, constants.W_OK)
  } catch {
    return 'unwritable'
  }
  return 'ok'
}

export async function getRootStatus(db: Database.Database): Promise<RootStatus> {
  const root = getMediaRoot(db)
  if (!root) return 'unset'
  return probeRoot(root)
}

async function validateRootPath(input: unknown, create: boolean): Promise<string> {
  const root = resolveUserPath(input)
  const info = await lstatSafe(root)

  if (info?.isSymbolicLink()) {
    throw new HttpError(403, 'symlink', '媒体根路径不能是符号链接')
  }

  if (!info) {
    if (!create) {
      throw new HttpError(400, 'root-unavailable', '媒体根路径不存在')
    }
    await mkdir(root, { recursive: true })
    const created = await lstat(root)
    if (created.isSymbolicLink() || !created.isDirectory()) {
      throw new HttpError(400, 'root-unavailable', '媒体根路径不是目录')
    }
  } else if (!info.isDirectory()) {
    throw new HttpError(400, 'root-unavailable', '媒体根路径不是目录')
  }

  try {
    await access(root, constants.R_OK | constants.W_OK)
  } catch {
    throw new HttpError(400, 'root-unavailable', '媒体根路径不可读写')
  }

  return root
}

export async function assertRootUsable(db: Database.Database): Promise<string> {
  const root = getMediaRoot(db)
  if (!root) {
    throw new HttpError(400, 'root-not-configured', '请先在设置中配置媒体根路径')
  }

  const status = await probeRoot(root)
  if (status === 'symlink') {
    throw new HttpError(403, 'symlink', '媒体根路径不能是符号链接')
  }
  if (status !== 'ok') {
    throw new HttpError(400, 'root-unavailable', '媒体根路径当前不可用，请先在设置中修复')
  }
  return root
}

export async function setMediaRootConfig(
  db: Database.Database,
  input: { mediaRoot?: unknown; create?: unknown },
): Promise<void> {
  const requested = resolveUserPath(input.mediaRoot)
  const current = getMediaRoot(db)

  if (current && samePath(current, requested)) return

  if (countCollectionLibraries(db) > 0) {
    throw new HttpError(
      409,
      'migration-required',
      '已存在作品集媒体库，请通过根路径迁移修改媒体根路径',
    )
  }

  const root = await validateRootPath(requested, input.create === true)
  setMediaRoot(db, root)
}

function normalizeType(value: unknown): LibraryType | null {
  if (value === undefined || value === null || value === '') return null
  if (value === 'movie' || value === 'series' || value === 'photo') return value
  throw new HttpError(400, 'invalid-type', '媒体库类型无效')
}

function assertName(db: Database.Database, value: unknown, excludeId?: string): string {
  if (typeof value !== 'string') {
    throw new HttpError(400, 'empty-name', '媒体库名称不能为空')
  }

  const existing = listLibraryRows(db)
    .filter((row) => row.id !== excludeId)
    .map((row) => row.name)
  const issues = validateLibraryName(value, existing)
  const first = issues[0]

  if (first) {
    throw new HttpError(first.code === 'duplicate-name' ? 409 : 400, first.code, first.message)
  }

  return normalizeLibraryName(value)
}

function collectionPath(root: string, folder: string): string {
  const target = resolve(root, folder)
  if (!isDirectChild(root, target)) {
    throw new HttpError(400, 'invalid-folder', '作品集目录名非法')
  }
  return target
}

async function normalizeSources(
  db: Database.Database,
  input: unknown,
): Promise<NormalizedSource[]> {
  if (!Array.isArray(input) || input.length === 0) {
    throw new HttpError(400, 'invalid-sources', '请至少配置一个来源目录')
  }
  if (input.length > 32) {
    throw new HttpError(400, 'invalid-sources', '单个媒体库最多配置 32 个来源目录')
  }

  const sources: NormalizedSource[] = []
  const seen = new Set<string>()

  for (const value of input) {
    if (typeof value !== 'string' || value.trim() === '') {
      throw new HttpError(400, 'invalid-sources', '来源路径不能为空')
    }

    const path = resolveUserPath(value)
    const info = await lstatSafe(path)

    if (!info) {
      throw new HttpError(400, 'source-missing', `来源目录不存在：${path}`)
    }
    if (info.isSymbolicLink()) {
      throw new HttpError(403, 'symlink', `来源目录不能是符号链接：${path}`)
    }
    if (!info.isDirectory()) {
      throw new HttpError(400, 'source-missing', `来源不是目录：${path}`)
    }

    try {
      await access(path, constants.R_OK)
    } catch {
      throw new HttpError(400, 'source-missing', `来源目录不可读：${path}`)
    }

    const key = pathKey(path)
    if (seen.has(key)) {
      throw new HttpError(400, 'invalid-sources', `来源路径重复：${path}`)
    }
    seen.add(key)
    sources.push({ path, key })
  }

  for (let left = 0; left < sources.length; left += 1) {
    for (let right = left + 1; right < sources.length; right += 1) {
      if (overlaps(sources[left]!.path, sources[right]!.path)) {
        throw new HttpError(400, 'source-overlap', '同一媒体库的来源目录不能互相包含')
      }
    }
  }

  const root = getMediaRoot(db)
  if (root) {
    for (const folder of listCollectionFolders(db)) {
      const target = join(root, folder.folder)
      for (const source of sources) {
        if (overlaps(source.path, target)) {
          throw new HttpError(
            409,
            'source-overlap',
            `来源目录与作品集媒体库目录重叠：${source.path}`,
          )
        }
      }
    }
  }

  return sources
}

async function probeLibrary(
  db: Database.Database,
  library: MediaLibrary,
): Promise<{ status: LibraryStatus; issues: string[] }> {
  if (library.organization === 'collection') {
    const root = getMediaRoot(db)
    if (!root) {
      return { status: 'missing', issues: ['媒体根路径未配置'] }
    }

    const rootStatus = await probeRoot(root)
    if (rootStatus !== 'ok') {
      const status: LibraryStatus =
        rootStatus === 'symlink'
          ? 'symlink'
          : rootStatus === 'unreadable' || rootStatus === 'unwritable'
            ? 'unreadable'
            : 'missing'
      return { status, issues: [statusMessage(status, root)] }
    }

    const target = collectionPath(root, library.folder ?? '')
    const status = await probePath(target)
    return {
      status,
      issues: status === 'ok' ? [] : [statusMessage(status, target)],
    }
  }

  const statuses = await Promise.all(library.sources.map((source) => probePath(source)))
  const issues = library.sources
    .map((source, index) => {
      const status = statuses[index] ?? 'missing'
      return status === 'ok' ? null : statusMessage(status, source)
    })
    .filter((item): item is string => item !== null)

  return { status: summarizeLibraryStatus(statuses), issues }
}

function toView(
  library: MediaLibrary,
  probe: { status: LibraryStatus; issues: string[] },
): LibraryView {
  return {
    id: library.id,
    name: library.name,
    organization: library.organization,
    type: library.type,
    convention: library.convention,
    sources: library.sources,
    createdAt: library.createdAt,
    updatedAt: library.updatedAt,
    status: probe.status,
    issues: probe.issues,
  }
}

export async function getLibraryView(
  db: Database.Database,
  library: MediaLibrary,
): Promise<LibraryView> {
  return toView(library, await probeLibrary(db, library))
}

export async function buildOverview(
  db: Database.Database,
  databasePath: string,
  migration: MigrationView | null,
): Promise<LibraryOverview> {
  const libraries = listLibraries(db)
  const views = await Promise.all(
    libraries.map(async (library) => toView(library, await probeLibrary(db, library))),
  )

  return {
    databasePath,
    mediaRoot: getMediaRoot(db),
    rootStatus: await getRootStatus(db),
    deletePasswordConfigured: getDeletePassword(db) !== null,
    migration,
    libraries: views,
  }
}

function mapDatabaseError(error: unknown): never {
  if (error instanceof HttpError) throw error

  const message = error instanceof Error ? error.message : String(error)
  const code = (error as { code?: string }).code

  if (code?.startsWith('SQLITE_CONSTRAINT')) {
    if (message.includes('libraries.name_key')) {
      throw new HttpError(409, 'duplicate-name', '已存在同名媒体库')
    }
    if (message.includes('libraries.folder_key')) {
      throw new HttpError(409, 'duplicate-folder', '作品集目录冲突，请重试')
    }
    if (message.includes('library_sources')) {
      throw new HttpError(409, 'duplicate-source', '来源路径重复')
    }
    throw new HttpError(409, 'constraint-failed', '数据约束校验失败')
  }

  if (code === 'SQLITE_READONLY' || code === 'SQLITE_FULL' || code === 'SQLITE_IOERR') {
    throw new HttpError(503, 'database-unavailable', `媒体库数据库不可写：${message}`)
  }

  throw new HttpError(503, 'database-unavailable', `媒体库数据库操作失败：${message}`)
}

async function createCollectionLibrary(
  db: Database.Database,
  input: LibraryCreateInput,
  name: string,
): Promise<MediaLibrary> {
  const root = await assertRootUsable(db)
  const type = normalizeType(input.type)
  const usedKeys = new Set(listFolderKeys(db).map((key) => key.toLocaleLowerCase()))
  const folder = generateFolderName(name, usedKeys)
  const target = collectionPath(root, folder)
  const existing = await lstatSafe(target)

  if (existing?.isSymbolicLink()) {
    throw new HttpError(403, 'symlink', '作品集目录不能是符号链接')
  }
  if (existing && !existing.isDirectory()) {
    throw new HttpError(409, 'invalid-folder', '作品集目录已存在且不是目录')
  }

  let created = false
  if (!existing) {
    await mkdir(target)
    created = true
  }

  const id = randomUUID()
  const now = new Date().toISOString()

  try {
    withTransaction(db, () => {
      insertLibrary(db, {
        id,
        name,
        nameKey: libraryNameKey(name),
        organization: 'collection',
        type,
        folder,
        folderKey: folder.toLocaleLowerCase(),
        convention: null,
        createdAt: now,
        updatedAt: now,
      })
    })
  } catch (error) {
    if (created) {
      await rmdir(target).catch(() => undefined)
    }
    mapDatabaseError(error)
  }

  return findLibrary(db, id)!
}

async function createConventionLibrary(
  db: Database.Database,
  input: LibraryCreateInput,
  name: string,
): Promise<MediaLibrary> {
  const type = normalizeType(input.type)
  const sources = await normalizeSources(db, input.sources)
  const id = randomUUID()
  const now = new Date().toISOString()

  try {
    withTransaction(db, () => {
      insertLibrary(db, {
        id,
        name,
        nameKey: libraryNameKey(name),
        organization: 'convention',
        type,
        folder: null,
        folderKey: null,
        convention: 'jellyfin',
        createdAt: now,
        updatedAt: now,
      })
      replaceSources(db, id, sources)
    })
  } catch (error) {
    mapDatabaseError(error)
  }

  return findLibrary(db, id)!
}

export async function createLibrary(
  db: Database.Database,
  input: LibraryCreateInput,
): Promise<MediaLibrary> {
  if (input.organization !== 'collection' && input.organization !== 'convention') {
    throw new HttpError(400, 'invalid-organization', '媒体库组织形式无效')
  }

  if (!getMediaRoot(db)) {
    throw new HttpError(400, 'root-not-configured', '请先在设置中配置媒体根路径')
  }

  const name = assertName(db, input.name)
  return input.organization === 'collection'
    ? createCollectionLibrary(db, input, name)
    : createConventionLibrary(db, input, name)
}

export async function updateLibrary(
  db: Database.Database,
  id: string,
  input: LibraryUpdateInput & Record<string, unknown>,
): Promise<MediaLibrary> {
  const current = findLibrary(db, id)
  if (!current) {
    throw new HttpError(404, 'library-not-found', '媒体库不存在')
  }

  if ('organization' in input || 'convention' in input) {
    throw new HttpError(409, 'organization-immutable', '媒体库组织形式不可修改')
  }
  if ('folder' in input) {
    throw new HttpError(409, 'folder-immutable', '作品集目录不可修改')
  }

  const name = input.name !== undefined ? assertName(db, input.name, id) : current.name
  const type = input.type !== undefined ? normalizeType(input.type) : current.type

  if (current.organization === 'collection') {
    if (input.sources !== undefined) {
      throw new HttpError(400, 'invalid-sources', '作品集媒体库不支持配置来源')
    }
    try {
      updateLibraryRow(db, id, {
        name,
        nameKey: libraryNameKey(name),
        type,
        updatedAt: new Date().toISOString(),
      })
    } catch (error) {
      mapDatabaseError(error)
    }
  } else {
    const sources =
      input.sources !== undefined
        ? await normalizeSources(db, input.sources)
        : current.sources.map((path) => ({ path, key: pathKey(path) }))

    try {
      withTransaction(db, () => {
        updateLibraryRow(db, id, {
          name,
          nameKey: libraryNameKey(name),
          type,
          updatedAt: new Date().toISOString(),
        })
        if (input.sources !== undefined) {
          replaceSources(db, id, sources)
        }
      })
    } catch (error) {
      mapDatabaseError(error)
    }
  }

  return findLibrary(db, id)!
}

function assertNotProtectedTarget(
  db: Database.Database,
  target: string,
  root: string,
  libraryId: string,
): void {
  if (samePath(target, root)) {
    throw new HttpError(409, 'protected-path', '不能删除媒体根路径本身')
  }
  if (samePath(target, homedir())) {
    throw new HttpError(409, 'protected-path', '不能删除用户主目录')
  }
  if (samePath(dirname(resolve(target)), resolve(target))) {
    throw new HttpError(409, 'protected-path', '不能删除磁盘根目录')
  }
  if (contains(target, root)) {
    throw new HttpError(409, 'protected-path', '目标目录包含媒体根路径')
  }
  if (contains(target, homedir())) {
    throw new HttpError(409, 'protected-path', '目标目录包含用户主目录')
  }

  for (const folder of listCollectionFolders(db)) {
    if (folder.id === libraryId) continue
    if (overlaps(target, join(root, folder.folder))) {
      throw new HttpError(409, 'protected-path', '目标目录与其他媒体库重叠')
    }
  }

  for (const source of listSourcesForLibraries(db)) {
    if (source.libraryId === libraryId) continue
    if (overlaps(target, source.path)) {
      throw new HttpError(409, 'protected-path', '目标目录与文件规范来源重叠')
    }
  }
}

export async function deleteLibrary(
  db: Database.Database,
  id: string,
  password: unknown,
): Promise<DeleteLibraryResult> {
  const library = findLibrary(db, id)
  if (!library) {
    throw new HttpError(404, 'library-not-found', '媒体库不存在')
  }

  if (library.organization === 'convention') {
    withTransaction(db, () => deleteLibraryRow(db, id))
    return { deleted: true, retainedSources: library.sources, failed: [] }
  }

  assertDeletePassword(db, password)

  const root = getMediaRoot(db)
  if (!root) {
    throw new HttpError(400, 'root-not-configured', '媒体根路径未配置')
  }

  const target = collectionPath(root, library.folder ?? '')
  assertNotProtectedTarget(db, target, root, library.id)

  const info = await lstatSafe(target)
  if (info?.isSymbolicLink()) {
    throw new HttpError(403, 'symlink', '作品集目录不能是符号链接')
  }
  if (info && !info.isDirectory()) {
    throw new HttpError(409, 'invalid-folder', '作品集路径不是目录')
  }

  if (info) {
    try {
      await rm(target, { recursive: true, force: false })
    } catch (error) {
      const message = error instanceof Error ? error.message : '删除失败'
      return { deleted: false, retainedSources: [], failed: [{ path: target, message }] }
    }
  }

  withTransaction(db, () => deleteLibraryRow(db, id))
  return { deleted: true, retainedSources: [], failed: [] }
}

export async function hasCollectionLibraries(db: Database.Database): Promise<boolean> {
  return countCollectionLibraries(db) > 0
}

export function sameNormalizedPath(a: string, b: string): boolean {
  return samePath(a, b)
}

export function containsPath(parent: string, child: string): boolean {
  return contains(parent, child)
}

export { normalizeForCompare }
