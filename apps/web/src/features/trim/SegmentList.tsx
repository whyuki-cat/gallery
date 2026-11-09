import { ArrowRight, Trash2 } from 'lucide-react'
import { formatTimecode, type TrimSegment } from '@gallery/core'

import { cn } from '@/lib/cn'

interface SegmentListProps {
  segments: TrimSegment[]
  activeIndex: number | null
  onSelect: (index: number) => void
  onRemove: (index: number) => void
}

export function SegmentList({ segments, activeIndex, onSelect, onRemove }: SegmentListProps) {
  if (segments.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-line-strong bg-panel-2/30 px-4 py-8 text-center">
        <p className="text-[12px] leading-relaxed text-ink-faint">
          还没有片段。
          <br />
          定位播放头后点“设为起点”或“设为终点”即可创建。
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      {segments.map((segment, index) => {
        const active = index === activeIndex

        return (
          <div
            key={`${segment.start}-${segment.end}-${index}`}
            role="button"
            tabIndex={0}
            aria-label={`跳转到第 ${index + 1} 个片段的起点`}
            onClick={() => onSelect(index)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return
              event.preventDefault()
              onSelect(index)
            }}
            className={cn(
              'group flex cursor-pointer items-center gap-2.5 rounded-lg border px-2.5 py-2 transition',
              active
                ? 'border-brand/45 bg-brand/10'
                : 'border-line/70 bg-panel-2/40 hover:border-line-strong hover:bg-hover-strong',
            )}
          >
            <span
              className={cn(
                'grid size-6 shrink-0 place-items-center rounded-md border font-mono text-[10px]',
                active
                  ? 'border-brand/40 bg-brand/15 text-brand-soft'
                  : 'border-line bg-panel/60 text-ink-faint',
              )}
            >
              {index + 1}
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 font-mono text-[11.5px] text-ink">
                <span>{formatTimecode(segment.start)}</span>
                <ArrowRight className="size-3 shrink-0 text-ink-faint" />
                <span>{formatTimecode(segment.end)}</span>
              </div>
              <div className="mt-0.5 text-[10.5px] text-ink-faint">
                时长 {formatTimecode(segment.end - segment.start)}
              </div>
            </div>

            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                onRemove(index)
              }}
              title="删除片段"
              aria-label={`删除第 ${index + 1} 个片段`}
              className="grid size-7 shrink-0 place-items-center rounded-md text-ink-faint transition hover:bg-rose-500/10 hover:text-rose-200"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
