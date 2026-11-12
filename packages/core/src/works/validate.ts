import { generateFolderName } from '../library/validate.js'
import type { WorkAssetRole, WorkIssue, WorkKind } from './types.js'

const MAX_WORK_NAME_LENGTH = 80
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/

export function normalizeWorkName(value: string): string {
  return value.trim()
}

export function workNameKey(value: string): string {
  return normalizeWorkName(value).toLocaleLowerCase()
}

export function validateWorkName(value: string): WorkIssue[] {
  const name = normalizeWorkName(value)
  const issues: WorkIssue[] = []

  if (name.length === 0) {
    issues.push({ code: 'empty-name', message: '作品名称不能为空' })
  } else if (name.length > MAX_WORK_NAME_LENGTH) {
    issues.push({
      code: 'name-too-long',
      message: `作品名称不能超过 ${MAX_WORK_NAME_LENGTH} 个字符`,
    })
  }

  if (CONTROL_CHARS.test(name)) {
    issues.push({ code: 'invalid-name', message: '作品名称包含非法控制字符' })
  }

  return issues
}

/**
 * 把作品名称转换成作品集媒体库内的安全子目录名，并处理冲突。
 */
export function generateWorkFolderName(name: string, existingKeys: Iterable<string> = []): string {
  return generateFolderName(name, existingKeys)
}

export function isWorkKind(value: unknown): value is WorkKind {
  return (
    value === 'movie' || value === 'short-video-collection' || value === 'photo-collection'
  )
}

export function isWorkAssetRole(value: unknown): value is WorkAssetRole {
  return (
    value === 'video' ||
    value === 'nfo' ||
    value === 'poster' ||
    value === 'backdrop' ||
    value === 'subtitle' ||
    value === 'extra'
  )
}
