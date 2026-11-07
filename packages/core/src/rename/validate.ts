import {
  INVALID_CHARS_PATTERN,
  MAX_NAME_LENGTH,
  isReservedName,
  splitFileName,
} from './operations.js'
import type { RenameIssue, TargetEntry } from './types.js'

export interface ValidateOptions {
  /** 目录中已存在、但不参与本次改名的文件名。 */
  existingNames?: string[]
  /** 按大小写不敏感比较；默认 true（面向 Windows）。 */
  caseInsensitive?: boolean
  maxLength?: number
}

export const CONFLICT_CODES = new Set<string>(['duplicate-target', 'target-exists'])

export function normalizeName(name: string, caseInsensitive: boolean): string {
  return caseInsensitive ? name.toLowerCase() : name
}

function issue(code: RenameIssue['code'], message: string, detail?: string): RenameIssue {
  return detail === undefined ? { code, message } : { code, message, detail }
}

/**
 * 校验一批目标名，返回 source -> issues 的映射。
 * 仅大小写不同的改名视为合法变更，不算冲突。
 */
export function validateTargets(
  entries: TargetEntry[],
  options: ValidateOptions = {},
): Map<string, RenameIssue[]> {
  const caseInsensitive = options.caseInsensitive ?? true
  const maxLength = options.maxLength ?? MAX_NAME_LENGTH

  const existing = new Set(
    (options.existingNames ?? []).map((name) => normalizeName(name, caseInsensitive)),
  )

  const targetGroups = new Map<string, number>()
  for (const entry of entries) {
    const key = normalizeName(entry.target, caseInsensitive)
    targetGroups.set(key, (targetGroups.get(key) ?? 0) + 1)
  }

  const result = new Map<string, RenameIssue[]>()

  for (const entry of entries) {
    const issues: RenameIssue[] = []
    const { base } = splitFileName(entry.target)
    const key = normalizeName(entry.target, caseInsensitive)
    const sourceKey = normalizeName(entry.source, caseInsensitive)

    if (entry.target.trim() === '' || base.trim() === '') {
      issues.push(issue('empty', '文件名不能为空'))
    }

    if (INVALID_CHARS_PATTERN.test(entry.target)) {
      const match = entry.target.match(INVALID_CHARS_PATTERN)
      issues.push(issue('invalid-char', '文件名包含非法字符', match?.[0]))
    }

    if (isReservedName(entry.target)) {
      issues.push(issue('reserved-name', '文件名是系统保留名'))
    }

    if (/[ .]$/.test(entry.target)) {
      issues.push(issue('trailing-dot-or-space', '文件名不能以空格或点结尾'))
    }

    if (entry.target.length > maxLength) {
      issues.push(issue('too-long', `文件名超过 ${maxLength} 个字符`, String(entry.target.length)))
    }

    if ((targetGroups.get(key) ?? 0) > 1) {
      issues.push(issue('duplicate-target', '多个文件将得到相同的名称'))
    }

    if (existing.has(key) && key !== sourceKey) {
      issues.push(issue('target-exists', '目标名称已被目录中的其他文件占用'))
    }

    result.set(entry.source, issues)
  }

  return result
}
