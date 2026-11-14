import { useEffect } from 'react'
import type { ReactNode } from 'react'
import {
  AlertTriangle,
  Captions,
  FileText,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  Settings2,
  Trash2,
  Upload,
  X,
} from 'lucide-react'

import { cn } from '@/lib/cn'
import { workBackdropUrl, workPosterUrl } from '@/lib/api'
import type { WorkAssetView, WorkDetail } from '@/features/works/types'

export type AssetPickerRole = 'nfo' | 'poster' | 'backdrop' | 'subtitle' | 'extra'

interface WorkAssetsDrawerProps {
  open: boolean
  work: WorkDetail
  busy: boolean
  nfoText: string | null
  nfoError: string | null
  onClose: () => void
  onPick: (role: AssetPickerRole) => void
  onRemove: (asset: WorkAssetView) => void
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  const value = bytes / 1024 ** index
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`
}

export function WorkAssetsDrawer({
  open,
  work,
  busy,
  nfoText,
  nfoError,
  onClose,
  onPick,
  onRemove,
}: WorkAssetsDrawerProps) {
  useEffect(() => {
    if (!open) return
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [busy, onClose, open])

  if (!open) return null

  const metadata = work.metadata
  const poster = work.poster
  const backdrop = work.backdrop
  const nfo = work.nfo
  const detailRows: Array<{ label: string; value: string }> = []
  if (metadata) {
    if (metadata.originalTitle) {
      detailRows.push({ label: '原始标题', value: metadata.originalTitle })
    }
    if (metadata.premiered) {
      detailRows.push({ label: '上映日期', value: metadata.premiered })
    }
    if (metadata.runtimeMinutes) {
      detailRows.push({ label: '时长', value: `${metadata.runtimeMinutes} 分钟` })
    }
    if (metadata.rating !== null) {
      detailRows.push({ label: '评分', value: `${metadata.rating} / 10` })
    }
    if (metadata.mpaa) {
      detailRows.push({ label: '分级', value: metadata.mpaa })
    }
    if (metadata.genres.length > 0) {
      detailRows.push({ label: '类型', value: metadata.genres.join('、') })
    }
    if (metadata.studios.length > 0) {
      detailRows.push({ label: '制片公司', value: metadata.studios.join('、') })
    }
    if (metadata.uniqueIds.length > 0) {
      detailRows.push({
        label: '外部编号',
        value: metadata.uniqueIds.map((item) => `${item.type}: ${item.value}`).join('、'),
      })
    }
  }

  return (
    <div
      className="fixed inset-0 z-[55] flex justify-end bg-scrim backdrop-blur-sm"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose()
      }}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="work-assets-title"
        className="flex h-full w-full max-w-[440px] flex-col border-l border-line-strong bg-panel shadow-[-32px_0_80px_-40px_rgba(0,0,0,0.9)]"
      >
        <header className="flex shrink-0 items-start gap-3 border-b border-line/70 px-5 py-4">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-brand/30 bg-brand/10 text-brand-soft">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Settings2 className="size-4" />}
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="work-assets-title" className="text-[14px] font-semibold text-ink">
              资源管理
            </h2>
            <p className="mt-0.5 truncate text-[11.5px] text-ink-faint">{work.name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="关闭资源管理"
            className="grid size-8 shrink-0 place-items-center rounded-lg text-ink-faint transition hover:bg-hover-strong hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <DrawerSection
            title="海报"
            action={
              <SmallButton onClick={() => onPick('poster')} disabled={busy}>
                {poster ? <RefreshCw className="size-3" /> : <Upload className="size-3" />}
                {poster ? '替换' : '添加'}
              </SmallButton>
            }
          >
            <div className="flex gap-3">
              <div className="aspect-[2/3] w-[104px] shrink-0 overflow-hidden rounded-lg border border-line/80 bg-panel-2/50">
                {poster ? (
                  <img
                    src={workPosterUrl(work.id, 400)}
                    alt="海报"
                    className="size-full object-cover"
                  />
                ) : (
                  <div className="flex size-full flex-col items-center justify-center gap-1.5 text-ink-faint">
                    <ImageIcon className="size-5" strokeWidth={1.4} />
                    <span className="text-[10px]">未添加</span>
                  </div>
                )}
              </div>
              <div className="flex min-w-0 flex-1 flex-col items-start gap-1.5">
                <div className="w-full truncate font-mono text-[10.5px] text-ink-faint">
                  {poster?.fileName ?? 'poster.*'}
                </div>
                {poster && (
                  <SmallButton onClick={() => onRemove(poster)} disabled={busy} danger>
                    <Trash2 className="size-3" />
                    移除
                  </SmallButton>
                )}
              </div>
            </div>
          </DrawerSection>

          <DrawerSection
            title="背景图"
            action={
              <SmallButton onClick={() => onPick('backdrop')} disabled={busy}>
                {backdrop ? <RefreshCw className="size-3" /> : <Upload className="size-3" />}
                {backdrop ? '替换' : '添加'}
              </SmallButton>
            }
          >
            <div className="flex gap-3">
              <div className="aspect-video w-[172px] shrink-0 overflow-hidden rounded-lg border border-line/80 bg-panel-2/50">
                {backdrop ? (
                  <img
                    src={workBackdropUrl(work.id, 800)}
                    alt="背景图"
                    className="size-full object-cover"
                  />
                ) : (
                  <div className="flex size-full flex-col items-center justify-center gap-1.5 text-ink-faint">
                    <ImageIcon className="size-5" strokeWidth={1.4} />
                    <span className="text-[10px]">未添加</span>
                  </div>
                )}
              </div>
              <div className="flex min-w-0 flex-1 flex-col items-start gap-1.5">
                <div className="w-full truncate font-mono text-[10.5px] text-ink-faint">
                  {backdrop?.fileName ?? 'backdrop.*'}
                </div>
                {backdrop && (
                  <SmallButton onClick={() => onRemove(backdrop)} disabled={busy} danger>
                    <Trash2 className="size-3" />
                    移除
                  </SmallButton>
                )}
              </div>
            </div>
          </DrawerSection>

          <DrawerSection
            title="NFO 元数据"
            action={
              <SmallButton onClick={() => onPick('nfo')} disabled={busy}>
                {nfo ? <RefreshCw className="size-3" /> : <Upload className="size-3" />}
                {nfo ? '替换' : '添加'}
              </SmallButton>
            }
          >
            <div className="rounded-lg border border-line/70 bg-panel-2/40 px-3 py-2.5">
              <div className="flex items-center gap-2">
                <FileText className="size-3.5 shrink-0 text-brand-soft" />
                <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-ink-dim">
                  {nfo?.fileName ?? '未添加 NFO'}
                </span>
                {nfo && (
                  <button
                    type="button"
                    onClick={() => onRemove(nfo)}
                    disabled={busy}
                    aria-label="移除 NFO"
                    className="grid size-6 shrink-0 place-items-center rounded-md text-ink-faint transition hover:bg-rose-400/10 hover:text-rose-200 disabled:opacity-40"
                  >
                    <Trash2 className="size-3" />
                  </button>
                )}
              </div>
              {work.metadataError && (
                <div className="mt-2 flex items-start gap-1.5 rounded-md border border-amber-400/25 bg-amber-400/5 px-2 py-1.5 text-[11px] leading-relaxed text-amber-200">
                  <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                  {work.metadataError}
                </div>
              )}
              {nfo && (
                <details className="mt-2 border-t border-line/60 pt-2">
                  <summary className="cursor-pointer text-[10.5px] text-ink-faint">
                    查看原始 NFO
                  </summary>
                  <div className="mt-2">
                    {nfoError ? (
                      <div className="text-[11px] text-rose-200">{nfoError}</div>
                    ) : nfoText === null ? (
                      <div className="text-[11px] text-ink-faint">正在读取…</div>
                    ) : (
                      <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words font-mono text-[10px] leading-relaxed text-ink-faint">
                        {nfoText}
                      </pre>
                    )}
                  </div>
                </details>
              )}
            </div>
          </DrawerSection>

          <DrawerSection
            title="字幕"
            action={
              <SmallButton onClick={() => onPick('subtitle')} disabled={busy}>
                <Upload className="size-3" />
                添加
              </SmallButton>
            }
          >
            {work.subtitles.length === 0 ? (
              <div className="rounded-lg border border-dashed border-line/80 px-3 py-4 text-center text-[11px] text-ink-faint">
                还没有字幕
              </div>
            ) : (
              <div className="space-y-1.5">
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
                      onClick={() => onRemove(asset)}
                      disabled={busy}
                      aria-label={`移除字幕 ${asset.originalName}`}
                      className="grid size-6 shrink-0 place-items-center rounded-md text-ink-faint transition hover:bg-rose-400/10 hover:text-rose-200 disabled:opacity-40"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </DrawerSection>

          <DrawerSection title="详细信息">
            {detailRows.length === 0 ? (
              <div className="rounded-lg border border-dashed border-line/80 px-3 py-4 text-center text-[11px] text-ink-faint">
                暂无 NFO 元数据
              </div>
            ) : (
              <dl className="space-y-2 text-[11.5px]">
                {detailRows.map((row) => (
                  <div key={row.label} className="flex min-w-0 gap-3">
                    <dt className="w-16 shrink-0 text-ink-faint">{row.label}</dt>
                    <dd className="min-w-0 break-words text-ink-dim">{row.value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </DrawerSection>

          <DrawerSection title="媒体信息">
            <dl className="space-y-1.5 text-[11px]">
              <InfoRow label="主视频" value={work.video?.fileName ?? '缺失'} mono />
              <InfoRow label="大小" value={work.video ? formatBytes(work.video.size) : '—'} mono />
              <InfoRow label="NFO" value={work.nfo?.fileName ?? '未添加'} mono />
              <InfoRow label="字幕" value={`${work.subtitles.length} 条`} />
              <InfoRow label="花絮" value={`${work.extras.length} 个`} />
            </dl>
          </DrawerSection>
        </div>
      </aside>
    </div>
  )
}

function DrawerSection({
  title,
  action,
  children,
}: {
  title: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section>
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  )
}

function SmallButton({
  children,
  onClick,
  disabled,
  danger = false,
}: {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
  danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex items-center gap-1 rounded-md border px-2 py-1 text-[10.5px] transition disabled:cursor-not-allowed disabled:opacity-40',
        danger
          ? 'border-rose-400/25 text-rose-200 hover:bg-rose-400/10'
          : 'border-line bg-panel-2/60 text-ink-dim hover:border-line-strong hover:text-ink',
      )}
    >
      {children}
    </button>
  )
}

function InfoRow({
  label,
  value,
  mono = false,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="flex gap-3">
      <dt className="w-16 shrink-0 text-ink-faint">{label}</dt>
      <dd className={cn('min-w-0 truncate text-ink-dim', mono && 'font-mono text-[10px]')}>
        {value}
      </dd>
    </div>
  )
}
