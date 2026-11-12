import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  Captions,
  Clock,
  FileText,
  Film,
  Image as ImageIcon,
  Loader2,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Star,
  Tag,
  Trash2,
  Upload,
  Users,
  X,
} from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'

import {
  api,
  ApiError,
  workAssetThumbUrl,
  workAssetUrl,
  workBackdropUrl,
  workPosterUrl,
} from '@/lib/api'
import { cn } from '@/lib/cn'
import { ConfirmDialog } from '@/features/works/ConfirmDialog'
import { FilePicker } from '@/features/works/FilePicker'
import { RenameWorkDialog } from '@/features/works/RenameWorkDialog'
import { WorkPlayer } from '@/features/works/WorkPlayer'
import {
  WORK_KIND_LABELS,
  WORK_STATUS_LABELS,
  notifyWorksChanged,
  type WorkAssetView,
  type WorkDetail,
  type WorkPerson,
} from '@/features/works/types'

type AssetRole = 'nfo' | 'poster' | 'backdrop' | 'subtitle' | 'extra'

const ASSET_EXTENSIONS: Record<AssetRole, string[]> = {
  nfo: ['nfo'],
  poster: ['jpg', 'jpeg', 'png', 'webp', 'avif', 'gif', 'bmp', 'tif', 'tiff'],
  backdrop: ['jpg', 'jpeg', 'png', 'webp', 'avif', 'gif', 'bmp', 'tif', 'tiff'],
  subtitle: ['srt'],
  extra: [
    'mp4',
    'm4v',
    'mkv',
    'webm',
    'avi',
    'mov',
    'wmv',
    'flv',
    'ts',
    'm2ts',
    'jpg',
    'jpeg',
    'png',
    'webp',
    'avif',
    'gif',
    'bmp',
    'tif',
    'tiff',
  ],
}

const ASSET_TITLES: Record<AssetRole, string> = {
  nfo: '选择 NFO 元数据',
  poster: '选择海报图片',
  backdrop: '选择背景图片',
  subtitle: '选择 SRT 字幕',
  extra: '选择花絮文件',
}

interface Notice {
  kind: 'ok' | 'error'
  text: string
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  const value = bytes / 1024 ** index
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`
}

export function WorkDetailPage() {
  const { libraryId = '', workId = '' } = useParams()
  const navigate = useNavigate()
  const [work, setWork] = useState<WorkDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [pickerRole, setPickerRole] = useState<AssetRole | null>(null)
  const [assetBusy, setAssetBusy] = useState(false)
  const [removeTarget, setRemoveTarget] = useState<WorkAssetView | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [renameOpen, setRenameOpen] = useState(false)
  const [preview, setPreview] = useState<WorkAssetView | null>(null)
  const [nfoText, setNfoText] = useState<string | null>(null)
  const [nfoError, setNfoError] = useState<string | null>(null)

  const nfoId = work?.nfo?.id ?? null

  const load = useCallback(
    async (silent = false) => {
      if (!workId) return
      if (!silent) setLoading(true)
      try {
        const detail = await api.work(workId)
        setWork(detail)
        setError(null)
      } catch (reason) {
        setError(reason instanceof ApiError ? reason.message : '无法读取作品')
      } finally {
        setLoading(false)
      }
    },
    [workId],
  )

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), 5000)
    return () => window.clearTimeout(timer)
  }, [notice])

  useEffect(() => {
    if (!nfoId || !workId) {
      setNfoText(null)
      setNfoError(null)
      return
    }
    let cancelled = false
    setNfoError(null)
    api
      .workNfo(workId)
      .then((text) => {
        if (!cancelled) setNfoText(text)
      })
      .catch((reason) => {
        if (cancelled) return
        setNfoText(null)
        setNfoError(reason instanceof ApiError ? reason.message : '无法读取 NFO')
      })
    return () => {
      cancelled = true
    }
  }, [nfoId, workId])

  const metadata = work?.metadata ?? null

  const detailRows = useMemo(() => {
    if (!metadata) return []
    return [
      metadata.originalTitle && { label: '原始标题', value: metadata.originalTitle },
      metadata.premiered && { label: '上映日期', value: metadata.premiered },
      metadata.runtimeMinutes && { label: '时长', value: `${metadata.runtimeMinutes} 分钟` },
      metadata.rating !== null && { label: '评分', value: `${metadata.rating} / 10` },
      metadata.mpaa && { label: '分级', value: metadata.mpaa },
      metadata.genres.length > 0 && { label: '类型', value: metadata.genres.join('、') },
      metadata.studios.length > 0 && { label: '制片公司', value: metadata.studios.join('、') },
      metadata.uniqueIds.length > 0 && {
        label: '外部编号',
        value: metadata.uniqueIds.map((item) => `${item.type}: ${item.value}`).join('、'),
      },
    ].filter((row): row is { label: string; value: string } => Boolean(row))
  }, [metadata])

  const directors = useMemo<WorkPerson[]>(
    () => (metadata?.directors ?? []).map((name) => ({ name, role: null })),
    [metadata],
  )
  const writers = useMemo<WorkPerson[]>(
    () => (metadata?.writers ?? []).map((name) => ({ name, role: null })),
    [metadata],
  )
  const actors = metadata?.actors ?? []
  const hasCredits = directors.length + writers.length + actors.length > 0

  async function handlePick(path: string): Promise<void> {
    const role = pickerRole
    setPickerRole(null)
    if (!role || !work) return
    setAssetBusy(true)
    try {
      await api.addWorkAsset(work.id, { role, sourcePath: path })
      await load(true)
      notifyWorksChanged()
      setNotice({ kind: 'ok', text: '资源已添加' })
    } catch (reason) {
      setNotice({
        kind: 'error',
        text: reason instanceof ApiError ? reason.message : '添加资源失败',
      })
    } finally {
      setAssetBusy(false)
    }
  }

  async function handleRemoveAsset(): Promise<void> {
    if (!removeTarget || !work) return
    setAssetBusy(true)
    try {
      await api.removeWorkAsset(work.id, removeTarget.id)
      setRemoveTarget(null)
      await load(true)
      notifyWorksChanged()
      setNotice({ kind: 'ok', text: '资源已移除' })
    } catch (reason) {
      setNotice({
        kind: 'error',
        text: reason instanceof ApiError ? reason.message : '移除资源失败',
      })
    } finally {
      setAssetBusy(false)
    }
  }

  async function handleDelete(): Promise<void> {
    if (!work) return
    setDeleting(true)
    try {
      const result = await api.deleteWork(work.id)
      if (!result.deleted) {
        setNotice({
          kind: 'error',
          text: result.failed[0]?.message ?? '删除作品失败',
        })
        setDeleteOpen(false)
        return
      }
      notifyWorksChanged()
      navigate(`/library/${libraryId}/works`)
    } catch (reason) {
      setNotice({
        kind: 'error',
        text: reason instanceof ApiError ? reason.message : '删除作品失败',
      })
      setDeleteOpen(false)
    } finally {
      setDeleting(false)
    }
  }

  function scrollToPlayer(): void {
    document.getElementById('work-player')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  if (loading && !work) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-[12.5px] text-ink-faint">
        <Loader2 className="size-4 animate-spin" />
        正在读取作品…
      </div>
    )
  }

  if (error && !work) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <AlertTriangle className="size-8 text-rose-300/80" strokeWidth={1.4} />
        <div className="max-w-md text-[12.5px] leading-relaxed text-ink-dim">{error}</div>
        <button
          type="button"
          onClick={() => navigate(`/library/${libraryId}/works`)}
          className="rounded-lg border border-line bg-panel-2/70 px-3 py-1.5 text-[12px] text-ink-dim transition hover:border-line-strong hover:text-ink"
        >
          返回作品列表
        </button>
      </div>
    )
  }

  if (!work) return null

  const plot = metadata?.plot ?? metadata?.outline ?? null

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto pb-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => navigate(`/library/${libraryId}/works`)}
          className="flex items-center gap-1.5 text-[11px] text-ink-faint transition hover:text-ink"
        >
          <ArrowLeft className="size-3.5" />
          返回作品列表
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setRenameOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-line bg-panel-2/60 px-2.5 py-1.5 text-[11px] text-ink-dim transition hover:border-line-strong hover:text-ink"
          >
            <Pencil className="size-3.5" />
            重命名
          </button>
          <button
            type="button"
            onClick={() => setDeleteOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-rose-400/30 bg-rose-400/10 px-2.5 py-1.5 text-[11px] text-rose-200 transition hover:bg-rose-400/15"
          >
            <Trash2 className="size-3.5" />
            删除作品
          </button>
        </div>
      </div>

      {/* 电影主视觉：背景图 + 海报 + 标题信息 */}
      <section className="relative overflow-hidden rounded-2xl border border-line/70 bg-panel/40">
        {work.backdrop ? (
          <img
            src={workBackdropUrl(work.id, 1920)}
            alt=""
            className="absolute inset-0 size-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-[linear-gradient(130deg,rgba(139,92,246,0.22),rgba(7,7,10,0.96))]" />
        )}
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(7,7,10,0.2),rgba(7,7,10,0.72)_52%,rgba(7,7,10,0.96))]" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(7,7,10,0.82),rgba(7,7,10,0.25)_55%,transparent)]" />

        <div className="relative flex flex-col gap-5 p-5 sm:p-6 md:flex-row md:items-end">
          <div className="w-[136px] shrink-0 overflow-hidden rounded-xl border border-white/10 bg-panel-2 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.95)] sm:w-[168px]">
            {work.poster ? (
              <img
                src={workPosterUrl(work.id, 600)}
                alt={work.name}
                className="aspect-[2/3] w-full object-cover"
              />
            ) : (
              <div className="flex aspect-[2/3] flex-col items-center justify-center gap-2 text-white/35">
                <Film className="size-8" strokeWidth={1.3} />
                <span className="text-[10px]">暂无海报</span>
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 text-[10.5px]">
              <span className="rounded border border-white/15 bg-white/10 px-1.5 py-0.5 text-white/70">
                {WORK_KIND_LABELS[work.kind]}
              </span>
              {work.status !== 'ok' && (
                <span className="flex items-center gap-1 rounded border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.5 text-amber-200">
                  <AlertTriangle className="size-3" />
                  {WORK_STATUS_LABELS[work.status]}
                </span>
              )}
            </div>

            <h1 className="mt-2 text-[25px] font-semibold leading-tight tracking-tight text-white sm:text-[30px]">
              {work.name}
            </h1>
            {metadata?.originalTitle && metadata.originalTitle !== work.name && (
              <div className="mt-0.5 truncate text-[12.5px] italic text-white/50">
                {metadata.originalTitle}
              </div>
            )}

            <div className="mt-2.5 flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-[12px] text-white/75">
              {work.year && (
                <span className="flex items-center gap-1.5">
                  <Calendar className="size-3.5" />
                  {work.year}
                </span>
              )}
              {metadata?.mpaa && (
                <span className="rounded border border-white/25 px-1.5 py-px text-[10.5px] text-white/70">
                  {metadata.mpaa}
                </span>
              )}
              {metadata?.runtimeMinutes && (
                <span className="flex items-center gap-1.5">
                  <Clock className="size-3.5" />
                  {metadata.runtimeMinutes} 分钟
                </span>
              )}
              {metadata?.rating != null && (
                <span className="flex items-center gap-1 font-medium text-amber-300">
                  <Star className="size-3.5" fill="currentColor" strokeWidth={1.5} />
                  {metadata.rating}
                </span>
              )}
            </div>

            {metadata && metadata.genres.length > 0 && (
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                {metadata.genres.map((genre) => (
                  <span
                    key={genre}
                    className="flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] text-white/65"
                  >
                    <Tag className="size-2.5" />
                    {genre}
                  </span>
                ))}
              </div>
            )}

            {metadata?.tagline && (
              <p className="mt-3 text-[12px] italic text-white/50">“{metadata.tagline}”</p>
            )}

            <p className="mt-2.5 max-w-3xl text-[12.5px] leading-relaxed text-white/70">
              {plot ??
                '暂未添加 NFO 元数据。添加 NFO 后可显示简介、类型、导演、演员等信息。'}
            </p>

            {work.issues.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {work.issues.map((issue) => (
                  <span
                    key={`${issue.code}-${issue.message}`}
                    className="flex items-center gap-1 rounded border border-amber-400/25 bg-amber-400/10 px-2 py-1 text-[10px] text-amber-200"
                  >
                    <AlertTriangle className="size-3" />
                    {issue.message}
                  </span>
                ))}
              </div>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={scrollToPlayer}
                className="flex items-center gap-2 rounded-full bg-white px-5 py-2 text-[12px] font-semibold text-black shadow-[0_12px_30px_-12px_rgba(255,255,255,0.55)] transition hover:bg-white/90 active:scale-[0.98]"
              >
                <Play className="size-4" fill="currentColor" strokeWidth={1.5} />
                播放
              </button>
              <button
                type="button"
                onClick={() => setPickerRole('nfo')}
                className="flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-[11.5px] text-white/80 backdrop-blur transition hover:bg-white/15"
              >
                <FileText className="size-3.5" />
                {work.nfo ? '替换 NFO' : '添加 NFO'}
              </button>
            </div>
          </div>
        </div>
      </section>

      <div id="work-player">
        <WorkPlayer work={work} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <section className="overflow-hidden rounded-2xl border border-line/80 bg-panel/40">
            <header className="flex items-center justify-between gap-2 border-b border-line/60 px-4 py-3">
              <div>
                <h2 className="text-[13px] font-semibold text-ink">详细信息</h2>
                <p className="mt-0.5 text-[11px] text-ink-faint">
                  来自本机 NFO，不访问网络，不执行刮削。
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPickerRole('nfo')}
                className="flex items-center gap-1.5 rounded-lg border border-line bg-panel-2/60 px-2.5 py-1.5 text-[11px] text-ink-dim transition hover:border-line-strong hover:text-ink"
              >
                {work.nfo ? <RefreshCw className="size-3.5" /> : <Plus className="size-3.5" />}
                {work.nfo ? '替换' : '添加'}
              </button>
            </header>

            <div className="px-4 py-3">
              {work.metadataError && (
                <div className="flex items-start gap-1.5 rounded-lg border border-amber-400/25 bg-amber-400/5 px-3 py-2 text-[11px] leading-relaxed text-amber-200">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  {work.metadataError}
                </div>
              )}

              {!metadata && !work.metadataError && (
                <div className="rounded-xl border border-dashed border-line/80 px-3 py-8 text-center text-[11.5px] text-ink-faint">
                  还没有 NFO 元数据。添加 `movie.nfo` 后可显示年份、简介、类型、导演与演员。
                </div>
              )}

              {detailRows.length > 0 && (
                <dl className="grid gap-x-8 gap-y-2.5 text-[11.5px] sm:grid-cols-2">
                  {detailRows.map((row) => (
                    <div key={row.label} className="flex min-w-0 gap-2">
                      <dt className="w-[4.5rem] shrink-0 text-ink-faint">{row.label}</dt>
                      <dd className="min-w-0 break-words text-ink-dim">{row.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          </section>

          {hasCredits && (
            <section className="overflow-hidden rounded-2xl border border-line/80 bg-panel/40">
              <header className="flex items-center gap-2 border-b border-line/60 px-4 py-3">
                <Users className="size-3.5 text-brand-soft" />
                <h2 className="text-[13px] font-semibold text-ink">演职人员</h2>
              </header>
              <div className="space-y-4 px-4 py-4">
                {directors.length > 0 && <PeopleRow label="导演" people={directors} />}
                {writers.length > 0 && <PeopleRow label="编剧" people={writers} />}
                {actors.length > 0 && <PeopleRow label="演员" people={actors} />}
              </div>
            </section>
          )}

          <section className="overflow-hidden rounded-2xl border border-line/80 bg-panel/40">
            <header className="flex items-center justify-between gap-2 border-b border-line/60 px-4 py-3">
              <div>
                <h2 className="text-[13px] font-semibold text-ink">花絮</h2>
                <p className="mt-0.5 text-[11px] text-ink-faint">
                  `extras/` 目录中的视频与图片。
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPickerRole('extra')}
                className="flex items-center gap-1.5 rounded-lg border border-line bg-panel-2/60 px-2.5 py-1.5 text-[11px] text-ink-dim transition hover:border-line-strong hover:text-ink"
              >
                <Plus className="size-3.5" />
                添加花絮
              </button>
            </header>

            <div className="px-4 py-4">
              {work.extras.length === 0 ? (
                <div className="rounded-xl border border-dashed border-line/80 px-3 py-8 text-center text-[11.5px] text-ink-faint">
                  还没有花絮。可以添加视频或图片，文件会复制到作品的 `extras/` 目录。
                </div>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {work.extras.map((asset) => (
                    <div
                      key={asset.id}
                      className="group/item relative overflow-hidden rounded-xl border border-line/80 bg-panel-2/50"
                    >
                      <button
                        type="button"
                        onClick={() => setPreview(asset)}
                        className="block w-full text-left"
                      >
                        <div className="aspect-video w-full overflow-hidden bg-black/40">
                          {asset.kind === 'image' ? (
                            <img
                              src={workAssetUrl(work.id, asset.id)}
                              alt={asset.originalName}
                              loading="lazy"
                              className="size-full object-cover transition group-hover/item:scale-[1.02]"
                            />
                          ) : (
                            <img
                              src={workAssetThumbUrl(work.id, asset.id, 480)}
                              alt={asset.originalName}
                              loading="lazy"
                              className="size-full object-cover transition group-hover/item:scale-[1.02]"
                            />
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 px-2.5 py-2">
                          {asset.kind === 'video' ? (
                            <Play className="size-3 shrink-0 text-brand-soft" />
                          ) : (
                            <ImageIcon className="size-3 shrink-0 text-brand-soft" />
                          )}
                          <span className="truncate text-[11px] text-ink-dim">
                            {asset.originalName}
                          </span>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => setRemoveTarget(asset)}
                        aria-label={`移除花絮 ${asset.originalName}`}
                        className="absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-md border border-white/15 bg-black/55 text-white/70 opacity-0 backdrop-blur transition hover:bg-rose-500/40 hover:text-white group-hover/item:opacity-100"
                      >
                        <Trash2 className="size-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          <AssetPanel
            title="海报"
            description="Jellyfin 风格 `poster.*`"
            imageUrl={work.poster ? workPosterUrl(work.id, 500) : null}
            emptyText="未添加海报"
            busy={assetBusy}
            onReplace={() => setPickerRole('poster')}
            onRemove={work.poster ? () => setRemoveTarget(work.poster) : undefined}
          />

          <AssetPanel
            title="背景图"
            description="Jellyfin 风格 `backdrop.*`"
            imageUrl={work.backdrop ? workBackdropUrl(work.id, 900) : null}
            emptyText="未添加背景图"
            busy={assetBusy}
            onReplace={() => setPickerRole('backdrop')}
            onRemove={work.backdrop ? () => setRemoveTarget(work.backdrop) : undefined}
          />

          <section className="rounded-2xl border border-line/80 bg-panel/40 p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-[13px] font-semibold text-ink">字幕</h2>
                <p className="mt-0.5 text-[11px] text-ink-faint">
                  SRT 会在播放时转换为 WebVTT。
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPickerRole('subtitle')}
                className="flex items-center gap-1.5 rounded-lg border border-line bg-panel-2/60 px-2.5 py-1.5 text-[11px] text-ink-dim transition hover:border-line-strong hover:text-ink"
              >
                <Plus className="size-3.5" />
                添加
              </button>
            </div>

            {work.subtitles.length === 0 ? (
              <div className="mt-3 rounded-xl border border-dashed border-line/80 px-3 py-5 text-center text-[11px] text-ink-faint">
                还没有字幕
              </div>
            ) : (
              <div className="mt-3 space-y-1.5">
                {work.subtitles.map((asset) => (
                  <div
                    key={asset.id}
                    className="flex items-center gap-2 rounded-lg border border-line/70 bg-panel-2/40 px-2.5 py-2"
                  >
                    <Captions className="size-3.5 shrink-0 text-brand-soft" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[11px] text-ink-dim">
                        {asset.label ?? '字幕'}
                      </div>
                      <div className="truncate font-mono text-[9.5px] text-ink-faint">
                        {asset.fileName}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setRemoveTarget(asset)}
                      aria-label={`移除字幕 ${asset.originalName}`}
                      className="grid size-6 shrink-0 place-items-center rounded-md text-ink-faint transition hover:bg-rose-400/10 hover:text-rose-200"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-line/80 bg-panel/40 p-4">
            <h2 className="text-[13px] font-semibold text-ink">媒体信息</h2>
            <dl className="mt-2 space-y-1.5 text-[10.5px]">
              <div className="flex gap-2">
                <dt className="w-14 shrink-0 text-ink-faint">主视频</dt>
                <dd className="min-w-0 truncate font-mono text-ink-dim">
                  {work.video?.fileName ?? '缺失'}
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-14 shrink-0 text-ink-faint">大小</dt>
                <dd className="font-mono text-ink-dim">
                  {work.video ? formatBytes(work.video.size) : '—'}
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-14 shrink-0 text-ink-faint">NFO</dt>
                <dd className="min-w-0 truncate font-mono text-ink-dim">
                  {work.nfo?.fileName ?? '未添加'}
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-14 shrink-0 text-ink-faint">字幕</dt>
                <dd className="text-ink-dim">{work.subtitles.length} 条</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-14 shrink-0 text-ink-faint">花絮</dt>
                <dd className="text-ink-dim">{work.extras.length} 个</dd>
              </div>
            </dl>

            {work.nfo && (
              <details className="mt-3 rounded-lg border border-line/70 bg-panel-2/40">
                <summary className="cursor-pointer px-3 py-2 text-[10.5px] text-ink-dim">
                  查看原始 NFO（{work.nfo.fileName}）
                </summary>
                <div className="border-t border-line/60 p-3">
                  {nfoError ? (
                    <div className="text-[11px] text-rose-200">{nfoError}</div>
                  ) : nfoText === null ? (
                    <div className="text-[11px] text-ink-faint">正在读取…</div>
                  ) : (
                    <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words font-mono text-[10px] leading-relaxed text-ink-faint">
                      {nfoText}
                    </pre>
                  )}
                </div>
              </details>
            )}
          </section>
        </aside>
      </div>

      <FilePicker
        open={pickerRole !== null}
        title={pickerRole ? ASSET_TITLES[pickerRole] : '选择文件'}
        extensions={pickerRole ? ASSET_EXTENSIONS[pickerRole] : []}
        onClose={() => setPickerRole(null)}
        onSelect={(path) => void handlePick(path)}
      />

      <ConfirmDialog
        open={removeTarget !== null}
        title="移除资源"
        description={`确定移除「${removeTarget?.originalName ?? ''}」吗？文件会从作品目录中删除。`}
        confirmLabel="移除"
        danger
        busy={assetBusy}
        onConfirm={() => void handleRemoveAsset()}
        onClose={() => setRemoveTarget(null)}
      />

      <ConfirmDialog
        open={deleteOpen}
        title="删除作品"
        description="将删除作品目录及全部资源，无法撤销。删除作品不需要删除保护密码。"
        confirmLabel="删除作品"
        danger
        busy={deleting}
        onConfirm={() => void handleDelete()}
        onClose={() => setDeleteOpen(false)}
      />

      <RenameWorkDialog
        open={renameOpen}
        work={work}
        onClose={() => setRenameOpen(false)}
        onRenamed={(updated) => {
          setWork(updated)
          notifyWorksChanged()
          setNotice({ kind: 'ok', text: '作品名称已更新' })
        }}
      />

      {preview && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`预览 ${preview.originalName}`}
          className="fixed inset-0 z-[70] flex flex-col bg-black/85 p-5 backdrop-blur-sm"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) setPreview(null)
          }}
        >
          <div className="mb-4 flex shrink-0 items-start gap-4 text-ink">
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-medium">{preview.originalName}</div>
              <div className="mt-0.5 text-[10.5px] text-ink-faint">
                {preview.kind === 'video' ? '花絮视频' : '花絮图片'}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setPreview(null)}
              aria-label="关闭预览"
              className="grid size-9 place-items-center rounded-full border border-white/20 bg-black/55 text-white/80 transition hover:border-brand/60 hover:bg-brand/25 hover:text-white"
            >
              <X className="size-4" />
            </button>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden">
            {preview.kind === 'video' ? (
              <video
                src={workAssetUrl(work.id, preview.id)}
                controls
                autoPlay
                playsInline
                className="max-h-full max-w-full rounded-lg bg-black shadow-2xl"
              />
            ) : (
              <img
                src={workAssetUrl(work.id, preview.id)}
                alt={preview.originalName}
                className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
              />
            )}
          </div>
        </div>
      )}

      {assetBusy && (
        <div className="fixed bottom-5 right-5 z-[80] flex items-center gap-2 rounded-xl border border-line-strong bg-panel-2/90 px-3.5 py-2.5 text-[11.5px] text-ink-dim shadow-lg backdrop-blur">
          <Loader2 className="size-4 animate-spin text-brand-soft" />
          正在处理资源…
        </div>
      )}

      {notice && (
        <div
          className={cn(
            'fixed bottom-5 left-1/2 z-[80] flex max-w-md -translate-x-1/2 items-start gap-2 rounded-xl border px-3.5 py-2.5 text-[11.5px] shadow-2xl backdrop-blur',
            notice.kind === 'ok'
              ? 'border-emerald-400/25 bg-emerald-950/80 text-emerald-200'
              : 'border-rose-400/25 bg-rose-950/80 text-rose-200',
          )}
        >
          <span className="leading-relaxed">{notice.text}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            aria-label="关闭提示"
            className="text-current/70 transition hover:text-current"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}

function PeopleRow({ label, people }: { label: string; people: WorkPerson[] }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
        {label}
      </div>
      <div className="mt-2 flex gap-3 overflow-x-auto pb-1">
        {people.map((person) => (
          <div
            key={`${label}-${person.name}-${person.role ?? ''}`}
            className="w-[76px] shrink-0 text-center"
          >
            <div className="mx-auto grid size-14 place-items-center rounded-full border border-line bg-[linear-gradient(140deg,rgba(139,92,246,0.35),rgba(34,211,238,0.16))] text-[16px] font-semibold text-white/85">
              {person.name.trim().slice(0, 1)}
            </div>
            <div className="mt-1.5 truncate text-[10.5px] text-ink-dim" title={person.name}>
              {person.name}
            </div>
            {person.role && (
              <div className="truncate text-[9.5px] text-ink-faint" title={person.role}>
                {person.role}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function AssetPanel({
  title,
  description,
  imageUrl,
  emptyText,
  busy,
  onReplace,
  onRemove,
}: {
  title: string
  description: string
  imageUrl: string | null
  emptyText: string
  busy: boolean
  onReplace: () => void
  onRemove?: () => void
}) {
  return (
    <section className="rounded-2xl border border-line/80 bg-panel/40 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-[13px] font-semibold text-ink">{title}</h2>
          <p className="mt-0.5 text-[11px] text-ink-faint">{description}</p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onReplace}
            disabled={busy}
            className="flex items-center gap-1 rounded-md border border-line bg-panel-2/60 px-2 py-1 text-[10.5px] text-ink-dim transition hover:border-line-strong hover:text-ink disabled:opacity-40"
          >
            {imageUrl ? <RefreshCw className="size-3" /> : <Upload className="size-3" />}
            {imageUrl ? '替换' : '添加'}
          </button>
          {imageUrl && onRemove && (
            <button
              type="button"
              onClick={onRemove}
              disabled={busy}
              aria-label={`移除${title}`}
              className="grid size-6 place-items-center rounded-md text-ink-faint transition hover:bg-rose-400/10 hover:text-rose-200 disabled:opacity-40"
            >
              <Trash2 className="size-3" />
            </button>
          )}
        </div>
      </div>

      <div className="mt-3 overflow-hidden rounded-xl border border-line/70 bg-black/30">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={title}
            className={cn(
              'w-full object-cover',
              title === '海报' ? 'aspect-[2/3]' : 'aspect-video',
            )}
          />
        ) : (
          <div
            className={cn(
              'flex flex-col items-center justify-center gap-2 text-[10.5px] text-ink-faint',
              title === '海报' ? 'aspect-[2/3]' : 'aspect-video',
            )}
          >
            <ImageIcon className="size-6" strokeWidth={1.4} />
            {emptyText}
          </div>
        )}
      </div>
    </section>
  )
}
