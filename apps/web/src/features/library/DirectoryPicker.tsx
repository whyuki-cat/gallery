import { useEffect, useState } from 'react'
import {
  ArrowUp,
  Check,
  Folder,
  FolderOpen,
  HardDrive,
  Loader2,
  X,
} from 'lucide-react'

import { api, ApiError } from '@/lib/api'
import type { DirectoryListing, FsEntry, RootsResponse } from '@/features/rename/types'

interface DirectoryPickerProps {
  open: boolean
  title?: string
  initialPath?: string
  onClose: () => void
  onSelect: (path: string) => void
}

export function DirectoryPicker({
  open,
  title = '选择目录',
  initialPath,
  onClose,
  onSelect,
}: DirectoryPickerProps) {
  const [path, setPath] = useState('')
  const [draft, setDraft] = useState('')
  const [listing, setListing] = useState<DirectoryListing | null>(null)
  const [roots, setRoots] = useState<RootsResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return

    setError(null)
    setListing(null)
    setPath('')
    setDraft('')
    setLoading(false)

    api
      .roots()
      .then((response) => setRoots(response))
      .catch((reason: unknown) => {
        setError(reason instanceof ApiError ? reason.message : '无法读取磁盘位置')
      })
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  function navigate(target: string): void {
    if (!target) return
    setLoading(true)
    setError(null)
    api
      .list(target, false)
      .then((response) => {
        setListing(response)
        setPath(response.path)
        setDraft(response.path)
      })
      .catch((reason: unknown) => {
        setError(reason instanceof ApiError ? reason.message : '无法读取目录')
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (!open || !initialPath) return
    navigate(initialPath)
    // 只在打开或初始路径变化时执行
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialPath])

  if (!open) return null

  const directories = (listing?.entries ?? []).filter((entry) => entry.type === 'directory')

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-scrim p-4 backdrop-blur-sm"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="directory-picker-title"
        className="animate-rise flex max-h-[82vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-line-strong bg-panel shadow-[0_40px_120px_-40px_rgba(0,0,0,0.9)]"
      >
        <header className="flex shrink-0 items-center gap-3 border-b border-line/70 px-5 py-4">
          <span className="grid size-9 place-items-center rounded-xl border border-line bg-panel-2 text-brand-soft">
            <FolderOpen className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="directory-picker-title" className="text-[14px] font-semibold text-ink">
              {title}
            </h2>
            <p className="mt-0.5 text-[11.5px] text-ink-faint">选择一个本地目录。</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭目录选择"
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
              <ArrowUp className="size-4" />
            </button>
            <form
              className="flex min-w-0 flex-1 items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault()
                navigate(draft.trim())
              }}
            >
              <input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="输入绝对路径"
                spellCheck={false}
                className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-panel-2/60 px-3 font-mono text-[12px] text-ink outline-none transition placeholder:text-ink-faint focus:border-brand/60"
              />
              <button
                type="submit"
                className="h-9 shrink-0 rounded-lg border border-line bg-panel-3/70 px-3 text-[12px] font-medium text-ink-dim transition hover:border-line-strong hover:text-ink"
              >
                打开
              </button>
            </form>
          </div>

          {roots && !listing && (
            <div className="mt-3 flex flex-wrap gap-1.5">
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

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-[12px] text-ink-faint">
              <Loader2 className="size-4 animate-spin" />
              读取目录…
            </div>
          ) : error ? (
            <div className="rounded-xl border border-rose-400/25 bg-rose-400/5 px-3 py-3 text-[12px] text-rose-200">
              {error}
            </div>
          ) : !listing ? (
            <div className="px-3 py-8 text-center text-[12.5px] text-ink-faint">
              选择上方磁盘或常用位置开始浏览。
            </div>
          ) : directories.length === 0 ? (
            <div className="px-3 py-8 text-center text-[12.5px] text-ink-faint">
              这个目录下没有子目录。
            </div>
          ) : (
            <ul className="space-y-1">
              {directories.map((entry) => (
                <DirectoryRow key={entry.name} entry={entry} onOpen={() => navigate(joinPath(path, entry.name))} />
              ))}
            </ul>
          )}
        </div>

        <footer className="flex shrink-0 items-center gap-2 border-t border-line/70 px-5 py-3">
          <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-ink-faint">
            {path || '尚未选择目录'}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-line bg-panel-2/60 px-3 py-1.5 text-[11.5px] text-ink-dim transition hover:border-line-strong hover:text-ink"
          >
            取消
          </button>
          <button
            type="button"
            disabled={!path}
            onClick={() => {
              onSelect(path)
              onClose()
            }}
            className="flex items-center gap-1.5 rounded-lg border border-brand/50 bg-brand/15 px-3 py-1.5 text-[11.5px] font-medium text-brand-soft transition hover:bg-brand/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Check className="size-3.5" />
            选择此目录
          </button>
        </footer>
      </div>
    </div>
  )
}

function DirectoryRow({ entry, onOpen }: { entry: FsEntry; onOpen: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[12.5px] text-ink-dim transition hover:bg-hover hover:text-ink"
      >
        <Folder className="size-4 shrink-0 text-ink-faint" />
        <span className="truncate">{entry.name}</span>
      </button>
    </li>
  )
}

function joinPath(dir: string, name: string): string {
  const normalized = dir.replace(/[\\/]+$/, '')
  const separator = normalized.includes('\\') ? '\\' : '/'
  return `${normalized}${separator}${name}`
}
