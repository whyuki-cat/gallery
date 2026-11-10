import type {
  LibraryIssue,
  LibraryOrganization,
  LibraryStatus,
  LibraryType,
} from './types.js'

const ILLEGAL_FOLDER_CHARS = /[<>:"/\\|?*\u0000-\u001f]/g
const ILLEGAL_FOLDER_CHARS_TEST = /[<>:"/\\|?*\u0000-\u001f]/
const RESERVED_NAMES = new Set([
  'CON',
  'PRN',
  'AUX',
  'NUL',
  'COM1',
  'COM2',
  'COM3',
  'COM4',
  'COM5',
  'COM6',
  'COM7',
  'COM8',
  'COM9',
  'LPT1',
  'LPT2',
  'LPT3',
  'LPT4',
  'LPT5',
  'LPT6',
  'LPT7',
  'LPT8',
  'LPT9',
])

const MAX_NAME_LENGTH = 80
const MAX_FOLDER_LENGTH = 100

export function normalizeLibraryName(value: string): string {
  return value.trim()
}

export function libraryNameKey(value: string): string {
  return normalizeLibraryName(value).toLocaleLowerCase()
}

export function validateLibraryName(
  value: string,
  existingNames: string[] = [],
): LibraryIssue[] {
  const name = normalizeLibraryName(value)
  const issues: LibraryIssue[] = []

  if (name.length === 0) {
    issues.push({ code: 'empty-name', message: '媒体库名称不能为空' })
  } else if (name.length > MAX_NAME_LENGTH) {
    issues.push({
      code: 'name-too-long',
      message: `媒体库名称不能超过 ${MAX_NAME_LENGTH} 个字符`,
    })
  }

  if (name.length > 0 && existingNames.some((item) => libraryNameKey(item) === libraryNameKey(name))) {
    issues.push({ code: 'duplicate-name', message: '已存在同名媒体库' })
  }

  return issues
}

export function isReservedFolderName(value: string): boolean {
  return RESERVED_NAMES.has(value.toUpperCase())
}

export function isValidFolderSegment(value: string): boolean {
  if (value.length === 0 || value.length > MAX_FOLDER_LENGTH) return false
  if (value === '.' || value === '..') return false
  if (value.trim() !== value) return false
  if (ILLEGAL_FOLDER_CHARS_TEST.test(value)) return false
  if (/[. ]$/.test(value)) return false
  if (isReservedFolderName(value)) return false
  return true
}

/**
 * 把媒体库名称转换成安全的单层目录名。
 * 输出保证通过 isValidFolderSegment，供作品集媒体库内部使用，不暴露给用户。
 */
export function sanitizeFolderName(value: string): string {
  let name = normalizeLibraryName(value)
    .replace(ILLEGAL_FOLDER_CHARS, '-')
    .replace(/^[.\s]+|[.\s]+$/g, '')

  if (name.length > MAX_FOLDER_LENGTH) {
    name = name.slice(0, MAX_FOLDER_LENGTH).replace(/[.\s]+$/g, '')
  }

  if (isReservedFolderName(name)) {
    name = `_${name}`
  }

  if (name.length === 0) {
    name = 'library'
  }

  return name
}

export function generateFolderName(name: string, existingKeys: Iterable<string> = []): string {
  const base = sanitizeFolderName(name)
  const used = new Set(Array.from(existingKeys, (item) => item.toLocaleLowerCase()))

  if (!used.has(base.toLocaleLowerCase())) return base

  for (let index = 2; index < 10_000; index += 1) {
    const suffix = `-${index}`
    const prefix = base.slice(0, Math.max(1, MAX_FOLDER_LENGTH - suffix.length)).replace(/[.\s]+$/g, '')
    const candidate = `${prefix}${suffix}`
    if (!used.has(candidate.toLocaleLowerCase())) return candidate
  }

  return `${base.slice(0, MAX_FOLDER_LENGTH - 5)}-${Date.now()}`
}

export function isLibraryOrganization(value: unknown): value is LibraryOrganization {
  return value === 'collection' || value === 'convention'
}

export function isLibraryType(value: unknown): value is LibraryType {
  return value === 'movie' || value === 'series' || value === 'photo'
}

export function validateLibraryType(value: unknown): LibraryIssue[] {
  if (value === undefined || value === null) return []
  if (isLibraryType(value)) return []
  return [{ code: 'invalid-type', message: '媒体库类型无效' }]
}

export function summarizeLibraryStatus(statuses: LibraryStatus[]): LibraryStatus {
  if (statuses.length === 0) return 'missing'
  if (statuses.every((status) => status === 'ok')) return 'ok'
  if (statuses.some((status) => status === 'symlink')) return 'symlink'
  if (statuses.some((status) => status === 'unreadable')) return 'unreadable'
  if (statuses.every((status) => status === 'missing')) return 'missing'
  return 'partial'
}
