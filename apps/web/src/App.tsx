import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { AppShell } from '@/components/layout/AppShell'
import { LibraryPage } from '@/pages/library/LibraryPage'
import { RenamePage } from '@/pages/tools/RenamePage'
import { TrimPage } from '@/pages/tools/TrimPage'

const DEFAULT_ROUTE = '/tools/rename'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Navigate to={DEFAULT_ROUTE} replace />} />
          <Route path="/tools/rename" element={<RenamePage />} />
          <Route path="/tools/trim" element={<TrimPage />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="*" element={<Navigate to={DEFAULT_ROUTE} replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
