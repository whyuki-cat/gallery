import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { AppShell } from '@/components/layout/AppShell'
import { allNavItems } from '@/lib/nav'
import { Placeholder } from '@/pages/Placeholder'
import { SettingsPage } from '@/pages/SettingsPage'
import { RenamePage } from '@/pages/tools/RenamePage'

const DEFAULT_ROUTE = '/tools/rename'

const pages = allNavItems.filter((item) => !item.disabled && item.to !== '/settings')

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Navigate to={DEFAULT_ROUTE} replace />} />
          <Route path="/tools/rename" element={<RenamePage />} />
          <Route path="/settings" element={<SettingsPage />} />
          {pages
            .filter((item) => item.to !== '/tools/rename')
            .map((item) => (
              <Route key={item.to} path={item.to} element={<Placeholder item={item} />} />
            ))}
          <Route path="*" element={<Navigate to={DEFAULT_ROUTE} replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
