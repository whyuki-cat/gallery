import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { Link, Outlet, useLocation } from 'react-router-dom'

import {
  BreadcrumbsProvider,
  useBreadcrumbsTrail,
  type BreadcrumbItem,
} from '@/components/layout/breadcrumbs'
import { Sidebar } from '@/components/layout/Sidebar'
import {
  SettingsContext,
  type SettingsSection,
} from '@/features/settings/settings-context'
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
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('appearance')

  const openSettings = useCallback((section: SettingsSection = 'appearance') => {
    setSettingsSection(section)
    setSettingsOpen(true)
  }, [])

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0')
  }, [collapsed])

  return (
    <BreadcrumbsProvider>
      <SettingsContext.Provider value={{ openSettings }}>
        <div className="flex h-screen overflow-hidden">
          <Sidebar
            collapsed={collapsed}
            settingsOpen={settingsOpen}
            onOpenSettings={() => openSettings('appearance')}
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

                <BreadcrumbTrail
                  sectionLabel={section?.label}
                  currentLabel={current?.label}
                />
              </div>

              <ServerStatus />
            </header>

            <main className="relative flex-1 overflow-hidden">
              <div className="flex h-full w-full flex-col px-8 py-8">
                <Outlet />
              </div>
            </main>
          </div>

          <SettingsDialog
            open={settingsOpen}
            section={settingsSection}
            onClose={() => setSettingsOpen(false)}
          />
        </div>
      </SettingsContext.Provider>
    </BreadcrumbsProvider>
  )
}

function BreadcrumbTrail({
  sectionLabel,
  currentLabel,
}: {
  sectionLabel?: string
  currentLabel?: string
}) {
  const trail = useBreadcrumbsTrail()
  const items: BreadcrumbItem[] =
    trail.length > 0 ? trail : currentLabel ? [{ label: currentLabel }] : []

  return (
    <nav aria-label="面包屑" className="flex min-w-0 items-center gap-2 text-[13px]">
      {sectionLabel && (
        <>
          <span className="shrink-0 text-ink-faint">{sectionLabel}</span>
          <span className="shrink-0 text-ink-faint/60">/</span>
        </>
      )}
      {items.map((item, index) => {
        const last = index === items.length - 1
        return (
          <Fragment key={`${item.label}-${index}`}>
            {index > 0 && <span className="shrink-0 text-ink-faint/60">/</span>}
            {item.to && !last ? (
              <Link
                to={item.to}
                className="max-w-[180px] truncate text-ink-dim transition hover:text-ink"
              >
                {item.label}
              </Link>
            ) : last ? (
              <span aria-current="page" className="max-w-[280px] truncate font-medium text-ink">
                {item.label}
              </span>
            ) : (
              <span className="max-w-[180px] truncate text-ink-dim">{item.label}</span>
            )}
          </Fragment>
        )
      })}
    </nav>
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
