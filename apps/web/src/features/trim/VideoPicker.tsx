import { useEffect, useState } from 'react'
import { ChevronUp, CornerDownLeft, Film, Folder, HardDrive, Loader2, X } from 'lucide-react'

import { api, ApiError, joinPath } from '@/lib/api'
import { cn } from '@/lib/cn'
import { isVideoFile } from '@/features/rename/format'
import type { DirectoryListing, RootsResponse } from '@/features/rename/types'

interface VideoPickerProps {
  open: boolean
  initialDir?: string
  onClose: () => void
  onSelect: (path: string) => void
}

function extensionOf(path: string): string {
  const name = path.split(/[\\/]/).pop() ?? ''
  const dot = name.lastIndexOf('.')
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : ''
}

export function VideoPicker({ open, initialDir, onClose, onSelect }: VideoPickerProps) {
  const [roots, setRoots] = useState<RootsResponse | null>(null)
  const [path, setPath] = useState('')
  const [draft, setDraft] = useState('')
  const [listing, setListing] = useState<DirectoryListing | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || roots) return
    api
      .roots()
      .then(setRoots)
      .catch(() => setRoots(null))
  }, [open, roots])

  useEffect(() => {
    if (!open) return
    const next = initialDir ?? ''
    setPath(next)
    setDraft(next)
    setError(null)
  }, [open, initialDir])

  useEffect(() => {
    if (!open) return
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  useEffect(() => {
    if (!open || !path) {
      setListing(null)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    api
      .list(path, false)
      .then((next) => {
        if (!cancelled) setListing(next)
      })
      .catch((caught) => {
        if (cancelled) return
        setListing(null)
        setError(caught instanceof ApiError ? caught.message : '无法读取该目录')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [open, path])

  if (!open) return null

  const entries = (listing?.entries ?? []).filter(
    (entry) => entry.type === 'directory' || (entry.type === 'file' && isVideoFile(entry.extension)),
  )

  const navigate = (next: string) => {
    setPath(next)
    setDraft(next)
    setListing(null)
    setError(null)
  }

  const submit = () => {
    const next = draft.trim()
    if (!next) return
    if (isVideoFile(extensionOf(next))) {
      onSelect(next)
      return
    }
    navigate(next)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-4 backdrop-blur-sm">
      <div className="animate-rise flex h-[76vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-line-strong bg-panel shadow-[0_40px_120px_-40px_rgba(0,0,0,0.9)]">
        <header className="flex shrink-0 items-center gap-3 border-b border-line/70 px-5 py-3.5">
          <span className="grid size-9 place-items-center rounded-xl border border-brand/30 bg-brand/10 text-brand-soft">
            <Film className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[13.5px] font-semibold text-ink">选择视频</div>
            <div className="truncate text-[11px] text-ink-faint">
              只显示文件夹与支持预览的视频文件
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="grid size-8 place-items-center rounded-lg text-ink-faint transition hover:bg-hover-strong hover:text-ink"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="shrink-0 border-b border-line/70 px-5 py-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => listing?.parent && navigate(listing.parent)}
              disabled={!listing?.parent}
              title="上一级"
              className="grid size-9 shrink-0 place-items-center rounded-lg border border-line bg-panel-2/60 text-ink-dim transition hover:border-line-strong hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronUp className="size-4" />
            </button>

            <form
              className="flex min-w-0 flex-1 items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault()
                submit()
              }}
            >
              <input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="输入目录绝对路径，或直接粘贴视频文件路径"
                spellCheck={false}
                className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-panel-2/60 px-3 font-mono text-[12px] text-ink outline-none transition placeholder:text-ink-faint focus:border-brand/60"
              />
              <button
                type="submit"
                className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-line bg-panel-3/70 px-3 text-[12px] font-medium text-ink-dim transition hover:border-line-strong hover:text-ink"
              >
                <CornerDownLeft className="size-3.5" />
                打开
              </button>
            </form>
          </div>

          {roots && (
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              {[...roots.roots, ...roots.common].map((location) => (
                <button
                  key={location.path}
                  type="button"
                  onClick={() => navigate(location.path)}
                  className="flex items-center gap-1.5 rounded-md border border-line/80 bg-panel-2/40 px-2 py-1 text-[11.5px] text-ink-dim transition hover:border-line-strong hover:bg-panel-3/60 hover:text-ink"
                >
                  <HardDrive className="size-3" />
                  {location.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
          {error ? (
            <div className="flex h-full items-center justify-center px-6 text-center text-[12.5px] text-rose-200">
              {error}
            </div>
          ) : loading ? (
            <div className="flex h-full items-center justify-center gap-2 text-[12.5px] text-ink-faint">
              <Loader2 className="size-4 animate-spin" />
              正在读取目录…
            </div>
          ) : !path ? (
            <div className="flex h-full items-center justify-center px-8 text-center text-[12.5px] leading-relaxed text-ink-faint">
              从上方选择一个盘符或常用位置开始，也可以直接输入目录路径。
            </div>
          ) : entries.length === 0 ? (
            <div className="flex h-full items-center justify-center px-8 text-center text-[12.5px] leading-relaxed text-ink-faint">
              这个目录里没有文件夹或可预览的视频。
            </div>
          ) : (
            <div className="space-y-1">
              {entries.map((entry) => {
                const fullPath = joinPath(listing?.path ?? path, entry.name)
                const isFolder = entry.type === 'directory'

                return (
                  <button
                    key={entry.name}
                    type="button"
                    onClick={() => (isFolder ? navigate(fullPath) : onSelect(fullPath))}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition',
                      'hover:bg-hover-strong',
                    )}
                  >
                    <span
                      className={cn(
                        'grid size-8 shrink-0 place-items-center rounded-lg border',
                        isFolder
                          ? 'border-amber-400/25 bg-amber-400/10 text-amber-200'
                          : 'border-brand/25 bg-brand/10 text-brand-soft',
                      )}
                    >
                      {isFolder ? <Folder className="size-4" /> : <Film className="size-4" />}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">
                      {entry.name}
                    </span>
                    {!isFolder && (
                      <span className="shrink-0 rounded-full border border-line bg-panel-2/70 px-1.5 py-0.5 font-mono text-[9.5px] uppercase text-ink-faint">
                        {entry.extension}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
