import type { PlannedRename } from '@gallery/core'

import { diffName } from '@/features/rename/format'

interface PreviewTableProps {
  rows: PlannedRename[]
}

export function PreviewTable({ rows }: PreviewTableProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid shrink-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)_88px] gap-3 border-b border-line/60 px-4 py-2 text-[10.5px] uppercase tracking-[0.12em] text-ink-faint">
        <span>原名称</span>
        <span>新名称</span>
        <span className="text-right">状态</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {rows.length === 0 && (
          <div className="px-4 py-8 text-center text-[12px] text-ink-faint">
            没有可以预览的文件。
          </div>
        )}

        {rows.map((row) => {
          const diff = diffName(row.source, row.target)
          const hasIssue = row.issues.length > 0
          const unchanged = row.source === row.target

          return (
            <div
              key={row.source}
              className="border-b border-line/30 px-4 py-2 text-[12px] transition hover:bg-hover"
            >
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_88px] items-center gap-3">
                <span className="truncate font-mono text-[11.5px] text-ink-faint" title={row.source}>
                  <span>{diff.prefix}</span>
                  <span className="rounded bg-rose-500/15 text-rose-300 line-through">
                    {diff.oldMiddle}
                  </span>
                  <span>{diff.suffix}</span>
                </span>

                <span
                  className={`truncate font-mono text-[11.5px] ${statusTone(row)}`}
                  title={row.target}
                >
                  <span>{diff.prefix}</span>
                  <span
                    className={
                      diff.newMiddle ? 'rounded bg-emerald-400/15 font-medium text-emerald-300' : ''
                    }
                  >
                    {diff.newMiddle}
                  </span>
                  <span>{diff.suffix}</span>
                </span>

                <span className="text-right text-[10.5px]">
                  {row.skipped ? (
                    <span className="rounded bg-amber-400/15 px-1.5 py-0.5 text-amber-300">跳过</span>
                  ) : hasIssue ? (
                    <span className="rounded bg-rose-500/15 px-1.5 py-0.5 text-rose-300">冲突</span>
                  ) : unchanged ? (
                    <span className="text-ink-faint">未变</span>
                  ) : (
                    <span className="rounded bg-emerald-400/10 px-1.5 py-0.5 text-emerald-300">
                      待改
                    </span>
                  )}
                </span>
              </div>

              {hasIssue && !row.skipped && (
                <ul className="mt-1 space-y-0.5 pl-1 text-[10.5px] text-rose-300/90">
                  {row.issues.map((issue) => (
                    <li key={`${issue.code}-${issue.detail ?? ''}`}>
                      · {issue.message}
                      {issue.detail ? `（${issue.detail}）` : ''}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function statusTone(row: PlannedRename): string {
  if (row.skipped) return 'text-ink-faint'
  if (row.issues.length > 0) return 'text-rose-200'
  if (row.source === row.target) return 'text-ink-faint'
  return 'text-ink'
}
