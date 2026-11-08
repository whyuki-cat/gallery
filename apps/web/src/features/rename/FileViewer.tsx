import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, FileQuestion, Trash2, X } from 'lucide-react'

import { joinPath, rawUrl } from '@/lib/api'
import {
  isAudioFile,
  isImageFile,
  isPdfFile,
  isTextFile,
  isVideoFile,
} from '@/features/rename/format'
import type { FsEntry } from '@/features/rename/types'

interface FileViewerProps {
  dir: string
  entry: FsEntry
  /** 当前目录中可切换的图片/视频，顺序与文件列表一致 */
  entries: FsEntry[]
  onNavigate: (entry: FsEntry) => void
  onDelete: () => void
  onClose: () => void
}

export function FileViewer({ dir, entry, entries, onNavigate, onDelete, onClose }: FileViewerProps) {
  const path = joinPath(dir, entry.name)
  const kind = entry.type === 'directory' ? 'directory' : previewKind(entry.extension)

  const index = entries.findIndex((item) => item.name === entry.name)
  const canNavigate = index >= 0 && entries.length > 1
  const previous = canNavigate ? entries[(index - 1 + entries.length) % entries.length] : null
  const next = canNavigate ? entries[(index + 1) % entries.length] : null

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
        return
      }

      if (!canNavigate || event.altKey || event.ctrlKey || event.metaKey) return

      const target = event.target instanceof HTMLElement ? event.target : null
      if (target?.closest('input, textarea, select, video, audio, [contenteditable="true"]')) return

      if (event.key === 'ArrowLeft' && previous) {
        event.preventDefault()
        onNavigate(previous)
      } else if (event.key === 'ArrowRight' && next) {
        event.preventDefault()
        onNavigate(next)
      }
    }

    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [canNavigate, next, onClose, onNavigate, previous])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`预览 ${entry.name}`}
      className="fixed inset-0 z-50 flex flex-col bg-black/85 p-5 backdrop-blur-sm"
    >
      <div className="mb-4 flex shrink-0 items-start gap-4 text-ink">
        <div className="min-w-0 flex-1 pt-1">
          <div className="flex min-w-0 items-center gap-2">
            <div className="truncate text-[13px] font-medium">{entry.name}</div>
            {canNavigate && (
              <span className="shrink-0 rounded-full border border-white/15 bg-white/5 px-1.5 py-0.5 font-mono text-[9.5px] text-white/50">
                {index + 1} / {entries.length}
              </span>
            )}
          </div>
          <div className="truncate font-mono text-[10.5px] text-ink-faint">{path}</div>
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          <span className="hidden items-center gap-1.5 text-[10.5px] text-white/45 sm:flex">
            <kbd className="rounded border border-white/15 bg-white/5 px-1.5 py-0.5 font-mono text-[9.5px]">
              Esc
            </kbd>
            关闭
          </span>
          <button
            type="button"
            onClick={onDelete}
            title="删除当前文件"
            aria-label="删除当前文件"
            className="grid size-10 shrink-0 place-items-center rounded-full border border-white/20 bg-black/55 text-white/80 shadow-[0_10px_28px_-10px_rgba(0,0,0,0.9)] backdrop-blur transition hover:border-rose-400/60 hover:bg-rose-500/25 hover:text-white active:scale-95"
          >
            <Trash2 className="size-[18px]" strokeWidth={2} />
          </button>
          <button
            type="button"
            onClick={onClose}
            title="关闭预览（Esc）"
            aria-label="关闭预览"
            className="grid size-10 shrink-0 place-items-center rounded-full border border-white/20 bg-black/55 text-white/85 shadow-[0_10px_28px_-10px_rgba(0,0,0,0.9)] backdrop-blur transition hover:border-brand/60 hover:bg-brand/25 hover:text-white active:scale-95"
          >
            <X className="size-5" strokeWidth={2.2} />
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden">
        {kind === 'image' && (
          <img
            src={rawUrl(path)}
            alt={entry.name}
            className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
          />
        )}

        {kind === 'video' && (
          <video
            src={rawUrl(path)}
            controls
            autoPlay
            playsInline
            className="max-h-full max-w-full rounded-lg bg-black shadow-2xl"
          />
        )}

        {kind === 'audio' && (
          <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-panel-2/90 p-5">
            <div className="mb-3 text-[12px] text-ink-dim">{entry.name}</div>
            <audio src={rawUrl(path)} controls autoPlay className="w-full" />
          </div>
        )}

        {kind === 'pdf' && (
          <iframe
            src={rawUrl(path)}
            title={entry.name}
            className="h-full w-full rounded-lg border border-white/10 bg-white"
          />
        )}

        {kind === 'text' && <TextViewer path={path} />}

        {kind === 'other' && (
          <div className="flex flex-col items-center gap-2 text-center text-ink-faint">
            <FileQuestion className="size-10" strokeWidth={1.4} />
            <div className="text-[13px] text-ink-dim">该文件类型暂不支持预览</div>
            <div className="max-w-md break-all font-mono text-[11px]">{path}</div>
          </div>
        )}
      </div>

      {canNavigate && (
        <>
          <button
            type="button"
            onClick={() => previous && onNavigate(previous)}
            title="上一个文件（←）"
            aria-label="上一个文件"
            className="absolute left-4 top-1/2 z-10 grid size-11 -translate-y-1/2 place-items-center rounded-full border border-white/20 bg-black/45 text-white/85 shadow-[0_10px_28px_-10px_rgba(0,0,0,0.9)] backdrop-blur transition hover:border-brand/60 hover:bg-brand/25 hover:text-white active:scale-95"
          >
            <ChevronLeft className="size-5" strokeWidth={2.2} />
          </button>
          <button
            type="button"
            onClick={() => next && onNavigate(next)}
            title="下一个文件（→）"
            aria-label="下一个文件"
            className="absolute right-4 top-1/2 z-10 grid size-11 -translate-y-1/2 place-items-center rounded-full border border-white/20 bg-black/45 text-white/85 shadow-[0_10px_28px_-10px_rgba(0,0,0,0.9)] backdrop-blur transition hover:border-brand/60 hover:bg-brand/25 hover:text-white active:scale-95"
          >
            <ChevronRight className="size-5" strokeWidth={2.2} />
          </button>
        </>
      )}
    </div>
  )
}

function TextViewer({ path }: { path: string }) {
  const [text, setText] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()

    fetch(rawUrl(path), { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`无法读取文件（${response.status}）`)
        return response.text()
      })
      .then((value) => {
        if (!controller.signal.aborted) setText(value)
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return
        setError(caught instanceof Error ? caught.message : '无法读取文件')
      })

    return () => controller.abort()
  }, [path])

  if (error) {
    return <div className="text-[12.5px] text-rose-200">{error}</div>
  }

  if (text === null) {
    return <div className="text-[12.5px] text-ink-faint">正在读取文件…</div>
  }

  return (
    <pre className="h-full max-h-full w-full overflow-auto whitespace-pre-wrap break-words rounded-lg border border-white/10 bg-panel-2/90 p-4 font-mono text-[12px] leading-relaxed text-ink-dim">
      {text}
    </pre>
  )
}

function previewKind(extension: string): 'image' | 'video' | 'audio' | 'pdf' | 'text' | 'other' {
  if (isImageFile(extension)) return 'image'
  if (isVideoFile(extension)) return 'video'
  if (isAudioFile(extension)) return 'audio'
  if (isPdfFile(extension)) return 'pdf'
  if (isTextFile(extension)) return 'text'
  return 'other'
}
