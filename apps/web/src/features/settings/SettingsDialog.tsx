import { useEffect, useRef } from 'react'
import { Check, Monitor, Moon, Sun, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { cn } from '@/lib/cn'
import { setTheme, useResolvedTheme, useThemeMode, type ThemeMode } from '@/lib/theme'

const THEME_OPTIONS: Array<{
  value: ThemeMode
  label: string
  description: string
  icon: LucideIcon
}> = [
  {
    value: 'system',
    label: '跟随系统',
    description: '随操作系统的深浅色设置自动切换。',
    icon: Monitor,
  },
  {
    value: 'light',
    label: '浅色',
    description: '明亮背景，适合白天或强光环境。',
    icon: Sun,
  },
  {
    value: 'dark',
    label: '深色',
    description: '低光环境更舒适，保持当前的暗色风格。',
    icon: Moon,
  },
]

interface SettingsDialogProps {
  open: boolean
  onClose: () => void
}

export function SettingsDialog({ open, onClose }: SettingsDialogProps) {
  const mode = useThemeMode()
  const resolved = useResolvedTheme()
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    panelRef.current?.focus()
    return () => previous?.focus()
  }, [open])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-4 backdrop-blur-sm"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-dialog-title"
        tabIndex={-1}
        className="animate-rise flex max-h-[86vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-line-strong bg-panel shadow-[0_40px_120px_-40px_rgba(0,0,0,0.9)] outline-none"
      >
        <header className="flex shrink-0 items-start gap-3 border-b border-line/70 px-5 py-4">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-line bg-panel-2 text-brand-soft">
            <Sun className="size-4" strokeWidth={1.9} />
          </span>
          <div className="min-w-0 flex-1">
            <h1 id="settings-dialog-title" className="text-[14px] font-semibold tracking-tight text-ink">
              设置
            </h1>
            <p className="mt-0.5 text-[11.5px] text-ink-faint">调整界面外观与其他本地偏好。</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭设置"
            className="grid size-8 shrink-0 place-items-center rounded-lg text-ink-faint transition hover:bg-hover-strong hover:text-ink"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <section className="border-b border-line/70 px-5 py-4">
            <h2 className="text-[12.5px] font-medium text-ink">外观</h2>
            <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-faint">
              选择界面配色主题，更改会立即生效并保存在本机。
            </p>

            <div className="mt-3 grid gap-2.5 sm:grid-cols-3">
              {THEME_OPTIONS.map((option) => {
                const Icon = option.icon
                const active = mode === option.value

                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setTheme(option.value)}
                    aria-pressed={active}
                    className={cn(
                      'relative flex flex-col items-start gap-2 rounded-xl border p-3 text-left transition',
                      active
                        ? 'border-brand/60 bg-brand/[0.10] shadow-[0_0_0_1px_rgba(139,92,246,0.22)]'
                        : 'border-line bg-panel-2/50 hover:border-line-strong hover:bg-hover',
                    )}
                  >
                    <span
                      className={cn(
                        'grid size-8 place-items-center rounded-lg transition',
                        active ? 'bg-brand text-white' : 'bg-raised text-ink-dim',
                      )}
                    >
                      <Icon className="size-4" strokeWidth={1.9} />
                    </span>

                    <span className="text-[12.5px] font-medium text-ink">{option.label}</span>
                    <span className="text-[11px] leading-relaxed text-ink-faint">
                      {option.description}
                    </span>

                    {active && (
                      <Check
                        className="absolute right-3 top-3 size-4 text-brand-soft"
                        strokeWidth={2.2}
                      />
                    )}
                  </button>
                )
              })}
            </div>
          </section>
        </div>

        <footer className="flex shrink-0 items-center gap-2 border-t border-line/70 px-5 py-3 text-[11.5px] text-ink-faint">
          <span
            className={cn(
              'size-1.5 rounded-full',
              resolved === 'dark' ? 'bg-brand-soft' : 'bg-amber-400',
            )}
          />
          当前显示：{resolved === 'dark' ? '深色' : '浅色'}
          {mode === 'system' && '（跟随系统）'}
          <button
            type="button"
            onClick={onClose}
            className="ml-auto rounded-lg border border-line bg-panel-2/60 px-3 py-1.5 text-[11.5px] text-ink-dim transition hover:border-line-strong hover:text-ink"
          >
            关闭
          </button>
        </footer>
      </div>
    </div>
  )
}
