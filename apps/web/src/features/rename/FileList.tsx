import { useEffect, useRef } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { File, Folder } from 'lucide-react'

import { cn } from '@/lib/cn'
import { joinPath } from '@/lib/api'
import { fileIconTone, formatDate, formatSize, isImageFile } from '@/features/rename/format'
import type { FsEntry, StatItem } from '@/features/rename/types'
import type { SortKey } from '@/features/rename/FileToolbar'

interface FileListProps {
  dir: string
  entries: FsEntry[]
  stats: Map<string, StatItem>
  selected: Set<string>
  activeName: string | null
  sortKey: SortKey
  sortDir: 'asc' | 'desc'
  onSort: (key: SortKey) => void
  onActivate: (entry: FsEntry) => void
  onToggleSelect: (entry: FsEntry, index: number, event: ReactMouseEvent) => void
  onOpenDirectory: (entry: FsEntry) => void
  onVisible: (paths: string[]) => void
}

export function FileList({
  dir,
  entries,
  stats,
  selected,
  activeName,
  sortKey,
  sortDir,
  onSort,
  onActivate,
  onToggleSelect,
  onOpenDirectory,
  onVisible,
}: FileListProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 44,
    overscan: 12,
  })

  const virtualItems = virtualizer.getVirtualItems()
  const visibleKey = virtualItems.map((item) => item.index).join(',')

  useEffect(() => {
    const paths = virtualItems
      .map((item) => entries[item.index])
      .filter((entry): entry is FsEntry => entry !== undefined)
      .map((entry) => joinPath(dir, entry.name))

    if (paths.length > 0) onVisible(paths)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleKey, dir, entries])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-line/60 px-6 py-1.5 text-[11px] text-ink-faint">
        <span className="w-10" />
        <HeaderButton label="名称" active={sortKey === 'name'} dir={sortDir} onClick={() => onSort('name')} className="flex-1" />
        <HeaderButton label="大小" active={sortKey === 'size'} dir={sortDir} onClick={() => onSort('size')} className="w-14 text-right" />
        <HeaderButton label="修改时间" active={sortKey === 'modified'} dir={sortDir} onClick={() => onSort('modified')} className="w-28 text-right" />
        <HeaderButton label="类型" active={sortKey === 'type'} dir={sortDir} onClick={() => onSort('type')} className="w-10 text-right" />
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 select-none overflow-y-auto">
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {virtualItems.map((virtualItem) => {
            const entry = entries[virtualItem.index]
            if (!entry) return null

            const stat = stats.get(joinPath(dir, entry.name))
            const isSelected = selected.has(entry.name)
            const isActive = entry.type === 'file' && activeName === entry.name

            return (
              <div
                key={entry.name}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: virtualItem.size,
                  transform: `translateY(${virtualItem.start}px)`,
                }}
              >
                <div
                  className={cn(
                    'group flex h-full w-full select-none items-center gap-2 border-b border-line/30 px-6 text-left text-[12.5px] transition',
                    isSelected
                      ? 'bg-brand/[0.14]'
                      : isActive
                        ? 'bg-brand/[0.07]'
                        : 'hover:bg-hover',
                  )}
                >
                  {entry.type === 'file' ? (
                    <button
                      type="button"
                      onClick={(event) => onToggleSelect(entry, virtualItem.index, event)}
                      title={isSelected ? '取消选择' : '选择'}
                      aria-label={isSelected ? `取消选择 ${entry.name}` : `选择 ${entry.name}`}
                      aria-pressed={isSelected}
                      className={cn(
                        'grid size-4 shrink-0 cursor-pointer place-items-center rounded border transition',
                        isSelected
                          ? 'border-brand bg-brand text-white'
                          : 'border-line-strong bg-panel-2 text-transparent hover:border-brand/60',
                      )}
                    >
                      <svg viewBox="0 0 12 12" className="size-2.5" fill="none" stroke="currentColor" strokeWidth="2.4">
                        <path d="M2.5 6.2 5 8.7l4.5-5.4" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  ) : (
                    <span className="size-4 shrink-0" />
                  )}

                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => onActivate(entry)}
                    onDoubleClick={
                      entry.type === 'directory'
                        ? (event) => {
                            event.preventDefault()
                            onOpenDirectory(entry)
                          }
                        : undefined
                    }
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter') return
                      if (entry.type === 'directory') onOpenDirectory(entry)
                      else onActivate(entry)
                    }}
                    className="flex min-w-0 flex-1 cursor-pointer select-none items-center gap-2"
                  >
                    {entry.type === 'directory' ? (
                      <Folder className="size-4 shrink-0 text-amber-300/90" strokeWidth={1.8} />
                    ) : (
                      <File className={cn('size-4 shrink-0', fileIconTone(entry.extension))} strokeWidth={1.8} />
                    )}

                    <span className="min-w-0 flex-1 truncate text-ink">
                      {entry.name}
                      {entry.type === 'directory' && <span className="text-ink-faint">/</span>}
                    </span>

                    <span className="w-14 shrink-0 text-right font-mono text-[11.5px] text-ink-faint">
                      {entry.type === 'directory' ? '—' : formatSize(stat?.size)}
                    </span>
                    <span className="w-28 shrink-0 text-right font-mono text-[11.5px] text-ink-faint">
                      {formatDate(stat?.mtimeMs)}
                    </span>
                    <span className="w-10 shrink-0 text-right text-[11px] text-ink-faint">
                      {entry.type === 'directory' ? '文件夹' : entry.extension || '—'}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function HeaderButton({
  label,
  active,
  dir,
  onClick,
  className,
}: {
  label: string
  active: boolean
  dir: 'asc' | 'desc'
  onClick: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn('truncate transition hover:text-ink-dim', active && 'text-ink-dim', className)}
    >
      {label}
      {active && <span className="ml-1 text-[9px]">{dir === 'asc' ? '▲' : '▼'}</span>}
    </button>
  )
}

export function isPreviewableImage(entry: FsEntry): boolean {
  return entry.type === 'file' && isImageFile(entry.extension)
}
