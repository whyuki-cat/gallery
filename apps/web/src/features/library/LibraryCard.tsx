import {
  AlertTriangle,
  ChevronRight,
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
  onOpen?: () => void
  onEdit: () => void
  onDelete: () => void
}

export function LibraryCard({ library, onOpen, onEdit, onDelete }: LibraryCardProps) {
  const Icon = typeIcon(library.type)

  return (
    <article
      className={cn(
        'group relative aspect-video overflow-hidden rounded-2xl border border-line/80 bg-panel/40 transition',
        onOpen &&
          'hover:-translate-y-0.5 hover:border-line-strong hover:bg-panel-2/50 hover:shadow-[0_24px_56px_-34px_rgba(0,0,0,0.9)]',
      )}
    >
      {onOpen && (
        <button
          type="button"
          onClick={onOpen}
          aria-label={`进入媒体库 ${library.name}`}
          className="absolute inset-0 z-0 cursor-pointer rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
        />
      )}

      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(139,92,246,0.12),transparent_58%)]"
      />

      <div className="pointer-events-none relative z-[1] flex h-full flex-col p-3.5">
        <div className="flex items-start gap-2.5 pr-14">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-line bg-panel-2 text-brand-soft">
            <Icon className="size-4" strokeWidth={1.7} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <h3 className="truncate text-[13px] font-medium text-ink">{library.name}</h3>
              <span
                className={cn('size-1.5 shrink-0 rounded-full', STATUS_STYLES[library.status])}
              />
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px]">
              <span className="rounded border border-line bg-panel-2/60 px-1.5 py-0.5 text-ink-faint">
                {ORGANIZATION_LABELS[library.organization]}
              </span>
              {library.convention === 'jellyfin' && (
                <span className="rounded border border-line bg-panel-2/60 px-1.5 py-0.5 text-ink-faint">
                  Jellyfin
                </span>
              )}
              {library.type && (
                <span className="rounded border border-line bg-panel-2/60 px-1.5 py-0.5 text-ink-faint">
                  {TYPE_LABELS[library.type]}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="mt-2 min-h-0 flex-1 overflow-hidden text-[10.5px] leading-relaxed text-ink-faint">
          {library.issues.length > 0 ? (
            <div className="flex items-start gap-1 rounded-md border border-amber-400/20 bg-amber-400/5 px-1.5 py-1 text-amber-200">
              <AlertTriangle className="mt-px size-3 shrink-0" />
              <span className="line-clamp-2 min-w-0 break-all">{library.issues[0]}</span>
            </div>
          ) : library.organization === 'collection' ? (
            <span className="line-clamp-2">由媒体根路径托管，底层目录由系统维护。</span>
          ) : (
            <span className="line-clamp-2">
              {library.sources.length} 个来源
              {library.sources[0] && (
                <span className="mt-0.5 block truncate font-mono text-[10px] text-ink-faint/80">
                  {library.sources[0]}
                </span>
              )}
            </span>
          )}
        </div>

        <div className="mt-1.5 flex items-center gap-2 border-t border-line/60 pt-2">
          <span className="truncate text-[10px] text-ink-faint">
            {STATUS_LABELS[library.status]}
          </span>
          {onOpen && (
            <span className="ml-auto flex shrink-0 items-center gap-0.5 text-[10px] font-medium text-brand-soft/80 transition group-hover:text-brand-soft">
              {library.organization === 'collection' ? '作品列表' : '文件列表'}
              <ChevronRight className="size-3" />
            </span>
          )}
        </div>
      </div>

      <div className="absolute right-2 top-2 z-10 flex items-center gap-0.5">
        <button
          type="button"
          onClick={onEdit}
          aria-label={`编辑 ${library.name}`}
          title="编辑"
          className="grid size-6 place-items-center rounded-md border border-transparent bg-panel/70 text-ink-faint backdrop-blur transition hover:border-line hover:bg-panel-2 hover:text-ink"
        >
          <Pencil className="size-3" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label={`移除 ${library.name}`}
          title="移除"
          className="grid size-6 place-items-center rounded-md border border-transparent bg-panel/70 text-ink-faint backdrop-blur transition hover:border-rose-400/30 hover:bg-rose-400/10 hover:text-rose-200"
        >
          <Trash2 className="size-3" />
        </button>
      </div>
    </article>
  )
}
