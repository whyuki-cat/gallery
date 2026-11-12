import { useEffect, useState } from 'react'
import { AlertTriangle, Film, FolderOpen, Loader2, Upload, X } from 'lucide-react'

import { api, ApiError } from '@/lib/api'
import { cn } from '@/lib/cn'
import { VideoPicker } from '@/features/trim/VideoPicker'
import type { WorkImportView } from '@/features/works/types'

interface CreateWorkDialogProps {
  open: boolean
  libraryId: string
  onClose: () => void
  onImported: (workId: string) => void
}

export function CreateWorkDialog({
  open,
  libraryId,
  onClose,
  onImported,
}: CreateWorkDialogProps) {
  const [name, setName] = useState('')
  const [videoPath, setVideoPath] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<WorkImportView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [importId, setImportId] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setName('')
    setVideoPath('')
    setPickerOpen(false)
    setBusy(false)
    setProgress(null)
    setError(null)
    setImportId(null)
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [busy, onClose, open])

  useEffect(() => {
    if (!importId) return
    let cancelled = false

    const poll = async () => {
      try {
        const view = await api.workImport(importId)
        if (cancelled) return
        setProgress(view)
        if (view.state === 'succeeded' && view.workId) {
          onImported(view.workId)
          onClose()
          return
        }
        if (view.state === 'failed') {
          setBusy(false)
          setError(view.error ?? '导入失败')
          return
        }
        window.setTimeout(() => void poll(), 400)
      } catch (reason) {
        if (cancelled) return
        setBusy(false)
        setError(reason instanceof ApiError ? reason.message : '无法查询导入进度')
      }
    }

    void poll()
    return () => {
      cancelled = true
    }
  }, [importId, onClose, onImported])

  if (!open) return null

  const percent =
    progress && progress.totalBytes > 0
      ? Math.min(100, Math.round((progress.bytesCopied / progress.totalBytes) * 100))
      : 0

  async function submit(): Promise<void> {
    setError(null)
    if (!name.trim()) {
      setError('请输入作品名称')
      return
    }
    if (!videoPath.trim()) {
      setError('请选择本机视频文件')
      return
    }

    setBusy(true)
    setProgress(null)
    try {
      const view = await api.startWorkImport(libraryId, {
        name: name.trim(),
        kind: 'movie',
        videoPath: videoPath.trim(),
      })
      setProgress(view)
      setImportId(view.id)
    } catch (reason) {
      setBusy(false)
      setError(reason instanceof ApiError ? reason.message : '创建作品失败')
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-4 backdrop-blur-sm"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-work-title"
        className="animate-rise flex max-h-[86vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-line-strong bg-panel shadow-[0_40px_120px_-40px_rgba(0,0,0,0.9)]"
      >
        <header className="flex shrink-0 items-center gap-3 border-b border-line/70 px-5 py-4">
          <span className="grid size-9 place-items-center rounded-xl border border-brand/30 bg-brand/10 text-brand-soft">
            <Upload className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="create-work-title" className="text-[14px] font-semibold text-ink">
              艺术创作
            </h2>
            <p className="mt-0.5 text-[11.5px] text-ink-faint">
              视频会复制到作品集目录，源文件保留在原位置。
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="关闭上传对话框"
            className="grid size-8 place-items-center rounded-lg text-ink-faint transition hover:bg-hover-strong hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <label className="block">
            <span className="text-[11.5px] font-medium text-ink-dim">作品名称</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={busy}
              placeholder="例如：星际穿越"
              className="mt-1.5 h-9 w-full rounded-lg border border-line bg-panel-2/60 px-3 text-[12.5px] text-ink outline-none transition placeholder:text-ink-faint focus:border-brand/60 disabled:opacity-60"
            />
          </label>

          <label className="block">
            <span className="text-[11.5px] font-medium text-ink-dim">类别</span>
            <select
              value="movie"
              disabled
              className="mt-1.5 h-9 w-full rounded-lg border border-line bg-panel-2/60 px-3 text-[12.5px] text-ink outline-none transition disabled:opacity-70"
            >
              <option value="movie">电影</option>
            </select>
            <span className="mt-1 block text-[10.5px] text-ink-faint">
              本期只支持电影；短视频集合与图片集合稍后开放。
            </span>
          </label>

          <div>
            <span className="text-[11.5px] font-medium text-ink-dim">主视频</span>
            <div className="mt-1.5 flex items-center gap-2">
              <input
                value={videoPath}
                onChange={(event) => setVideoPath(event.target.value)}
                disabled={busy}
                placeholder="选择本机视频文件"
                spellCheck={false}
                className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-panel-2/60 px-3 font-mono text-[11.5px] text-ink outline-none transition placeholder:text-ink-faint focus:border-brand/60 disabled:opacity-60"
              />
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                disabled={busy}
                className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-line bg-panel-2/60 px-3 text-[11.5px] text-ink-dim transition hover:border-line-strong hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
              >
                <FolderOpen className="size-4" />
                浏览
              </button>
            </div>
          </div>

          {busy && progress && (
            <div className="rounded-xl border border-line/80 bg-panel-2/40 px-3 py-3">
              <div className="flex items-center gap-2 text-[11.5px] text-ink-dim">
                <Loader2 className="size-3.5 animate-spin text-brand-soft" />
                <span>
                  {progress.state === 'copying'
                    ? '正在复制视频…'
                    : progress.state === 'finalizing'
                      ? '正在写入作品…'
                      : '准备导入…'}
                </span>
                <span className="ml-auto font-mono text-[10.5px] text-ink-faint">
                  {percent}%
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-panel-3">
                <div
                  className="h-full rounded-full bg-[linear-gradient(90deg,#8b5cf6,#22d3ee)] transition-[width]"
                  style={{ width: `${percent}%` }}
                />
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-1.5 rounded-lg border border-rose-400/25 bg-rose-400/5 px-3 py-2 text-[11.5px] leading-relaxed text-rose-200">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex items-start gap-2 rounded-xl border border-line/80 bg-panel-2/40 px-3 py-2.5 text-[11px] leading-relaxed text-ink-faint">
            <Film className="mt-0.5 size-3.5 shrink-0 text-brand-soft" />
            <span>
              创建后可在作品详情中继续添加 NFO、SRT 字幕、海报、背景图和花絮。电影作品只允许一个主视频。
            </span>
          </div>
        </div>

        <footer className="flex shrink-0 items-center gap-2 border-t border-line/70 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg border border-line bg-panel-2/60 px-3 py-1.5 text-[11.5px] text-ink-dim transition hover:border-line-strong hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy}
            className={cn(
              'ml-auto flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11.5px] font-medium transition',
              busy
                ? 'cursor-not-allowed border-line bg-panel-2/60 text-ink-faint'
                : 'border-brand/50 bg-brand/15 text-brand-soft hover:bg-brand/20',
            )}
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
            {busy ? '正在导入' : '上传作品'}
          </button>
        </footer>
      </div>

      <VideoPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={(path) => {
          setVideoPath(path)
          setPickerOpen(false)
        }}
      />
    </div>
  )
}
