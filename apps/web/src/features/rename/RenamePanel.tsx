import { useEffect, useMemo, useState } from 'react'
import {
  applyRules,
  resolveConflicts,
  type ConflictStrategy,
  type PlannedRename,
  type RenameOp,
} from '@gallery/core'
import { AlertTriangle, CheckCircle2, Loader2, X } from 'lucide-react'

import { api, ApiError, joinPath } from '@/lib/api'
import { cn } from '@/lib/cn'
import { PreviewTable } from '@/features/rename/PreviewTable'
import { RuleEditor } from '@/features/rename/RuleEditor'
import type { Notice, StatItem } from '@/features/rename/types'

interface RenamePanelProps {
  open: boolean
  dir: string
  names: string[]
  existingNames: string[]
  stats: Map<string, StatItem>
  onClose: () => void
  onApplied: (notice: Notice) => void
}

const STRATEGY_LABEL: Record<ConflictStrategy, string> = {
  block: '阻止执行',
  skip: '跳过冲突项',
  'auto-index': '自动追加序号',
}

export function RenamePanel({
  open,
  dir,
  names,
  existingNames,
  stats,
  onClose,
  onApplied,
}: RenamePanelProps) {
  const [operations, setOperations] = useState<RenameOp[]>([])
  const [strategy, setStrategy] = useState<ConflictStrategy>('block')
  const [executing, setExecuting] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const parentName = useMemo(
    () => dir.split(/[\\/]/).filter(Boolean).pop() ?? '',
    [dir],
  )

  const preview = useMemo(() => {
    const engineIssues = new Map<string, PlannedRename['issues']>()

    const entries = names.map((name, index) => {
      const stat = stats.get(joinPath(dir, name))
      const result = applyRules(
        name,
        index,
        { parentName, size: stat?.size ?? undefined, date: stat?.mtimeMs ?? undefined },
        operations,
      )
      engineIssues.set(name, result.issues)
      return { source: name, target: result.name }
    })

    const plan = resolveConflicts(entries, {
      strategy,
      existingNames,
      caseInsensitive: true,
    })

    const rows: PlannedRename[] = plan.items.map((item) => ({
      ...item,
      issues: [...item.issues, ...(engineIssues.get(item.source) ?? [])],
    }))

    const blocking =
      plan.blocking ||
      rows.some(
        (row) =>
          !row.skipped && row.issues.some((issue) => issue.code === 'invalid-regex'),
      )
    const changed = rows.filter((row) => !row.skipped && row.source !== row.target).length

    return { rows, blocking, changed }
  }, [names, operations, strategy, existingNames, stats, dir, parentName])

  useEffect(() => {
    if (!open) return
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !executing) onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, executing, onClose])

  useEffect(() => {
    if (!open) {
      setConfirming(false)
      setError(null)
    }
  }, [open])

  if (!open) return null

  const handleApply = async () => {
    setExecuting(true)
    setError(null)

    try {
      const result = await api.apply({ dir, names, operations, strategy })
      const failedCount = result.failed.length
      const skippedCount = result.skipped.length

      if (failedCount > 0) {
        const first = result.failed[0]
        onApplied({
          kind: 'error',
          text: `重命名未完成：${failedCount} 项失败${first ? `（${first.from}：${first.message}）` : ''}`,
        })
        setError(result.rolledBack ? '已回滚本次改动。' : '部分文件可能未恢复，请检查后手动处理。')
      } else {
        onApplied({
          kind: 'ok',
          text: `已重命名 ${result.renamed.length} 个文件${skippedCount > 0 ? `，跳过 ${skippedCount} 项` : ''}`,
        })
        onClose()
      }
    } catch (caught) {
      const message = caught instanceof ApiError ? caught.message : '重命名失败'
      setError(message)
      onApplied({ kind: 'error', text: message })
    } finally {
      setExecuting(false)
      setConfirming(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-4 backdrop-blur-sm">
      <div className="animate-rise flex h-[82vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-line-strong bg-panel shadow-[0_40px_120px_-40px_rgba(0,0,0,0.9)]">
        <header className="flex shrink-0 items-center gap-3 border-b border-line/70 px-5 py-3">
          <div className="min-w-0">
            <div className="text-[13.5px] font-semibold text-ink">批量重命名</div>
            <div className="truncate text-[11px] text-ink-faint" title={dir}>
              {dir} · 已选 {names.length} 个文件
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={executing}
            className="ml-auto grid size-7 place-items-center rounded-lg text-ink-faint transition hover:bg-hover-strong hover:text-ink"
            aria-label="关闭"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.15fr)]">
          <div className="min-h-0 overflow-y-auto border-line/70 p-4 lg:border-r">
            <div className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
              规则（按从上到下顺序执行）
            </div>
            <RuleEditor operations={operations} onChange={setOperations} />
          </div>

          <div className="flex min-h-0 flex-col border-t border-line/70 lg:border-t-0">
            <div className="flex shrink-0 items-center justify-between px-4 py-2.5">
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                预览
              </span>
              <span className="text-[11px] text-ink-faint">
                {preview.changed} 项将改名
              </span>
            </div>
            <PreviewTable rows={preview.rows} />
          </div>
        </div>

        <footer className="flex shrink-0 flex-wrap items-center gap-3 border-t border-line/70 px-5 py-3">
          <label className="flex items-center gap-2 text-[11.5px] text-ink-faint">
            冲突策略
            <select
              value={strategy}
              onChange={(event) => setStrategy(event.target.value as ConflictStrategy)}
              className="h-7 rounded-md border border-line bg-panel-2/70 px-2 text-[11.5px] text-ink-dim outline-none focus:border-brand/60"
            >
              {(Object.keys(STRATEGY_LABEL) as ConflictStrategy[]).map((value) => (
                <option key={value} value={value}>
                  {STRATEGY_LABEL[value]}
                </option>
              ))}
            </select>
          </label>

          {preview.blocking && (
            <span className="flex items-center gap-1.5 text-[11.5px] text-rose-300">
              <AlertTriangle className="size-3.5" />
              存在冲突，处理后才能执行
            </span>
          )}

          {error && <span className="text-[11.5px] text-rose-300">{error}</span>}

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={executing}
              className="rounded-lg border border-line bg-panel-2/60 px-3 py-1.5 text-[12px] text-ink-dim transition hover:border-line-strong hover:text-ink disabled:opacity-50"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={preview.blocking || preview.changed === 0 || executing}
              className={cn(
                'flex items-center gap-1.5 rounded-lg bg-[linear-gradient(135deg,#8b5cf6,#7c3aed)] px-3.5 py-1.5 text-[12px] font-medium text-white shadow-[0_10px_26px_-14px_rgba(139,92,246,0.95)] transition hover:brightness-110',
                'disabled:cursor-not-allowed disabled:opacity-40',
              )}
            >
              执行重命名
            </button>
          </div>
        </footer>

        {confirming && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-scrim p-6">
            <div className="animate-rise w-full max-w-sm rounded-xl border border-line-strong bg-panel-2 p-5 shadow-2xl">
              <div className="flex items-center gap-2 text-[13px] font-medium text-ink">
                <CheckCircle2 className="size-4 text-brand-soft" />
                确认执行？
              </div>
              <p className="mt-2 text-[12px] leading-relaxed text-ink-dim">
                将重命名 <span className="font-medium text-ink">{preview.changed}</span> 个文件，
                策略为「{STRATEGY_LABEL[strategy]}」。执行后可通过工具栏的撤销恢复。
              </p>

              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  disabled={executing}
                  className="rounded-lg border border-line px-3 py-1.5 text-[12px] text-ink-dim transition hover:text-ink disabled:opacity-50"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleApply}
                  disabled={executing}
                  className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-[12px] font-medium text-white transition hover:brightness-110 disabled:opacity-60"
                >
                  {executing && <Loader2 className="size-3.5 animate-spin" />}
                  确认执行
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
