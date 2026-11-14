import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useLocation } from 'react-router-dom'

export interface BreadcrumbItem {
  label: string
  to?: string
}

interface BreadcrumbsState {
  pathname: string
  items: BreadcrumbItem[]
}

interface BreadcrumbsContextValue {
  items: BreadcrumbItem[]
  setTrail: (items: BreadcrumbItem[]) => void
}

const BreadcrumbsContext = createContext<BreadcrumbsContextValue | null>(null)

export function BreadcrumbsProvider({ children }: { children: ReactNode }) {
  const location = useLocation()
  const [state, setState] = useState<BreadcrumbsState>({ pathname: '', items: [] })

  const setTrail = useCallback(
    (items: BreadcrumbItem[]) => {
      setState({ pathname: location.pathname, items })
    },
    [location.pathname],
  )

  const items = state.pathname === location.pathname ? state.items : []

  const value = useMemo(() => ({ items, setTrail }), [items, setTrail])

  return <BreadcrumbsContext.Provider value={value}>{children}</BreadcrumbsContext.Provider>
}

/**
 * 页面用声明式面包屑补充当前路由的层级。
 * 组件卸载后不再清理，由 pathname 匹配保证旧数据不会出现在其他页面。
 */
export function useBreadcrumbs(items: BreadcrumbItem[]): void {
  const setTrail = useContext(BreadcrumbsContext)?.setTrail
  const serialized = JSON.stringify(items)

  useEffect(() => {
    if (!setTrail) return
    setTrail(JSON.parse(serialized) as BreadcrumbItem[])
  }, [serialized, setTrail])
}

export function useBreadcrumbsTrail(): BreadcrumbItem[] {
  return useContext(BreadcrumbsContext)?.items ?? []
}
