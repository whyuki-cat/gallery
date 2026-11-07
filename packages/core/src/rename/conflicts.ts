import { MAX_NAME_LENGTH, splitFileName } from './operations.js'
import type { ConflictStrategy, PlannedRename, RenameIssue, TargetEntry } from './types.js'
import { CONFLICT_CODES, normalizeName, validateTargets } from './validate.js'

export interface ResolveOptions {
  strategy?: ConflictStrategy
  existingNames?: string[]
  caseInsensitive?: boolean
  maxLength?: number
}

export interface ResolveResult {
  items: PlannedRename[]
  /** 是否仍有问题需要阻止执行。 */
  blocking: boolean
  strategy: ConflictStrategy
}

function isConflict(item: PlannedRename): boolean {
  return item.issues.some((entry) => CONFLICT_CODES.has(entry.code))
}

/**
 * 依据冲突策略调整目标名。
 * - block：保持原样，由调用方根据 blocking 阻止执行
 * - skip：跳过存在冲突的条目
 * - auto-index：为冲突项追加 ` (n)`，直到与已有名称不重复
 */
export function resolveConflicts(
  entries: TargetEntry[],
  options: ResolveOptions = {},
): ResolveResult {
  const strategy = options.strategy ?? 'block'
  const caseInsensitive = options.caseInsensitive ?? true
  const maxLength = options.maxLength ?? MAX_NAME_LENGTH
  const existingNames = options.existingNames ?? []

  const items: PlannedRename[] = entries.map((entry) => ({
    source: entry.source,
    target: entry.target,
    issues: [],
    skipped: false,
  }))

  const initial = validateTargets(entries, { existingNames, caseInsensitive, maxLength })
  for (const item of items) {
    item.issues = initial.get(item.source) ?? []
  }

  if (strategy === 'skip') {
    for (const item of items) {
      if (isConflict(item)) item.skipped = true
    }
  }

  if (strategy === 'auto-index') {
    const taken = new Set(existingNames.map((name) => normalizeName(name, caseInsensitive)))

    for (const item of items) {
      const key = normalizeName(item.target, caseInsensitive)
      if (!taken.has(key)) {
        taken.add(key)
        continue
      }

      const { base, ext } = splitFileName(item.target)
      let counter = 1
      let candidate = `${base} (${counter})${ext}`

      while (taken.has(normalizeName(candidate, caseInsensitive))) {
        counter += 1
        candidate = `${base} (${counter})${ext}`
      }

      item.target = candidate
      taken.add(normalizeName(candidate, caseInsensitive))
    }
  }

  const active = items.filter((item) => !item.skipped)
  const finalIssues = validateTargets(
    active.map((item) => ({ source: item.source, target: item.target })),
    { existingNames, caseInsensitive, maxLength },
  )

  for (const item of active) {
    item.issues = finalIssues.get(item.source) ?? ([] as RenameIssue[])
  }

  const blocking = items.some((item) => !item.skipped && item.issues.length > 0)

  return { items, blocking, strategy }
}
