import { useState } from 'react'
import { ArrowDown, ArrowUp, CheckSquare, Grid2X2, List, Pencil, RotateCcw, Search, Square, Wand2 } from 'lucide-react'

import { cn } from '@/lib/cn'

export type SortKey = 'name' | 'size' | 'modified' | 'type'
export type ViewMode = 'list' | 'grid'

interface FileToolbarProps {
  total: number
  selectedCount: number
  search: string
  extension: string
  extensions: string[]
  sortKey: SortKey
  sortDir: 'asc' | 'desc'
  view: ViewMode
  undoing: boolean
  onSearch: (value: string) => void
  onExtension: (value: string) => void
  onSort: (key: SortKey) => void
  onToggleDir: () => void
  onView: (view: ViewMode) => void
  onSelectAll: () => void
  onInvert: () => void
  onClear: () => void
  onOpenSingleRename: () => void
  onOpenRename: () => void
  onUndo: () => void
}

export function FileToolbar({
  total,
  selectedCount,
  search,
  extension,
  extensions,
  sortKey,
  sortDir,
  view,
  undoing,
  onSearch,
  onExtension,
  onSort,
  onToggleDir,
  onView,
  onSelectAll,
  onInvert,
  onClear,
  onOpenSingleRename,
  onOpenRename,
  onUndo,
}: FileToolbarProps) {
  const [sortOpen, setSortOpen] = useState(false)

  return (
    <div className="border-b border-line/70 px-6 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-faint" />
          <input
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder="在当前目录中搜索"
            className="h-8 w-full rounded-lg border border-line bg-panel-2/60 pl-8 pr-3 text-[12.5px] text-ink outline-none transition placeholder:text-ink-faint focus:border-brand/60"
          />
        </div>

        <select
          value={extension}
          onChange={(event) => onExtension(event.target.value)}
          className="h-8 rounded-lg border border-line bg-panel-2/60 px-2 text-[12px] text-ink-dim outline-none transition focus:border-brand/60"
        >
          <option value="">全部类型</option>
          {extensions.map((value) => (
            <option key={value} value={value}>
              .{value}
            </option>
          ))}
        </select>

        <div className="relative">
          <button
            type="button"
            onClick={() => setSortOpen((open) => !open)}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-line bg-panel-2/60 px-2.5 text-[12px] text-ink-dim transition hover:border-line-strong hover:text-ink"
          >
            {SORT_LABEL[sortKey]}
            {sortDir === 'asc' ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
          </button>
          {sortOpen && (
            <div className="absolute right-0 top-9 z-30 w-32 overflow-hidden rounded-lg border border-line-strong bg-panel-2 shadow-2xl">
              {(Object.keys(SORT_LABEL) as SortKey[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    if (key === sortKey) onToggleDir()
                    else onSort(key)
                    setSortOpen(false)
                  }}
                  className={cn(
                    'block w-full px-3 py-1.5 text-left text-[12px] transition hover:bg-hover-strong',
                    key === sortKey ? 'text-brand-soft' : 'text-ink-dim',
                  )}
                >
                  {SORT_LABEL[key]}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex h-8 items-center rounded-lg border border-line bg-panel-2/60 p-0.5">
          <button
            type="button"
            onClick={() => onView('list')}
            title="列表视图"
            className={cn(
              'grid size-6 place-items-center rounded-md transition',
              view === 'list' ? 'bg-active text-ink' : 'text-ink-faint hover:text-ink-dim',
            )}
          >
            <List className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onView('grid')}
            title="网格视图"
            className={cn(
              'grid size-6 place-items-center rounded-md transition',
              view === 'grid' ? 'bg-active text-ink' : 'text-ink-faint hover:text-ink-dim',
            )}
          >
            <Grid2X2 className="size-3.5" />
          </button>
        </div>

        <button
          type="button"
          onClick={onUndo}
          disabled={undoing}
          className="flex h-8 items-center gap-1.5 rounded-lg border border-line bg-panel-2/60 px-2.5 text-[12px] text-ink-dim transition hover:border-line-strong hover:text-ink disabled:opacity-50"
        >
          <RotateCcw className={cn('size-3.5', undoing && 'animate-spin')} />
          撤销
        </button>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[12px]">
        <span className="text-ink-faint">
          共 {total} 项
          {selectedCount > 0 && (
            <span className="text-brand-soft"> · 已选 {selectedCount} 项</span>
          )}
        </span>

        <span className="mx-1 h-3 w-px bg-line-strong" />

        <button
          type="button"
          onClick={onSelectAll}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-ink-faint transition hover:bg-raised hover:text-ink"
        >
          <CheckSquare className="size-3.5" />
          全选
        </button>
        <button
          type="button"
          onClick={onInvert}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-ink-faint transition hover:bg-raised hover:text-ink"
        >
          <Square className="size-3.5" />
          反选
        </button>
        <button
          type="button"
          onClick={onClear}
          className="rounded px-1.5 py-0.5 text-ink-faint transition hover:bg-raised hover:text-ink"
        >
          清除
        </button>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenSingleRename}
            disabled={selectedCount !== 1}
            title={selectedCount === 1 ? '重命名选中的文件' : '请先选择一个文件'}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-line bg-panel-2/60 px-3 text-[12.5px] text-ink-dim transition hover:border-line-strong hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Pencil className="size-3.5" />
            重命名
          </button>
          <button
            type="button"
            onClick={onOpenRename}
            disabled={selectedCount === 0}
            className="flex h-8 items-center gap-1.5 rounded-lg bg-[linear-gradient(135deg,#8b5cf6,#7c3aed)] px-3 text-[12.5px] font-medium text-white shadow-[0_10px_26px_-14px_rgba(139,92,246,0.95)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Wand2 className="size-3.5" />
            批量重命名
          </button>
        </div>
      </div>
    </div>
  )
}

const SORT_LABEL: Record<SortKey, string> = {
  name: '按名称',
  size: '按大小',
  modified: '按修改时间',
  type: '按类型',
}
