import { AlertTriangle, Loader2, X } from 'lucide-react'

import { cn } from '@/lib/cn'

interface ConfirmDialogProps {
  open: boolean
  title: string
  description: string
  confirmLabel: string
  busy?: boolean
  danger?: boolean
  onConfirm: () => void
  onClose: () => void
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  busy = false,
  danger = false,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  if (!open) return null

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
        aria-labelledby="confirm-dialog-title"
        className="animate-rise w-full max-w-md overflow-hidden rounded-2xl border border-line-strong bg-panel shadow-[0_40px_120px_-40px_rgba(0,0,0,0.9)]"
      >
        <header className="flex items-start gap-3 border-b border-line/70 px-5 py-4">
          <span
            className={cn(
              'grid size-9 shrink-0 place-items-center rounded-xl border',
              danger
                ? 'border-rose-400/25 bg-rose-400/10 text-rose-200'
                : 'border-amber-400/25 bg-amber-400/10 text-amber-200',
            )}
          >
            <AlertTriangle className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="confirm-dialog-title" className="text-[14px] font-semibold text-ink">
              {title}
            </h2>
            <p className="mt-1 text-[11.5px] leading-relaxed text-ink-faint">{description}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="关闭确认对话框"
            className="grid size-8 place-items-center rounded-lg text-ink-faint transition hover:bg-hover-strong hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
          >
            <X className="size-4" />
          </button>
        </header>

        <footer className="flex items-center gap-2 px-5 py-3">
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
            onClick={onConfirm}
            disabled={busy}
            className={cn(
              'ml-auto flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11.5px] font-medium transition disabled:cursor-not-allowed disabled:opacity-50',
              danger
                ? 'border-rose-400/40 bg-rose-400/10 text-rose-200 hover:bg-rose-400/15'
                : 'border-brand/50 bg-brand/15 text-brand-soft hover:bg-brand/20',
            )}
          >
            {busy && <Loader2 className="size-3.5 animate-spin" />}
            {confirmLabel}
          </button>
        </footer>
      </div>
    </div>
  )
}
