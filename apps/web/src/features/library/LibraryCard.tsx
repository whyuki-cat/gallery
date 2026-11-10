import {
  AlertTriangle,
  Film,
  FolderHeart,
  Image as ImageIcon,
  Pencil,
  Trash2,
  Tv,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { cn } from '@/lib/cn'
import {
  ORGANIZATION_LABELS,
  STATUS_LABELS,
  TYPE_LABELS,
  type LibraryType,
  type LibraryView,
} from '@/features/library/types'

const STATUS_STYLES: Record<LibraryView['status'], string> = {
  ok: 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]',
  partial: 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.7)]',
  missing: 'bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.7)]',
  unreadable: 'bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.7)]',
  symlink: 'bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.7)]',
}

function typeIcon(type: LibraryType | null): LucideIcon {
  if (type === 'movie') return Film
  if (type === 'series') return Tv
  if (type === 'photo') return ImageIcon
  return FolderHeart
}

interface LibraryCardProps {
  library: LibraryView
  onEdit: () => void
  onDelete: () => void
}

export function LibraryCard({ library, onEdit, onDelete }: LibraryCardProps) {
  const Icon = typeIcon(library.type)

  return (
    <article className="group flex flex-col rounded-2xl border border-line/80 bg-panel/40 p-4 transition hover:border-line-strong hover:bg-panel-2/50">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-line bg-panel-2 text-brand-soft">
          <Icon className="size-[18px]" strokeWidth={1.7} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-[13.5px] font-medium text-ink">{library.name}</h3>
            <span className={cn('size-1.5 shrink-0 rounded-full', STATUS_STYLES[library.status])} />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10.5px]">
            <span className="rounded-md border border-line bg-panel-2/60 px-1.5 py-0.5 text-ink-faint">
              {ORGANIZATION_LABELS[library.organization]}
            </span>
            {library.convention === 'jellyfin' && (
              <span className="rounded-md border border-line bg-panel-2/60 px-1.5 py-0.5 text-ink-faint">
                Jellyfin
              </span>
            )}
            {library.type && (
              <span className="rounded-md border border-line bg-panel-2/60 px-1.5 py-0.5 text-ink-faint">
                {TYPE_LABELS[library.type]}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-3 min-h-9 text-[11.5px] leading-relaxed text-ink-faint">
        {library.organization === 'collection' ? (
          <span>由媒体根路径托管，底层目录由系统维护。</span>
        ) : (
          <span>
            {library.sources.length} 个来源
            {library.sources[0] && (
              <span className="mt-0.5 block truncate font-mono text-[10.5px] text-ink-faint/80">
                {library.sources[0]}
              </span>
            )}
          </span>
        )}
      </div>

      {library.issues.length > 0 && (
        <div className="mt-2 flex items-start gap-1.5 rounded-lg border border-amber-400/20 bg-amber-400/5 px-2 py-1.5 text-[10.5px] leading-relaxed text-amber-200">
          <AlertTriangle className="mt-0.5 size-3 shrink-0" />
          <span className="min-w-0 break-all">{library.issues[0]}</span>
        </div>
      )}

      <div className="mt-3 flex items-center gap-2 border-t border-line/60 pt-3">
        <span className="text-[10.5px] text-ink-faint">{STATUS_LABELS[library.status]}</span>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={onEdit}
            aria-label={`编辑 ${library.name}`}
            title="编辑"
            className="grid size-7 place-items-center rounded-lg text-ink-faint transition hover:bg-hover-strong hover:text-ink"
          >
            <Pencil className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            aria-label={`移除 ${library.name}`}
            title="移除"
            className="grid size-7 place-items-center rounded-lg text-ink-faint transition hover:bg-rose-400/10 hover:text-rose-200"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>
    </article>
  )
}
