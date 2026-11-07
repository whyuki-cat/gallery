import { useEffect, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { File, Folder, Play } from 'lucide-react'

import { cn } from '@/lib/cn'
import { joinPath, thumbUrl } from '@/lib/api'
import { fileIconTone, formatSize, isImageFile, isVideoFile } from '@/features/rename/format'
import type { Capabilities, FsEntry, StatItem } from '@/features/rename/types'

interface FileGridProps {
  dir: string
  entries: FsEntry[]
  stats: Map<string, StatItem>
  selected: Set<string>
  activeName: string | null
  capabilities: Capabilities | null
  onActivate: (entry: FsEntry) => void
  onToggleSelect: (entry: FsEntry, index: number, event: ReactMouseEvent) => void
  onOpenDirectory: (entry: FsEntry) => void
  onVisible: (paths: string[]) => void
}

const CARD_HEIGHT = 178
const MIN_CARD_WIDTH = 168

export function FileGrid({
  dir,
  entries,
  stats,
  selected,
  activeName,
  capabilities,
  onActivate,
  onToggleSelect,
  onOpenDirectory,
  onVisible,
}: FileGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [columns, setColumns] = useState(4)

  useEffect(() => {
    const element = scrollRef.current
    if (!element) return

    const update = () => {
      const width = element.clientWidth - 48
      setColumns(Math.max(1, Math.floor(width / MIN_CARD_WIDTH)))
    }

    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const rowCount = Math.ceil(entries.length / columns)

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => CARD_HEIGHT,
    overscan: 3,
  })

  const virtualRows = virtualizer.getVirtualItems()
  const visibleKey = virtualRows.map((row) => row.index).join(',')

  useEffect(() => {
    const paths: string[] = []

    for (const row of virtualRows) {
      for (let column = 0; column < columns; column += 1) {
        const entry = entries[row.index * columns + column]
        if (entry) paths.push(joinPath(dir, entry.name))
      }
    }

    if (paths.length > 0) onVisible(paths)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleKey, columns, dir, entries])

  return (
    <div ref={scrollRef} className="min-h-0 flex-1 select-none overflow-y-auto px-6 py-4">
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualRows.map((row) => {
          const start = row.index * columns
          const rowEntries = entries.slice(start, start + columns)

          return (
            <div
              key={row.key}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: row.size,
                transform: `translateY(${row.start}px)`,
                display: 'grid',
                gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                gap: '12px',
              }}
            >
              {rowEntries.map((entry, offset) => {
                const index = start + offset
                const stat = stats.get(joinPath(dir, entry.name))
                const isSelected = selected.has(entry.name)
                const isActive = entry.type === 'file' && activeName === entry.name

                return (
                  <div
                    key={entry.name}
                    className={cn(
                      'group relative flex h-[166px] select-none flex-col overflow-hidden rounded-xl border text-left transition',
                      isSelected
                        ? 'border-brand/70 bg-brand/[0.12] shadow-[0_0_0_1px_rgba(139,92,246,0.35)]'
                        : isActive
                          ? 'border-brand/45 bg-brand/[0.07] shadow-[0_0_0_1px_rgba(139,92,246,0.16)]'
                          : 'border-line/80 bg-panel-2/40 hover:border-line-strong hover:bg-panel-2/70',
                    )}
                  >
                    {entry.type === 'file' && (
                      <button
                        type="button"
                        onClick={(event) => onToggleSelect(entry, index, event)}
                        title={isSelected ? '取消选择' : '选择'}
                        aria-label={isSelected ? `取消选择 ${entry.name}` : `选择 ${entry.name}`}
                        aria-pressed={isSelected}
                        className={cn(
                          'absolute left-1.5 top-1.5 z-10 grid size-4 cursor-pointer place-items-center rounded border transition',
                          isSelected
                            ? 'border-brand bg-brand text-white'
                            : 'border-line-strong bg-panel-2/80 text-transparent hover:border-brand/60',
                        )}
                      >
                        <svg viewBox="0 0 12 12" className="size-2.5" fill="none" stroke="currentColor" strokeWidth="2.4">
                          <path d="M2.5 6.2 5 8.7l4.5-5.4" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
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
                      className="flex h-full w-full cursor-pointer select-none flex-col overflow-hidden"
                    >
                      <div className="relative flex h-[112px] shrink-0 items-center justify-center overflow-hidden border-b border-line/50 bg-[linear-gradient(160deg,rgba(139,92,246,0.08),rgba(34,211,238,0.04))]">
                        <EntryThumb
                          dir={dir}
                          entry={entry}
                          videoThumbnail={Boolean(capabilities?.videoThumbnail)}
                        />
                      </div>

                      <div className="min-w-0 px-2.5 py-2">
                        <div className="truncate text-[12px] text-ink" title={entry.name}>
                          {entry.name}
                        </div>
                        <div className="mt-0.5 flex items-center justify-between text-[10.5px] text-ink-faint">
                          <span>{entry.type === 'directory' ? '文件夹' : entry.extension || '文件'}</span>
                          <span className="font-mono">
                            {entry.type === 'directory' ? '' : formatSize(stat?.size)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function EntryThumb({
  dir,
  entry,
  videoThumbnail,
}: {
  dir: string
  entry: FsEntry
  videoThumbnail: boolean
}) {
  const path = joinPath(dir, entry.name)
  const isImage = entry.type === 'file' && isImageFile(entry.extension)
  const isVideo =
    entry.type === 'file' && videoThumbnail && isVideoFile(entry.extension)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setFailed(false)
  }, [path, isImage, isVideo])

  if (entry.type === 'directory') {
    return <Folder className="size-9 text-amber-300/80" strokeWidth={1.4} />
  }

  if ((isImage || isVideo) && !failed) {
    return (
      <>
        <img
          src={thumbUrl(path, 480)}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
        {isVideo && (
          <span className="pointer-events-none absolute inset-0 grid place-items-center bg-black/20">
            <span className="grid size-9 place-items-center rounded-full bg-black/55 text-white backdrop-blur">
              <Play className="size-4 translate-x-px fill-current" />
            </span>
          </span>
        )}
      </>
    )
  }

  return (
    <File className={cn('size-9', fileIconTone(entry.extension))} strokeWidth={1.4} />
  )
}
