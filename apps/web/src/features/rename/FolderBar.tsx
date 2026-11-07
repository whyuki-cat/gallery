import { useEffect, useState } from 'react'
import { ArrowUp, CornerDownLeft, Eye, EyeOff, HardDrive } from 'lucide-react'

import { cn } from '@/lib/cn'
import type { RootsResponse } from '@/features/rename/types'

export function breadcrumbs(path: string): Array<{ name: string; path: string }> {
  if (!path) return []

  const isWindows = /^[A-Za-z]:/.test(path) || path.includes('\\')
  const parts = path.split(/[\\/]/).filter(Boolean)
  const items: Array<{ name: string; path: string }> = []

  if (!isWindows) {
    items.push({ name: '/', path: '/' })
  }

  let current = ''

  parts.forEach((part, index) => {
    if (isWindows) {
      current = index === 0 ? `${part}\\` : `${current}${part}`
    } else {
      current = index === 0 ? `/${part}` : `${current}/${part}`
    }

    items.push({ name: part, path: current })

    if (isWindows && index < parts.length - 1 && !current.endsWith('\\')) {
      current += '\\'
    }
  })

  return items
}

interface FolderBarProps {
  path: string
  parent: string | null
  roots: RootsResponse | null
  loading: boolean
  showHidden: boolean
  onNavigate: (path: string) => void
  onToggleHidden: () => void
}

export function FolderBar({
  path,
  parent,
  roots,
  loading,
  showHidden,
  onNavigate,
  onToggleHidden,
}: FolderBarProps) {
  const [draft, setDraft] = useState(path)

  useEffect(() => {
    setDraft(path)
  }, [path])

  const crumbs = breadcrumbs(path)

  return (
    <div className="space-y-3 border-b border-line/70 px-6 py-4">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => parent && onNavigate(parent)}
          disabled={!parent}
          title="上一级"
          className="grid size-9 shrink-0 place-items-center rounded-lg border border-line bg-panel-2/60 text-ink-dim transition hover:border-line-strong hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ArrowUp className="size-4" />
        </button>

        <form
          className="flex min-w-0 flex-1 items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            const next = draft.trim()
            if (next) onNavigate(next)
          }}
        >
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="输入绝对路径，例如 D:\Videos"
            spellCheck={false}
            className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-panel-2/60 px-3 font-mono text-[12.5px] text-ink outline-none transition placeholder:text-ink-faint focus:border-brand/60"
          />
          <button
            type="submit"
            className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-line bg-panel-3/70 px-3 text-[12px] font-medium text-ink-dim transition hover:border-line-strong hover:text-ink"
          >
            <CornerDownLeft className="size-3.5" />
            打开
          </button>
        </form>

        <button
          type="button"
          onClick={onToggleHidden}
          title={showHidden ? '隐藏隐藏项' : '显示隐藏项'}
          className={cn(
            'grid size-9 shrink-0 place-items-center rounded-lg border transition',
            showHidden
              ? 'border-brand/50 bg-brand/10 text-brand-soft'
              : 'border-line bg-panel-2/60 text-ink-dim hover:border-line-strong hover:text-ink',
          )}
        >
          {showHidden ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
        </button>
      </div>

      {crumbs.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 text-[12px]">
          {crumbs.map((crumb, index) => (
            <span key={crumb.path} className="flex items-center gap-1">
              {index > 0 && <span className="text-ink-faint/50">/</span>}
              <button
                type="button"
                onClick={() => onNavigate(crumb.path)}
                className={cn(
                  'rounded px-1.5 py-0.5 transition hover:bg-hover-strong',
                  index === crumbs.length - 1
                    ? 'font-medium text-ink'
                    : 'text-ink-faint hover:text-ink-dim',
                )}
              >
                {crumb.name}
              </button>
            </span>
          ))}
          {loading && <span className="ml-2 text-[11px] text-ink-faint">加载中…</span>}
        </div>
      )}

      {roots && (
        <div className="flex flex-wrap items-center gap-1.5">
          {[...roots.roots, ...roots.common].map((location) => (
            <button
              key={location.path}
              type="button"
              onClick={() => onNavigate(location.path)}
              className="flex items-center gap-1.5 rounded-md border border-line/80 bg-panel-2/40 px-2 py-1 text-[11.5px] text-ink-dim transition hover:border-line-strong hover:bg-panel-3/60 hover:text-ink"
            >
              <HardDrive className="size-3" />
              {location.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
