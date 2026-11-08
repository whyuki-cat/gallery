import { Clapperboard } from 'lucide-react'
import { Link, NavLink } from 'react-router-dom'

import { navSections, settingsItem, type NavItem } from '@/lib/nav'
import { cn } from '@/lib/cn'

const itemBase =
  'group relative flex h-10 items-center gap-3 rounded-2xl border border-transparent px-3 text-[13px] font-medium transition-all duration-200'

export function Sidebar({ collapsed }: { collapsed: boolean }) {
  return (
    <aside
      className={cn(
        'relative z-20 flex shrink-0 flex-col overflow-hidden border-r glass-panel',
        'transition-[width] duration-300 ease-out',
        collapsed ? 'w-[76px]' : 'w-[248px]',
      )}
    >
      {/* 环境光晕：给玻璃层提供可折射的色光 */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-24 -top-32 size-72 rounded-full bg-[var(--glass-aura-1)] blur-[72px]" />
        <div className="absolute -bottom-28 -left-20 size-64 rounded-full bg-[var(--glass-aura-2)] blur-[72px]" />
        <div className="absolute inset-x-0 top-0 h-40 bg-[linear-gradient(180deg,var(--glass-sheen),transparent)] opacity-70" />
        <div className="absolute inset-x-5 top-0 h-px bg-[linear-gradient(90deg,transparent,var(--glass-highlight),transparent)]" />
      </div>

      <div className="relative z-10 flex h-full min-h-0 flex-col">
        {/* 品牌区 */}
        <div className={cn('flex h-16 items-center gap-3', collapsed ? 'justify-center px-0' : 'px-4')}>
          <Link
            to="/"
            aria-label="Gallery 首页"
            className="group relative grid size-9 shrink-0 place-items-center overflow-hidden rounded-[14px] bg-[linear-gradient(135deg,#8b5cf6,#22d3ee)] shadow-[0_12px_28px_-14px_rgba(139,92,246,0.95),inset_0_1px_0_rgba(255,255,255,0.45)] ring-1 ring-white/25 transition-transform duration-200 hover:scale-[1.04] active:scale-95"
          >
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-[linear-gradient(160deg,rgba(255,255,255,0.5),transparent_58%)]"
            />
            <Clapperboard className="relative size-[18px] text-white" strokeWidth={2.2} />
          </Link>

          {!collapsed && (
            <div className="min-w-0 flex-1">
              <div className="truncate text-[15px] font-semibold tracking-tight text-ink">Gallery</div>
              <div className="truncate text-[11px] text-ink-faint">本地媒体管理器</div>
            </div>
          )}
        </div>

        {/* 导航 */}
        <nav className="flex-1 space-y-6 overflow-x-hidden overflow-y-auto px-3 py-5">
          {navSections.map((section) => (
            <div key={section.id}>
              {collapsed ? (
                <div className="mx-auto mb-2 h-px w-6 bg-[linear-gradient(90deg,transparent,var(--glass-border),transparent)]" />
              ) : (
                <div className="mb-2 px-3 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
                  {section.label}
                </div>
              )}

              <ul className="space-y-1">
                {section.items.map((item) => (
                  <li key={item.to}>
                    <SidebarItem item={item} collapsed={collapsed} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        {/* 底部 */}
        <div className="border-t border-line/60 p-3">
          <SidebarItem item={settingsItem} collapsed={collapsed} />

          <div
            className={cn(
              'mt-2 rounded-xl border border-line/50 bg-[var(--glass-inner)] py-1.5 text-[10.5px] text-ink-faint',
              collapsed ? 'text-center' : 'px-3',
            )}
          >
            {collapsed ? 'v0.1' : 'v0.1.0 · pre-alpha'}
          </div>
        </div>
      </div>
    </aside>
  )
}

function SidebarItem({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const Icon = item.icon

  if (item.disabled) {
    return (
      <div
        className={cn(
          itemBase,
          'cursor-not-allowed text-ink-faint/80',
          collapsed && 'justify-center px-0',
        )}
        title={collapsed ? `${item.label} · ${item.badge}` : undefined}
      >
        <Icon className="size-[18px] shrink-0" strokeWidth={1.8} />
        {!collapsed && (
          <>
            <span className="truncate">{item.label}</span>
            <span className="ml-auto rounded-md border border-line px-1.5 py-0.5 text-[10px] font-normal text-ink-faint">
              {item.badge}
            </span>
          </>
        )}
      </div>
    )
  }

  return (
    <NavLink
      to={item.to}
      title={collapsed ? item.label : undefined}
      className={({ isActive }) =>
        cn(
          itemBase,
          'outline-none',
          collapsed && 'justify-center px-0',
          isActive
            ? 'glass-pill text-ink'
            : 'text-ink-dim hover:border-white/[0.06] hover:bg-hover hover:text-ink',
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon
            className={cn(
              'size-[18px] shrink-0 transition-colors',
              isActive ? 'text-brand-soft' : 'text-ink-faint group-hover:text-ink-dim',
            )}
            strokeWidth={1.9}
          />
          {!collapsed && <span className="truncate">{item.label}</span>}
          {!collapsed && isActive && (
            <span className="ml-auto size-1.5 rounded-full bg-brand-soft shadow-[0_0_10px_rgba(167,139,250,0.85)]" />
          )}
        </>
      )}
    </NavLink>
  )
}
