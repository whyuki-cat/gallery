import { useEffect, useState } from 'react'
import { AlertTriangle, Loader2, ShieldAlert, Trash2, X } from 'lucide-react'

import { api, ApiError } from '@/lib/api'
import { cn } from '@/lib/cn'
import { ORGANIZATION_LABELS, type LibraryView } from '@/features/library/types'

interface DeleteLibraryDialogProps {
  open: boolean
  library: LibraryView | null
  passwordConfigured: boolean
  onClose: () => void
  onDeleted: (message: string) => void
  onNeedPassword: () => void
}

export function DeleteLibraryDialog({
  open,
  library,
  passwordConfigured,
  onClose,
  onDeleted,
  onNeedPassword,
}: DeleteLibraryDialogProps) {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setPassword('')
    setBusy(false)
    setError(null)
  }, [open, library])

  useEffect(() => {
    if (!open) return
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open || !library) return null

  const target = library
  const isCollection = target.organization === 'collection'
  const needsPassword = isCollection

  async function remove(): Promise<void> {
    setError(null)
    if (needsPassword && !passwordConfigured) {
      onNeedPassword()
      return
    }
    if (needsPassword && password.trim() === '') {
      setError('请输入删除保护密码')
      return
    }

    setBusy(true)
    try {
      const result = await api.deleteLibrary(target.id, {
        password: needsPassword ? password : undefined,
      })
      if (!result.deleted) {
        const failure = result.failed[0]
        setError(failure ? `删除失败：${failure.path}（${failure.message}）` : '删除失败')
        return
      }
      onDeleted(
        isCollection
          ? `已删除媒体库「${target.name}」及其内容`
          : `已移除媒体库「${target.name}」，来源目录保持不变`,
      )
      onClose()
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : '删除媒体库失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-4 backdrop-blur-sm"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-library-title"
        className="animate-rise flex w-full max-w-md flex-col overflow-hidden rounded-2xl border border-line-strong bg-panel shadow-[0_40px_120px_-40px_rgba(0,0,0,0.9)]"
      >
        <header className="flex shrink-0 items-center gap-3 border-b border-line/70 px-5 py-4">
          <span
            className={cn(
              'grid size-9 place-items-center rounded-xl border',
              isCollection
                ? 'border-rose-400/30 bg-rose-400/10 text-rose-200'
                : 'border-line bg-panel-2 text-ink-dim',
            )}
          >
            {isCollection ? <ShieldAlert className="size-4" /> : <Trash2 className="size-4" />}
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="delete-library-title" className="text-[14px] font-semibold text-ink">
              {isCollection ? '永久删除媒体库' : '移除媒体库'}
            </h2>
            <p className="mt-0.5 text-[11.5px] text-ink-faint">
              {ORGANIZATION_LABELS[library.organization]}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭删除确认"
            className="grid size-8 place-items-center rounded-lg text-ink-faint transition hover:bg-hover-strong hover:text-ink"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="space-y-3 px-5 py-4">
          <p className="text-[12.5px] leading-relaxed text-ink-dim">
            {isCollection
              ? `将永久删除「${library.name}」及其全部内容，无法撤销。`
              : `将只解除「${library.name}」的登记，不会删除任何来源目录或文件。`}
          </p>

          {isCollection && (
            <div className="flex items-start gap-2 rounded-xl border border-rose-400/25 bg-rose-400/5 px-3 py-2.5 text-[11.5px] leading-relaxed text-rose-200">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <span>这是不可恢复的操作。请确认已备份需要保留的文件。</span>
            </div>
          )}

          {isCollection && !passwordConfigured ? (
            <div className="rounded-xl border border-line/80 bg-panel-2/40 px-3 py-3">
              <p className="text-[11.5px] leading-relaxed text-ink-dim">
                尚未设置删除保护密码，无法删除作品集媒体库。
              </p>
              <button
                type="button"
                onClick={() => {
                  onClose()
                  onNeedPassword()
                }}
                className="mt-2 rounded-lg border border-brand/50 bg-brand/15 px-3 py-1.5 text-[11.5px] font-medium text-brand-soft transition hover:bg-brand/20"
              >
                去设置密码
              </button>
            </div>
          ) : (
            needsPassword && (
              <label className="block">
                <span className="text-[11.5px] font-medium text-ink-dim">删除保护密码</span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="输入密码以确认删除"
                  autoComplete="current-password"
                  className="mt-1.5 h-9 w-full rounded-lg border border-line bg-panel-2/60 px-3 text-[12.5px] text-ink outline-none transition placeholder:text-ink-faint focus:border-brand/60"
                />
              </label>
            )
          )}

          {error && (
            <div className="rounded-lg border border-rose-400/25 bg-rose-400/5 px-3 py-2 text-[11.5px] leading-relaxed text-rose-200">
              {error}
            </div>
          )}
        </div>

        <footer className="flex shrink-0 items-center gap-2 border-t border-line/70 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-line bg-panel-2/60 px-3 py-1.5 text-[11.5px] text-ink-dim transition hover:border-line-strong hover:text-ink"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => void remove()}
            disabled={
              busy ||
              (isCollection && !passwordConfigured) ||
              (needsPassword && password.trim() === '')
            }
            className={cn(
              'ml-auto flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11.5px] font-medium transition disabled:cursor-not-allowed disabled:opacity-50',
              isCollection
                ? 'border-rose-400/40 bg-rose-400/15 text-rose-200 hover:bg-rose-400/20'
                : 'border-brand/50 bg-brand/15 text-brand-soft hover:bg-brand/20',
            )}
          >
            {busy ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Trash2 className="size-3.5" />
            )}
            {isCollection ? '永久删除' : '移除登记'}
          </button>
        </footer>
      </div>
    </div>
  )
}
