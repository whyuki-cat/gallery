import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Clock,
  Film,
  Image as ImageIcon,
  Loader2,
  Pencil,
  Play,
  Plus,
  Settings2,
  Star,
  Trash2,
  X,
} from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'

import { useBreadcrumbs } from '@/components/layout/breadcrumbs'
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
import {
  WorkAssetsDrawer,
  type AssetPickerRole,
} from '@/features/works/WorkAssetsDrawer'
import { WorkPlayer } from '@/features/works/WorkPlayer'
import {
  WORK_KIND_LABELS,
  WORK_STATUS_LABELS,
  notifyWorksChanged,
  type WorkAssetView,
  type WorkDetail,
  type WorkPerson,
} from '@/features/works/types'

const ASSET_EXTENSIONS: Record<AssetPickerRole, string[]> = {
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

const ASSET_TITLES: Record<AssetPickerRole, string> = {
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

export function WorkDetailPage() {
  const { libraryId = '', workId = '' } = useParams()
  const navigate = useNavigate()
  const [work, setWork] = useState<WorkDetail | null>(null)
  const [libraryName, setLibraryName] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [pickerRole, setPickerRole] = useState<AssetPickerRole | null>(null)
  const [assetsOpen, setAssetsOpen] = useState(false)
  const [assetBusy, setAssetBusy] = useState(false)
  const [removeTarget, setRemoveTarget] = useState<WorkAssetView | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [renameOpen, setRenameOpen] = useState(false)
  const [playerOpen, setPlayerOpen] = useState(false)
  const [preview, setPreview] = useState<WorkAssetView | null>(null)
  const [nfoText, setNfoText] = useState<string | null>(null)
  const [nfoError, setNfoError] = useState<string | null>(null)

  const nfoId = work?.nfo?.id ?? null
  const libraryOfWork = work?.libraryId ?? ''

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
    if (!libraryOfWork) return
    let cancelled = false
    api
      .libraryOverview()
      .then((data) => {
        if (cancelled) return
        const match = data.libraries.find((item) => item.id === libraryOfWork)
        setLibraryName(match?.name ?? '')
      })
      .catch(() => {
        if (!cancelled) setLibraryName('')
      })
    return () => {
      cancelled = true
    }
  }, [libraryOfWork])

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

  useEffect(() => {
    if (!preview && !playerOpen) return
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPreview(null)
        setPlayerOpen(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [playerOpen, preview])

  const breadcrumbs = useMemo(
    () => [
      { label: '媒体库', to: '/library' },
      ...(libraryName
        ? [{ label: libraryName, to: `/library/${libraryId}/works` }]
        : []),
      { label: work?.name ?? '作品详情' },
    ],
    [libraryId, libraryName, work?.name],
  )
  useBreadcrumbs(breadcrumbs)

  const metadata = work?.metadata ?? null
  const credits = useMemo<WorkPerson[]>(() => {
    if (!metadata) return []
    return [
      ...metadata.directors.map((name) => ({ name, role: '导演' })),
      ...metadata.writers.map((name) => ({ name, role: '编剧' })),
      ...metadata.actors,
    ]
  }, [metadata])

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
    <div className="-mx-8 -mt-8 flex h-[calc(100%_+_4rem)] min-h-0 flex-col overflow-y-auto">
      {/* 电影主视觉：背景图 + 海报 + 标题信息 */}
      <section className="relative shrink-0 overflow-hidden">
        {work.backdrop ? (
          <img
            src={workBackdropUrl(work.id, 1920)}
            alt=""
            className="absolute inset-0 size-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-[linear-gradient(130deg,rgba(139,92,246,0.26),rgba(7,7,10,0.98))]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-canvas via-canvas/65 to-black/10" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/40 to-transparent" />

        <div className="relative mx-auto w-full max-w-[1440px] px-8 pb-8 pt-10">
          <div className="relative flex flex-col gap-6 md:flex-row md:items-start md:gap-8">
            <div
              data-detail-poster
              className="w-[168px] shrink-0 sm:w-[208px] lg:w-[264px]"
            >
              <div className="overflow-hidden rounded-lg border border-white/10 bg-panel-2 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.95)]">
                {work.poster ? (
                  <img
                    src={workPosterUrl(work.id, 600)}
                    alt={work.name}
                    className="aspect-[2/3] w-full object-cover"
                  />
                ) : (
                  <div className="flex aspect-[2/3] w-full flex-col items-center justify-center gap-2 text-white/35">
                    <Film className="size-8" strokeWidth={1.3} />
                    <span className="text-[10px]">暂无海报</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex min-w-0 flex-col md:flex-1 xl:absolute xl:inset-y-0 xl:left-[296px] xl:right-0 xl:pb-7">
              <div className="min-w-0 xl:min-h-0 xl:flex-1 xl:overflow-hidden">
                <div className="flex flex-wrap items-center gap-2 text-[10.5px]">
                  <span className="rounded border border-white/20 bg-white/10 px-1.5 py-0.5 text-white/75">
                    {WORK_KIND_LABELS[work.kind]}
                  </span>
                  {work.status !== 'ok' && (
                    <span className="flex items-center gap-1 rounded border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.5 text-amber-200">
                      <AlertTriangle className="size-3" />
                      {WORK_STATUS_LABELS[work.status]}
                    </span>
                  )}
                </div>

                <h1 className="mt-2.5 text-[28px] font-semibold leading-tight tracking-tight text-white sm:text-[34px]">
                  {work.name}
                </h1>
                {metadata?.originalTitle && metadata.originalTitle !== work.name && (
                  <div className="mt-1 truncate text-[13px] italic text-white/50">
                    {metadata.originalTitle}
                  </div>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-white/75">
                  {work.year && <span>{work.year}</span>}
                  {metadata?.mpaa && (
                    <span className="rounded border border-white/30 px-1.5 py-px text-[10.5px] text-white/75">
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
                  <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-white/65">
                    {metadata.genres.map((genre, index) => (
                      <span key={genre} className="flex items-center gap-2">
                        {index > 0 && <span className="text-white/30">·</span>}
                        {genre}
                      </span>
                    ))}
                  </div>
                )}

                {metadata?.tagline && (
                  <p className="mt-4 text-[13px] italic text-white/50">“{metadata.tagline}”</p>
                )}

                <p className="mt-3 max-w-3xl text-[13.5px] leading-relaxed text-white/75">
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

              </div>

              <div
                data-detail-actions
                className="mt-5 flex flex-wrap items-center gap-2.5 xl:mt-0 xl:shrink-0 xl:pt-4"
              >
                <button
                  type="button"
                  onClick={() => setPlayerOpen(true)}
                  className="flex h-10 items-center gap-2 rounded-lg bg-brand px-6 text-[13px] font-semibold text-white shadow-[0_12px_30px_-14px_rgba(139,92,246,0.9)] transition hover:brightness-110 active:scale-[0.99]"
                >
                  <Play className="size-4" fill="currentColor" strokeWidth={1.5} />
                  播放
                </button>
                <button
                  type="button"
                  onClick={() => setAssetsOpen(true)}
                  className="flex h-10 items-center gap-1.5 rounded-lg border border-white/20 bg-white/10 px-4 text-[12px] text-white/85 backdrop-blur transition hover:bg-white/15"
                >
                  <Settings2 className="size-3.5" />
                  管理资源
                </button>
                <button
                  type="button"
                  onClick={() => setRenameOpen(true)}
                  aria-label="重命名作品"
                  title="重命名"
                  className="grid size-10 place-items-center rounded-full border border-white/20 bg-white/5 text-white/75 transition hover:bg-white/15 hover:text-white"
                >
                  <Pencil className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteOpen(true)}
                  aria-label="删除作品"
                  title="删除作品"
                  className="grid size-10 place-items-center rounded-full border border-rose-300/30 bg-rose-400/10 text-rose-200 transition hover:bg-rose-400/20"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto w-full max-w-[1440px] px-8 pb-10">
        {/* 花絮：16:9 缩略图横向滚动，点击预览 */}
        <section className="pt-9">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-[19px] font-semibold tracking-tight text-ink">花絮</h2>
              {work.extras.length > 0 && (
                <p className="mt-0.5 text-[11.5px] text-ink-faint">
                  {work.extras.length} 个视频或图片
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setPickerRole('extra')}
              className="flex items-center gap-1.5 rounded-lg border border-line bg-panel-2/60 px-2.5 py-1.5 text-[11px] text-ink-dim transition hover:border-line-strong hover:text-ink"
            >
              <Plus className="size-3.5" />
              添加花絮
            </button>
          </div>

          {work.extras.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line/80 px-3 py-9 text-center text-[11.5px] text-ink-faint">
              <ImageIcon className="size-6" strokeWidth={1.4} />
              还没有花絮。可以添加视频或图片，文件会复制到作品的 extras/ 目录。
            </div>
          ) : (
            <div className="flex gap-3 overflow-x-auto pb-2">
              {work.extras.map((asset) => (
                <div
                  key={asset.id}
                  className="group relative aspect-video w-[236px] shrink-0 overflow-hidden rounded-lg border border-line/80 bg-panel-2/40 transition hover:border-brand/60 sm:w-[280px]"
                >
                  <button
                    type="button"
                    onClick={() => setPreview(asset)}
                    aria-label={`预览花絮 ${asset.originalName}`}
                    title={asset.originalName}
                    className="absolute inset-0 z-0 block"
                  >
                    <img
                      src={
                        asset.kind === 'image'
                          ? workAssetUrl(work.id, asset.id)
                          : workAssetThumbUrl(work.id, asset.id, 640)
                      }
                      alt={asset.originalName}
                      loading="lazy"
                      className="size-full object-cover transition duration-300 group-hover:scale-[1.03]"
                    />
                    <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />
                    {asset.kind === 'video' && (
                      <span className="pointer-events-none absolute inset-0 grid place-items-center">
                        <span className="grid size-10 place-items-center rounded-full border border-white/40 bg-black/55 text-white backdrop-blur">
                          <Play className="ml-0.5 size-4" fill="currentColor" strokeWidth={1.5} />
                        </span>
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setRemoveTarget(asset)}
                    aria-label={`移除花絮 ${asset.originalName}`}
                    className="absolute right-2 top-2 z-10 grid size-7 place-items-center rounded-md border border-white/15 bg-black/55 text-white/75 opacity-0 backdrop-blur transition hover:bg-rose-500/40 hover:text-white focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 演职人员：圆形头像 + 横向滚动 */}
        {credits.length > 0 && (
          <section className="pt-9">
            <h2 className="text-[19px] font-semibold tracking-tight text-ink">演职人员</h2>
            <div className="mt-4 flex gap-5 overflow-x-auto pb-2">
              {credits.map((person, index) => (
                <div
                  key={`${person.name}-${person.role ?? ''}-${index}`}
                  className="w-[96px] shrink-0 text-center"
                >
                  <div className="mx-auto grid size-[92px] place-items-center rounded-full border border-line bg-[linear-gradient(140deg,rgba(139,92,246,0.4),rgba(34,211,238,0.16))] text-[22px] font-semibold text-white/90">
                    {person.name.trim().slice(0, 1)}
                  </div>
                  <div className="mt-2 truncate text-[12.5px] text-ink" title={person.name}>
                    {person.name}
                  </div>
                  {person.role && (
                    <div className="truncate text-[11px] text-ink-faint" title={person.role}>
                      {person.role}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      <WorkAssetsDrawer
        open={assetsOpen}
        work={work}
        busy={assetBusy}
        nfoText={nfoText}
        nfoError={nfoError}
        onClose={() => setAssetsOpen(false)}
        onPick={(role) => {
          setAssetsOpen(false)
          setPickerRole(role)
        }}
        onRemove={(asset) => setRemoveTarget(asset)}
      />

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

      {playerOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`播放 ${work.name}`}
          className="fixed inset-0 z-[85] flex flex-col bg-black/95 p-4 backdrop-blur-sm sm:p-6"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) setPlayerOpen(false)
          }}
        >
          <div className="mx-auto flex w-full max-w-[1200px] shrink-0 items-center justify-between gap-4 pb-4">
            <div className="min-w-0">
              <div className="truncate text-[13px] font-medium text-white">{work.name}</div>
              <div className="mt-0.5 text-[10.5px] text-white/45">主视频</div>
            </div>
            <button
              type="button"
              onClick={() => setPlayerOpen(false)}
              aria-label="关闭播放器"
              className="grid size-10 shrink-0 place-items-center rounded-full border border-white/20 bg-black/55 text-white/85 backdrop-blur transition hover:border-brand/60 hover:bg-brand/25 hover:text-white"
            >
              <X className="size-5" />
            </button>
          </div>
          <div className="mx-auto flex min-h-0 w-full max-w-[1200px] flex-1 items-center justify-center">
            <div className="w-full">
              <WorkPlayer work={work} />
            </div>
          </div>
        </div>
      )}

      {preview && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`预览 ${preview.originalName}`}
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) setPreview(null)
          }}
        >
          <button
            type="button"
            onClick={() => setPreview(null)}
            aria-label="关闭预览"
            className="absolute right-4 top-4 z-10 grid size-10 place-items-center rounded-full border border-white/20 bg-black/55 text-white/85 backdrop-blur transition hover:border-brand/60 hover:bg-brand/25 hover:text-white"
          >
            <X className="size-5" />
          </button>

          <div className="w-full max-w-[1100px]">
            <div className="overflow-hidden rounded-xl border border-white/10 bg-black shadow-2xl">
              {preview.kind === 'video' ? (
                <video
                  src={workAssetUrl(work.id, preview.id)}
                  controls
                  autoPlay
                  playsInline
                  className="max-h-[78vh] w-full bg-black"
                />
              ) : (
                <div className="flex max-h-[78vh] items-center justify-center">
                  <img
                    src={workAssetUrl(work.id, preview.id)}
                    alt={preview.originalName}
                    className="max-h-[78vh] max-w-full object-contain"
                  />
                </div>
              )}
            </div>
            <div className="mt-3 text-center text-[12px] text-white/65">
              {preview.originalName}
              <span className="mx-2 text-white/30">·</span>
              {preview.kind === 'video' ? '花絮视频' : '花絮图片'}
            </div>
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
