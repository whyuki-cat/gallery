import { useEffect, useMemo, useState } from 'react'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { Outlet, useLocation } from 'react-router-dom'

import { Sidebar } from '@/components/layout/Sidebar'
import { SettingsDialog } from '@/features/settings/SettingsDialog'
import { cn } from '@/lib/cn'
import { findNavItem, findNavSection } from '@/lib/nav'

const STORAGE_KEY = 'gallery.sidebar.collapsed'

export function AppShell() {
  const location = useLocation()
  const current = useMemo(() => findNavItem(location.pathname), [location.pathname])
  const section = useMemo(() => findNavSection(current), [current])

  const [collapsed, setCollapsed] = useState(
    () => window.localStorage.getItem(STORAGE_KEY) === '1',
  )
  const [settingsOpen, setSettingsOpen] = useState(false)

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0')
  }, [collapsed])

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        collapsed={collapsed}
        settingsOpen={settingsOpen}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-line/70 px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setCollapsed((value) => !value)}
              aria-label={collapsed ? '展开侧边栏' : '收起侧边栏'}
              title={collapsed ? '展开侧边栏' : '收起侧边栏'}
              className="grid size-8 shrink-0 place-items-center rounded-lg border border-line bg-panel-2/60 text-ink-dim transition hover:border-line-strong hover:bg-panel-3 hover:text-ink active:scale-95"
            >
              {collapsed ? (
                <PanelLeftOpen className="size-4" strokeWidth={1.9} />
              ) : (
                <PanelLeftClose className="size-4" strokeWidth={1.9} />
              )}
            </button>

            <nav aria-label="面包屑" className="flex min-w-0 items-center gap-2 text-[13px]">
              <span className="shrink-0 text-ink-faint">{section?.label ?? 'Gallery'}</span>
              <span className="shrink-0 text-ink-faint/40">/</span>
              <span className="truncate font-medium text-ink">{current?.label ?? '概览'}</span>
            </nav>
          </div>

          <ServerStatus />
        </header>

        <main className="relative flex-1 overflow-hidden">
          <div className="flex h-full w-full flex-col px-8 py-8">
            <Outlet />
          </div>
        </main>
      </div>

      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  )
}

function ServerStatus() {
  const [online, setOnline] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false

    fetch('/api/health')
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error('offline'))))
      .then(() => {
        if (!cancelled) setOnline(true)
      })
      .catch(() => {
        if (!cancelled) setOnline(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="flex shrink-0 items-center gap-2 rounded-full border border-line bg-panel-2/60 px-3 py-1.5 text-[11px] text-ink-dim">
      <span
        className={cn(
          'size-1.5 rounded-full',
          online === null && 'bg-ink-faint',
          online === true && 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.85)]',
          online === false && 'bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.7)]',
        )}
      />
      {online === null ? '连接中' : online ? '服务正常' : '服务离线'}
    </div>
  )
}
