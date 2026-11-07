import { Check, Monitor, Moon, Sun } from 'lucide-react'
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

export function SettingsPage() {
  const mode = useThemeMode()
  const resolved = useResolvedTheme()

  return (
    <div className="animate-rise min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl py-2">
        <header className="mb-6">
          <h1 className="text-lg font-semibold tracking-tight text-ink">设置</h1>
          <p className="mt-1 text-[12.5px] text-ink-dim">调整界面外观与其他本地偏好。</p>
        </header>

        <section className="overflow-hidden rounded-2xl border border-line/80 bg-panel/60">
          <div className="flex items-start gap-3 border-b border-line/70 px-5 py-4">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-line bg-panel-2 text-brand-soft">
              <Sun className="size-4" strokeWidth={1.9} />
            </span>
            <div>
              <h2 className="text-[13.5px] font-medium text-ink">外观</h2>
              <p className="mt-0.5 text-[12px] leading-relaxed text-ink-faint">
                选择界面配色主题，更改会立即生效并保存在本机。
              </p>
            </div>
          </div>

          <div className="grid gap-2.5 p-5 sm:grid-cols-3">
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
                    <Check className="absolute right-3 top-3 size-4 text-brand-soft" strokeWidth={2.2} />
                  )}
                </button>
              )
            })}
          </div>

          <div className="flex items-center gap-2 border-t border-line/70 px-5 py-3 text-[11.5px] text-ink-faint">
            <span
              className={cn(
                'size-1.5 rounded-full',
                resolved === 'dark' ? 'bg-brand-soft' : 'bg-amber-400',
              )}
            />
            当前显示：{resolved === 'dark' ? '深色' : '浅色'}
            {mode === 'system' && '（跟随系统）'}
          </div>
        </section>
      </div>
    </div>
  )
}
