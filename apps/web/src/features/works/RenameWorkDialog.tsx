import { useEffect, useState } from 'react'
import { AlertTriangle, Loader2, Pencil, X } from 'lucide-react'

import { api, ApiError } from '@/lib/api'
import type { WorkDetail } from '@/features/works/types'

interface RenameWorkDialogProps {
  open: boolean
  work: WorkDetail
  onClose: () => void
  onRenamed: (work: WorkDetail) => void
}

export function RenameWorkDialog({ open, work, onClose, onRenamed }: RenameWorkDialogProps) {
  const [name, setName] = useState(work.name)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setName(work.name)
    setBusy(false)
    setError(null)
  }, [open, work.name])

  if (!open) return null

  async function submit(): Promise<void> {
    setError(null)
    if (!name.trim()) {
      setError('作品名称不能为空')
      return
    }
    setBusy(true)
    try {
      const updated = await api.renameWork(work.id, { name: name.trim() })
      onRenamed(updated)
      onClose()
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : '重命名失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-scrim p-4 backdrop-blur-sm"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="rename-work-title"
        className="animate-rise w-full max-w-md overflow-hidden rounded-2xl border border-line-strong bg-panel shadow-[0_40px_120px_-40px_rgba(0,0,0,0.9)]"
      >
        <header className="flex items-center gap-3 border-b border-line/70 px-5 py-4">
          <span className="grid size-9 place-items-center rounded-xl border border-brand/30 bg-brand/10 text-brand-soft">
            <Pencil className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="rename-work-title" className="text-[14px] font-semibold text-ink">
              修改作品名称
            </h2>
            <p className="mt-0.5 text-[11.5px] text-ink-faint">
              只修改显示名称，不移动磁盘目录与文件。
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="关闭重命名对话框"
            className="grid size-8 place-items-center rounded-lg text-ink-faint transition hover:bg-hover-strong hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="space-y-3 px-5 py-4">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={busy}
            autoFocus
            className="h-9 w-full rounded-lg border border-line bg-panel-2/60 px-3 text-[12.5px] text-ink outline-none transition focus:border-brand/60 disabled:opacity-60"
          />
          {error && (
            <div className="flex items-start gap-1.5 rounded-lg border border-rose-400/25 bg-rose-400/5 px-3 py-2 text-[11.5px] leading-relaxed text-rose-200">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <footer className="flex items-center gap-2 border-t border-line/70 px-5 py-3">
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
            className="ml-auto flex items-center gap-1.5 rounded-lg border border-brand/50 bg-brand/15 px-3 py-1.5 text-[11.5px] font-medium text-brand-soft transition hover:bg-brand/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy && <Loader2 className="size-3.5 animate-spin" />}
            保存
          </button>
        </footer>
      </div>
    </div>
  )
}
