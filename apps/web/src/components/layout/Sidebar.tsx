import { Clapperboard } from 'lucide-react'
import { Link, NavLink } from 'react-router-dom'

import { navSections, settingsItem, type NavItem } from '@/lib/nav'
import { cn } from '@/lib/cn'

const itemBase =
  'group relative flex h-10 items-center gap-3 rounded-xl px-3 text-[13px] font-medium transition-colors duration-200'

export function Sidebar({ collapsed }: { collapsed: boolean }) {
  return (
    <aside
      className={cn(
        'relative z-20 flex shrink-0 flex-col border-r border-line/80 bg-panel/70 backdrop-blur-xl',
        'transition-[width] duration-300 ease-out',
        collapsed ? 'w-[76px]' : 'w-[248px]',
      )}
    >
      {/* 品牌区 */}
      <div className={cn('flex h-16 items-center gap-3', collapsed ? 'justify-center px-0' : 'px-4')}>
        <Link
          to="/"
          aria-label="Gallery 首页"
          className="grid size-9 shrink-0 place-items-center rounded-xl bg-[linear-gradient(135deg,#8b5cf6,#22d3ee)] shadow-[0_10px_30px_-12px_rgba(139,92,246,0.95)]"
        >
          <Clapperboard className="size-[18px] text-white" strokeWidth={2.2} />
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
              <div className="mx-auto mb-2 h-px w-6 bg-line-strong" />
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
      <div className="border-t border-line/70 p-3">
        <SidebarItem item={settingsItem} collapsed={collapsed} />

        <div
          className={cn(
            'pt-2 text-[10.5px] text-ink-faint',
            collapsed ? 'text-center' : 'px-3',
          )}
        >
          {collapsed ? 'v0.1' : 'v0.1.0 · pre-alpha'}
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
            ? 'bg-[linear-gradient(90deg,rgba(139,92,246,0.20),rgba(139,92,246,0.05))] text-ink ring-1 ring-inset ring-white/[0.06]'
            : 'text-ink-dim hover:bg-hover hover:text-ink',
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
            <span className="ml-auto size-1.5 rounded-full bg-brand-soft shadow-[0_0_8px_rgba(167,139,250,0.8)]" />
          )}
        </>
      )}
    </NavLink>
  )
}
