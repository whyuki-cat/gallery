import { Sparkles } from 'lucide-react'

import type { NavItem } from '@/lib/nav'

export function Placeholder({ item }: { item: NavItem }) {
  const Icon = item.icon

  return (
    <div className="animate-rise flex flex-1 flex-col items-center justify-center text-center">
      <div className="relative">
        <div className="absolute inset-0 -z-10 rounded-full bg-brand/20 blur-3xl" />
        <div className="grid size-16 place-items-center rounded-2xl border border-line/70 bg-[linear-gradient(160deg,rgba(139,92,246,0.24),rgba(34,211,238,0.07))] shadow-[0_18px_50px_-24px_rgba(139,92,246,0.9)]">
          <Icon className="size-7 text-brand-soft" strokeWidth={1.6} />
        </div>
      </div>

      <h2 className="mt-6 text-xl font-semibold tracking-tight text-ink">{item.label}</h2>
      <p className="mt-2 max-w-sm text-[13px] leading-relaxed text-ink-dim">{item.description}</p>

      <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-line bg-panel-2/70 px-3 py-1.5 text-[11px] text-ink-faint">
        <Sparkles className="size-3.5 text-brand-soft/80" />
        板块已占位，功能开发中
      </div>
    </div>
  )
}
