import type { ApplyResult, RenameContext, RenameIssue, RenameOp } from './types.js'

export const MAX_NAME_LENGTH = 255

/** Windows 下不允许出现在文件名中的字符。 */
export const INVALID_CHARS_PATTERN = /[<>:"/\\|?*\u0000-\u001f]/

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

export function isReservedName(target: string): boolean {
  const base = target.split('.')[0] ?? ''
  return RESERVED_NAMES.has(base.toUpperCase())
}

/** 拆分基础名与扩展名（保留前导点，无扩展名时为空串）。 */
export function splitFileName(fileName: string): { base: string; ext: string } {
  const dot = fileName.lastIndexOf('.')
  if (dot <= 0) return { base: fileName, ext: '' }
  return { base: fileName.slice(0, dot), ext: fileName.slice(dot) }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function toRegExp(find: string, regex: boolean, caseSensitive: boolean, issueSink: RenameIssue[]) {
  const flags = caseSensitive ? 'g' : 'gi'
  try {
    return new RegExp(regex ? find : escapeRegExp(find), flags)
  } catch {
    issueSink.push({
      code: 'invalid-regex',
      message: '正则表达式无效',
      detail: find,
    })
    return null
  }
}

function padNumber(value: number, width: number): string {
  const text = String(value)
  if (width <= 0) return text
  return text.padStart(width, '0')
}

function formatDate(value: RenameContext['date']): string {
  if (value === undefined || value === null) return ''
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const TEMPLATE_TOKEN = /\{([a-zA-Z]+)(?::(\d+))?\}/g

function applyTemplate(
  pattern: string,
  vars: Record<string, string>,
  index: number,
  issues: RenameIssue[],
): string {
  return pattern.replace(TEMPLATE_TOKEN, (token, rawName: string, rawPad?: string) => {
    const name = rawName.toLowerCase()
    if (name === 'index') {
      const width = rawPad ? Number(rawPad) : 0
      return padNumber(index + 1, Number.isFinite(width) ? width : 0)
    }
    const value = vars[name]
    if (value === undefined) {
      issues.push({
        code: 'unknown-variable',
        message: '模板中包含未知变量',
        detail: token,
      })
      return token
    }
    return value
  })
}

function applyCase(text: string, mode: 'lower' | 'upper' | 'title'): string {
  switch (mode) {
    case 'lower':
      return text.toLowerCase()
    case 'upper':
      return text.toUpperCase()
    case 'title':
      return text.replace(/(^|[\s._-])(\p{L})/gu, (_match, separator: string, char: string) => {
        return separator + char.toUpperCase()
      })
  }
}

/**
 * 按顺序把规则应用到单个文件名。
 * `index` 是该项在当前排序后的选中列表中的位置，用于序列编号与 `{index}`。
 */
export function applyRules(
  fileName: string,
  index: number,
  context: RenameContext,
  ops: RenameOp[],
): ApplyResult {
  const { base, ext } = splitFileName(fileName)
  let currentBase = base
  let currentExt = ext
  const issues: RenameIssue[] = []

  for (const op of ops) {
    if (op.enabled === false) continue

    switch (op.type) {
      case 'replace': {
        const pattern = toRegExp(op.find, op.regex === true, op.caseSensitive === true, issues)
        if (!pattern) break
        currentBase = currentBase.replace(pattern, () => op.with)
        break
      }
      case 'remove': {
        const pattern = toRegExp(op.find, op.regex === true, op.caseSensitive === true, issues)
        if (!pattern) break
        currentBase = currentBase.replace(pattern, '')
        break
      }
      case 'affix': {
        currentBase =
          op.side === 'prefix' ? `${op.text}${currentBase}` : `${currentBase}${op.text}`
        break
      }
      case 'case': {
        currentBase = applyCase(currentBase, op.mode)
        break
      }
      case 'sequence': {
        const value = op.start + index * op.step
        const number = padNumber(value, op.pad)
        const separator = op.separator ?? ''
        currentBase =
          op.side === 'prefix'
            ? `${number}${separator}${currentBase}`
            : `${currentBase}${separator}${number}`
        break
      }
      case 'template': {
        currentBase = applyTemplate(
          op.pattern,
          {
            name: currentBase,
            ext: currentExt.replace(/^\./, ''),
            date: formatDate(context.date),
            parent: context.parentName ?? '',
            size: context.size === undefined ? '' : String(context.size),
          },
          index,
          issues,
        )
        break
      }
      case 'extension': {
        if (op.mode === 'keep') break
        if (op.mode === 'lower') {
          currentExt = currentExt.toLowerCase()
          break
        }
        const value = (op.value ?? '').trim().replace(/^\./, '')
        currentExt = value === '' ? '' : `.${value}`
        break
      }
    }
  }

  return { name: currentBase + currentExt, issues }
}
