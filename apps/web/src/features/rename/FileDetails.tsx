import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Check, Copy, Eye, File, Maximize, Play, X } from 'lucide-react'

import { cn } from '@/lib/cn'
import { joinPath, rawUrl, thumbUrl } from '@/lib/api'
import {
  fileIconTone,
  formatDate,
  formatSize,
  isAudioFile,
  isImageFile,
  isPdfFile,
  isTextFile,
  isVideoFile,
} from '@/features/rename/format'
import type { Capabilities, FsEntry, StatItem } from '@/features/rename/types'

interface FileDetailsProps {
  dir: string
  entry: FsEntry
  stat: StatItem | undefined
  capabilities: Capabilities | null
  onClose: () => void
  onPreview: () => void
}

export function FileDetails({
  dir,
  entry,
  stat,
  capabilities,
  onClose,
  onPreview,
}: FileDetailsProps) {
  const path = joinPath(dir, entry.name)
  const kind = detailKind(entry.extension)
  const canPreview = kind !== 'other'
  const videoThumbAvailable = Boolean(capabilities?.videoThumbnail)

  const [thumbFailed, setThumbFailed] = useState(false)
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setThumbFailed(false)
    setDimensions(null)
    setCopied(false)
  }, [path])

  useEffect(() => {
    if (kind !== 'image' || entry.extension === 'svg') return

    let cancelled = false
    const image = new Image()
    image.onload = () => {
      if (!cancelled) {
        setDimensions({ width: image.naturalWidth, height: image.naturalHeight })
      }
    }
    image.src = rawUrl(path)

    return () => {
      cancelled = true
      image.onload = null
      image.src = ''
    }
  }, [path, kind, entry.extension])

  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 1600)
    return () => window.clearTimeout(timer)
  }, [copied])

  const thumbnailSrc =
    kind === 'image'
      ? entry.extension === 'svg'
        ? rawUrl(path)
        : thumbUrl(path, 640)
      : kind === 'video' && videoThumbAvailable
        ? thumbUrl(path, 640)
        : null

  const copyPath = async () => {
    try {
      await navigator.clipboard.writeText(path)
      setCopied(true)
    } catch {
      // 剪贴板不可用时保持静默，路径本身仍然可见可选中。
    }
  }

  return (
    <aside className="flex w-[304px] shrink-0 flex-col border-l border-line/70 bg-panel/95 backdrop-blur-sm max-xl:absolute max-xl:inset-y-0 max-xl:right-0 max-xl:z-20 max-xl:shadow-[-16px_0_40px_-20px_rgba(0,0,0,0.9)]">
      <div className="flex items-center gap-2 border-b border-line/70 px-4 py-3">
        <File
          className={cn('size-4 shrink-0', fileIconTone(entry.extension))}
          strokeWidth={1.8}
        />
        <div className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-ink" title={entry.name}>
          {entry.name}
        </div>
        <button
          type="button"
          onClick={onClose}
          title="关闭详情"
          aria-label="关闭详情"
          className="grid size-7 shrink-0 place-items-center rounded-md text-ink-faint transition hover:bg-hover-strong hover:text-ink"
        >
          <X className="size-3.5" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <button
          type="button"
          onClick={onPreview}
          disabled={!canPreview}
          title={canPreview ? (kind === 'video' ? '播放视频' : kind === 'image' ? '查看大图' : '打开预览') : undefined}
          aria-label={canPreview ? (kind === 'video' ? '播放视频' : kind === 'image' ? '查看大图' : '打开预览') : undefined}
          className={cn(
            'group relative flex h-[184px] w-full items-center justify-center overflow-hidden rounded-xl border border-line/70 bg-[linear-gradient(160deg,rgba(139,92,246,0.08),rgba(34,211,238,0.04))]',
            canPreview ? 'cursor-pointer transition hover:border-brand/50' : 'cursor-default',
          )}
        >
          {thumbnailSrc && !thumbFailed ? (
            <img
              src={thumbnailSrc}
              alt=""
              className="h-full w-full object-contain"
              onError={() => setThumbFailed(true)}
            />
          ) : (
            <File
              className={cn('size-12', fileIconTone(entry.extension))}
              strokeWidth={1.2}
            />
          )}

          {kind === 'video' && thumbnailSrc && !thumbFailed && (
            <span className="absolute inset-0 grid place-items-center bg-black/20 transition group-hover:bg-black/30">
              <span className="grid size-10 place-items-center rounded-full bg-black/55 text-white backdrop-blur">
                <Play className="size-4 translate-x-px fill-current" />
              </span>
            </span>
          )}

          {kind === 'image' && canPreview && (
            <span className="pointer-events-none absolute inset-0 grid place-items-center">
              <span className="grid size-10 place-items-center rounded-full border border-white/30 bg-black/45 text-white shadow-[0_8px_24px_-10px_rgba(0,0,0,0.9)] backdrop-blur transition duration-200 group-hover:scale-105 group-hover:bg-black/60">
                <Maximize className="size-4" strokeWidth={2.2} />
              </span>
            </span>
          )}
        </button>

        {kind === 'video' && !videoThumbAvailable && (
          <p className="mt-2 text-[10.5px] leading-relaxed text-ink-faint">
            当前环境没有 ffmpeg，无法生成视频缩略图，点击缩略图仍可播放原文件。
          </p>
        )}

        {kind !== 'video' && kind !== 'image' && (
          <button
            type="button"
            onClick={onPreview}
            disabled={!canPreview}
            className={cn(
              'mt-3 flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border text-[12px] transition',
              canPreview
                ? 'border-brand/40 bg-brand/10 text-brand-soft hover:border-brand/60 hover:bg-brand/15'
                : 'cursor-not-allowed border-line bg-panel-2/40 text-ink-faint opacity-60',
            )}
          >
            <Eye className="size-3.5" />
            {PREVIEW_LABEL[kind]}
          </button>
        )}

        <div className="mt-4 space-y-3">
          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
                完整路径
              </span>
              <button
                type="button"
                onClick={copyPath}
                title={copied ? '已复制' : '复制路径'}
                className="flex items-center gap-1 text-[10.5px] text-ink-faint transition hover:text-ink"
              >
                {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
                {copied ? '已复制' : '复制'}
              </button>
            </div>
            <div className="break-all rounded-lg border border-line/60 bg-panel-2/40 px-2.5 py-2 font-mono text-[10.5px] leading-relaxed text-ink-dim">
              {path}
            </div>
          </div>

          <MetaRow label="大小" value={entry.type === 'directory' ? '—' : formatSize(stat?.size)} />
          <MetaRow label="创建时间" value={formatDate(stat?.birthtimeMs)} />
          <MetaRow label="修改时间" value={formatDate(stat?.mtimeMs)} />
          <MetaRow
            label="类型"
            value={entry.extension ? `.${entry.extension}` : '文件'}
          />
          {dimensions && (
            <MetaRow label="分辨率" value={`${dimensions.width} × ${dimensions.height}`} />
          )}
          {stat?.error && (
            <p className="text-[10.5px] leading-relaxed text-rose-200">{stat.error}</p>
          )}
        </div>

        <p className="mt-4 text-[10.5px] leading-relaxed text-ink-faint">
          单击文件会清空其他选择并只选中当前项；再次单击不会取消，按 Ctrl 单击或点击复选框可取消。按住 Shift 可连续选择，点击空白处清空选择。点击上方按钮预览，按 Esc 关闭。
        </p>
      </div>
    </aside>
  )
}

function MetaRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="shrink-0 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
        {label}
      </span>
      <span className="min-w-0 text-right text-[11.5px] text-ink-dim">{value}</span>
    </div>
  )
}

const PREVIEW_LABEL: Record<DetailKind, string> = {
  image: '查看大图',
  video: '播放视频',
  audio: '播放音频',
  pdf: '打开 PDF',
  text: '查看文本',
  other: '暂不支持预览',
}

type DetailKind = 'image' | 'video' | 'audio' | 'pdf' | 'text' | 'other'

function detailKind(extension: string): DetailKind {
  if (isImageFile(extension)) return 'image'
  if (isVideoFile(extension)) return 'video'
  if (isAudioFile(extension)) return 'audio'
  if (isPdfFile(extension)) return 'pdf'
  if (isTextFile(extension)) return 'text'
  return 'other'
}
