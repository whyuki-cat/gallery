import { useState } from 'react'
import { AlertTriangle, Captions, Film, Images, Play } from 'lucide-react'

import { cn } from '@/lib/cn'
import { WORK_STATUS_LABELS, type WorkSummary } from '@/features/works/types'

interface WorkCardProps {
  work: WorkSummary
  onOpen: () => void
}

export function WorkCard({ work, onOpen }: WorkCardProps) {
  const [imageFailed, setImageFailed] = useState(false)
  const imageUrl = work.posterUrl ?? work.thumbnailUrl
  const healthy = work.status === 'ok'

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex flex-col text-left outline-none"
    >
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-xl bg-panel-2 shadow-[0_12px_32px_-20px_rgba(0,0,0,0.95)] ring-1 ring-white/5 transition duration-300 group-hover:-translate-y-0.5 group-hover:shadow-[0_24px_48px_-24px_rgba(0,0,0,1)] group-focus-visible:ring-2 group-focus-visible:ring-brand/60">
        {imageUrl && !imageFailed ? (
          <img
            src={imageUrl}
            alt={work.name}
            loading="lazy"
            onError={() => setImageFailed(true)}
            className="size-full object-cover transition duration-500 group-hover:scale-[1.04]"
          />
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-3 bg-[linear-gradient(165deg,rgba(139,92,246,0.20),rgba(10,10,14,0.96))] text-ink-faint">
            <Film className="size-9" strokeWidth={1.3} />
            <span className="text-[11px]">暂无海报</span>
          </div>
        )}

        {/* 悬停遮罩与播放提示 */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent opacity-0 transition duration-300 group-hover:opacity-100" />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition duration-300 group-hover:opacity-100">
          <span className="grid size-11 place-items-center rounded-full bg-white/90 text-black shadow-[0_10px_30px_-8px_rgba(0,0,0,0.8)]">
            <Play className="ml-0.5 size-5" fill="currentColor" strokeWidth={1.5} />
          </span>
        </div>

        {!healthy && (
          <span className="absolute left-2 top-2 flex items-center gap-1 rounded-md border border-amber-400/30 bg-black/70 px-1.5 py-0.5 text-[9.5px] text-amber-200 backdrop-blur">
            <AlertTriangle className="size-3" />
            {WORK_STATUS_LABELS[work.status]}
          </span>
        )}

        {(work.subtitleCount > 0 || work.extraCount > 0) && (
          <div className="absolute bottom-2 left-2 flex flex-wrap items-center gap-1">
            {work.subtitleCount > 0 && (
              <span className="flex items-center gap-1 rounded-md border border-white/15 bg-black/55 px-1.5 py-0.5 text-[9.5px] text-white/75 backdrop-blur">
                <Captions className="size-3" />
                {work.subtitleCount}
              </span>
            )}
            {work.extraCount > 0 && (
              <span className="flex items-center gap-1 rounded-md border border-white/15 bg-black/55 px-1.5 py-0.5 text-[9.5px] text-white/75 backdrop-blur">
                <Images className="size-3" />
                {work.extraCount}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="mt-2 min-w-0 px-0.5">
        <h3 className="truncate text-[12.5px] font-medium text-ink transition group-hover:text-brand-soft">
          {work.name}
        </h3>
        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-ink-faint">
          <span className={cn(!work.year && 'text-ink-faint/70')}>{work.year ?? '未知年份'}</span>
          {work.issues.length > 0 && (
            <span className="ml-auto flex items-center gap-1 text-[9.5px] text-amber-200/80">
              <AlertTriangle className="size-2.5" />
              {work.issues.length}
            </span>
          )}
        </div>
      </div>
    </button>
  )
}
