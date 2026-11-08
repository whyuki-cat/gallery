import { useEffect, useState } from 'react'
import { Loader2, Trash2 } from 'lucide-react'

import { joinPath } from '@/lib/api'
import type { FsEntry } from '@/features/rename/types'

interface DeleteDialogProps {
  open: boolean
  dir: string
  entries: FsEntry[]
  onClose: () => void
  onConfirm: () => Promise<void>
}

export function DeleteDialog({ open, dir, entries, onClose, onConfirm }: DeleteDialogProps) {
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setDeleting(false)
    setError(null)
  }, [open])

  useEffect(() => {
    if (!open || deleting) return
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, deleting, onClose])

  if (!open) return null

  const confirm = async () => {
    setDeleting(true)
    setError(null)
    try {
      await onConfirm()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '删除失败')
    } finally {
      setDeleting(false)
    }
  }

  const fileCount = entries.filter((entry) => entry.type === 'file').length
  const folderCount = entries.filter((entry) => entry.type === 'directory').length
  const counts = [
    fileCount > 0 ? `${fileCount} 个文件` : '',
    folderCount > 0 ? `${folderCount} 个文件夹` : '',
  ]
    .filter(Boolean)
    .join('、')
  const preview = entries.slice(0, 6)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-6 backdrop-blur-sm">
      <div className="animate-rise w-full max-w-lg rounded-2xl border border-line-strong bg-panel p-6 shadow-[0_40px_120px_-40px_rgba(0,0,0,0.9)]">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-rose-400/30 bg-rose-500/10 text-rose-300">
            <Trash2 className="size-5" strokeWidth={1.9} />
          </span>
          <div className="min-w-0 pt-0.5">
            <h2 className="text-[15px] font-semibold text-ink">删除文件或文件夹</h2>
            <p className="mt-0.5 truncate text-[11.5px] text-ink-faint" title={dir}>
              {dir}
            </p>
          </div>
        </div>

        <p className="mt-5 text-[12.5px] leading-relaxed text-ink-dim">
          将永久删除 <span className="font-medium text-rose-200">{entries.length}</span> 项
          {counts ? `（${counts}）` : ''}，此操作无法撤销。请确认以下内容不再需要：
        </p>

        {folderCount > 0 && (
          <p className="mt-2 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-[11.5px] leading-relaxed text-amber-200">
            文件夹及其中的全部内容都会被删除。
          </p>
        )}

        <ul className="mt-3 max-h-48 space-y-1 overflow-y-auto rounded-xl border border-line/70 bg-panel-2/50 p-2.5">
          {preview.map((entry) => (
            <li
              key={entry.name}
              className="truncate rounded-md px-1.5 py-1 font-mono text-[11.5px] text-ink-dim"
              title={joinPath(dir, entry.name)}
            >
              {entry.name}
              {entry.type === 'directory' && <span className="text-ink-faint">/</span>}
            </li>
          ))}
          {entries.length > preview.length && (
            <li className="px-1.5 py-1 text-[11px] text-ink-faint">
              等共 {entries.length} 项
            </li>
          )}
        </ul>

        {error && (
          <p className="mt-2.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[11.5px] leading-relaxed text-rose-200">
            {error}
          </p>
        )}

        <div className="mt-5 flex items-center justify-between gap-3 border-t border-line/70 pt-4">
          <span className="text-[11px] text-ink-faint">Esc 取消 · 删除后无法恢复</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={deleting}
              className="rounded-lg border border-line px-3.5 py-1.5 text-[12px] text-ink-dim transition hover:text-ink disabled:opacity-50"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => void confirm()}
              disabled={deleting || entries.length === 0}
              className="flex items-center gap-1.5 rounded-lg bg-rose-600 px-4 py-1.5 text-[12px] font-medium text-white transition hover:bg-rose-500 disabled:opacity-60"
            >
              {deleting && <Loader2 className="size-3.5 animate-spin" />}
              永久删除
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
