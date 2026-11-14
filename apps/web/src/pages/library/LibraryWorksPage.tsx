import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Film, Loader2, RefreshCw, Search, Upload } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'

import { useBreadcrumbs } from '@/components/layout/breadcrumbs'
import { api, ApiError } from '@/lib/api'
import { cn } from '@/lib/cn'
import { CreateWorkDialog } from '@/features/works/CreateWorkDialog'
import { WorkCard } from '@/features/works/WorkCard'
import {
  WORK_CHANGED_EVENT,
  type LibraryView,
  type WorkSummary,
} from '@/features/works/types'

type SortOption = 'created' | 'name' | 'year'

export function LibraryWorksPage() {
  const { libraryId = '' } = useParams()
  const navigate = useNavigate()
  const [library, setLibrary] = useState<LibraryView | null>(null)
  const [works, setWorks] = useState<WorkSummary[]>([])
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortOption>('created')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)

  useBreadcrumbs(
    useMemo(
      () => [
        { label: '媒体库', to: '/library' },
        { label: library?.name ?? '作品列表' },
      ],
      [library?.name],
    ),
  )

  const load = useCallback(
    async (silent = false) => {
      if (!libraryId) return
      if (!silent) setLoading(true)
      try {
        const data = await api.listWorks(libraryId, {
          q: query.trim() || undefined,
          sort,
        })
        setLibrary(data.library)
        setWorks(data.works)
        setError(null)
      } catch (reason) {
        setError(reason instanceof ApiError ? reason.message : '无法读取作品列表')
      } finally {
        setLoading(false)
      }
    },
    [libraryId, query, sort],
  )

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 180)
    return () => window.clearTimeout(timer)
  }, [load])

  useEffect(() => {
    const handler = () => void load(true)
    window.addEventListener(WORK_CHANGED_EVENT, handler)
    return () => window.removeEventListener(WORK_CHANGED_EVENT, handler)
  }, [load])

  const handleImported = useCallback(
    (workId: string) => {
      navigate(`/library/${libraryId}/works/${workId}`)
    },
    [libraryId, navigate],
  )

  const handleCloseCreate = useCallback(() => {
    setCreateOpen(false)
  }, [])

  return (
    <div className="flex h-full min-h-0 flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <h1 className="truncate text-[22px] font-semibold tracking-tight text-ink">
              {library?.name ?? '作品列表'}
            </h1>
            <span className="text-[12px] text-ink-faint">{works.length} 部电影</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void load(true)}
            aria-label="刷新作品列表"
            title="刷新"
            className="grid size-9 place-items-center rounded-lg border border-line bg-panel-2/60 text-ink-dim transition hover:border-line-strong hover:text-ink"
          >
            <RefreshCw className={cn('size-4', loading && 'animate-spin')} />
          </button>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-brand/50 bg-brand/15 px-3 py-1.5 text-[12px] font-medium text-brand-soft transition hover:bg-brand/20"
          >
            <Upload className="size-3.5" />
            艺术创作
          </button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-ink-faint" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索作品名称"
            className="h-9 w-full rounded-lg border border-line bg-panel-2/60 pl-9 pr-3 text-[12px] text-ink outline-none transition placeholder:text-ink-faint focus:border-brand/60"
          />
        </label>
        <select
          value={sort}
          onChange={(event) => setSort(event.target.value as SortOption)}
          className="h-9 rounded-lg border border-line bg-panel-2/60 px-3 text-[12px] text-ink outline-none transition focus:border-brand/60"
        >
          <option value="created">最近添加</option>
          <option value="name">按名称</option>
          <option value="year">按年份</option>
        </select>
      </div>

      {loading && works.length === 0 ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-[12.5px] text-ink-faint">
          <Loader2 className="size-4 animate-spin" />
          正在读取作品…
        </div>
      ) : error ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <AlertTriangle className="size-8 text-rose-300/80" strokeWidth={1.4} />
          <div className="max-w-md text-[12.5px] leading-relaxed text-ink-dim">{error}</div>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg border border-line bg-panel-2/70 px-3 py-1.5 text-[12px] text-ink-dim transition hover:border-line-strong hover:text-ink"
          >
            重试
          </button>
        </div>
      ) : works.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-line/80 bg-panel/25 text-center">
          <Film className="size-9 text-ink-faint/70" strokeWidth={1.4} />
          <div className="text-[13px] font-medium text-ink-dim">
            {query ? '没有匹配的作品' : '还没有电影作品'}
          </div>
          <p className="max-w-md text-[12px] leading-relaxed text-ink-faint">
            {query
              ? '换一个关键词试试。'
              : '选择本机视频上传，视频会被复制到作品集媒体库；之后可继续添加 NFO、字幕、海报、背景图和花絮。'}
          </p>
          {!query && (
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="mt-1 flex items-center gap-1.5 rounded-lg border border-brand/50 bg-brand/15 px-3 py-1.5 text-[11.5px] font-medium text-brand-soft transition hover:bg-brand/20"
            >
              <Upload className="size-3.5" />
              艺术创作
            </button>
          )}
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto pb-2">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(156px,1fr))] gap-x-4 gap-y-6">
            {works.map((work) => (
              <WorkCard
                key={work.id}
                work={work}
                onOpen={() => navigate(`/library/${libraryId}/works/${work.id}`)}
              />
            ))}
          </div>
        </div>
      )}

      <CreateWorkDialog
        open={createOpen}
        libraryId={libraryId}
        onClose={handleCloseCreate}
        onImported={handleImported}
      />
    </div>
  )
}
