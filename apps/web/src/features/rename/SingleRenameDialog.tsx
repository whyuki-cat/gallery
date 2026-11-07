import { useEffect, useRef, useState } from 'react'
import { FilePenLine, Loader2 } from 'lucide-react'

import { joinPath } from '@/lib/api'

interface SingleRenameDialogProps {
  open: boolean
  dir: string
  name: string
  onClose: () => void
  onSubmit: (nextName: string) => Promise<void>
}

export function SingleRenameDialog({
  open,
  dir,
  name,
  onClose,
  onSubmit,
}: SingleRenameDialogProps) {
  const [draft, setDraft] = useState(name)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const fullPath = joinPath(dir, name)

  useEffect(() => {
    if (!open) return
    setDraft(name)
    setError(null)
    setSaving(false)

    const timer = window.setTimeout(() => {
      const input = inputRef.current
      if (!input) return
      input.focus()
      const dot = name.lastIndexOf('.')
      input.setSelectionRange(0, dot > 0 ? dot : name.length)
    }, 0)

    return () => window.clearTimeout(timer)
  }, [open, name])

  useEffect(() => {
    if (!open) return
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, saving, onClose])

  if (!open) return null

  const submit = async () => {
    const next = draft.trim()
    if (next === '' || next === name) {
      onClose()
      return
    }

    setSaving(true)
    setError(null)
    try {
      await onSubmit(next)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '重命名失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-6 backdrop-blur-sm">
      <div className="animate-rise w-full max-w-2xl rounded-2xl border border-line-strong bg-panel p-6 shadow-[0_40px_120px_-40px_rgba(0,0,0,0.9)]">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-line bg-panel-2 text-brand-soft">
            <FilePenLine className="size-5" strokeWidth={1.9} />
          </span>
          <div className="min-w-0 pt-0.5">
            <h2 className="text-[15px] font-semibold text-ink">重命名文件</h2>
            <p className="mt-0.5 truncate text-[11.5px] text-ink-faint" title={fullPath}>
              {fullPath}
            </p>
          </div>
        </div>

        <label
          htmlFor="single-rename-input"
          className="mt-5 block text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint"
        >
          新名称
        </label>
        <input
          id="single-rename-input"
          ref={inputRef}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void submit()
          }}
          disabled={saving}
          className="mt-2 h-11 w-full rounded-xl border border-line bg-panel/80 px-3.5 font-mono text-[14px] text-ink outline-none transition placeholder:text-ink-faint/70 focus:border-brand/60 disabled:opacity-60"
        />

        {error && (
          <p className="mt-2.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[11.5px] leading-relaxed text-rose-200">
            {error}
          </p>
        )}

        <div className="mt-5 flex items-center justify-between gap-3 border-t border-line/70 pt-4">
          <span className="text-[11px] text-ink-faint">Enter 保存 · Esc 取消</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-lg border border-line px-3.5 py-1.5 text-[12px] text-ink-dim transition hover:text-ink disabled:opacity-50"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={saving || draft.trim() === ''}
              className="flex items-center gap-1.5 rounded-lg bg-brand px-4 py-1.5 text-[12px] font-medium text-white transition hover:brightness-110 disabled:opacity-60"
            >
              {saving && <Loader2 className="size-3.5 animate-spin" />}
              保存
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
