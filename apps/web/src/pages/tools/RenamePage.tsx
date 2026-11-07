import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CheckCircle2, Info, XCircle } from 'lucide-react'

import { api, ApiError, joinPath } from '@/lib/api'
import { cn } from '@/lib/cn'
import { FileDetails } from '@/features/rename/FileDetails'
import { FileGrid } from '@/features/rename/FileGrid'
import { FileList } from '@/features/rename/FileList'
import { FileViewer } from '@/features/rename/FileViewer'
import { FileToolbar, type SortKey, type ViewMode } from '@/features/rename/FileToolbar'
import { FolderBar } from '@/features/rename/FolderBar'
import { RenamePanel } from '@/features/rename/RenamePanel'
import { SingleRenameDialog } from '@/features/rename/SingleRenameDialog'
import {
  EmptyView,
  ErrorView,
  LoadingView,
  WelcomeView,
} from '@/features/rename/StatusViews'
import type {
  DirectoryListing,
  FsEntry,
  Notice,
  RootsResponse,
  StatItem,
} from '@/features/rename/types'

const VIEW_KEY = 'gallery.rename.view'

export function RenamePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const path = searchParams.get('path') ?? ''

  const [roots, setRoots] = useState<RootsResponse | null>(null)
  const [rootsError, setRootsError] = useState<string | null>(null)

  const [listing, setListing] = useState<DirectoryListing | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  const [showHidden, setShowHidden] = useState(false)
  const [view, setView] = useState<ViewMode>(() =>
    window.localStorage.getItem(VIEW_KEY) === 'grid' ? 'grid' : 'list',
  )
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [query, setQuery] = useState('')
  const [extension, setExtension] = useState('')

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [activeName, setActiveName] = useState<string | null>(null)
  const [viewerEntry, setViewerEntry] = useState<FsEntry | null>(null)
  const [renameOpen, setRenameOpen] = useState(false)
  const [singleTarget, setSingleTarget] = useState<string | null>(null)
  const [stats, setStats] = useState<Map<string, StatItem>>(new Map())
  const [undoing, setUndoing] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)

  const lastIndexRef = useRef<number | null>(null)
  const fetchedRef = useRef(new Set<string>())
  const inflightRef = useRef(new Set<string>())

  useEffect(() => {
    api
      .roots()
      .then(setRoots)
      .catch((caught) => {
        setRootsError(caught instanceof ApiError ? caught.message : '无法读取磁盘列表')
      })
  }, [])

  useEffect(() => {
    if (!path) {
      setListing(null)
      setError(null)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)
    fetchedRef.current.clear()
    inflightRef.current.clear()
    setStats(new Map())

    api
      .list(path, showHidden)
      .then((data) => {
        if (cancelled) return
        setListing(data)
        setSelected(new Set())
        lastIndexRef.current = null
      })
      .catch((caught) => {
        if (cancelled) return
        setListing(null)
        setSelected(new Set())
        setError(caught instanceof ApiError ? caught.message : '无法读取该目录')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [path, showHidden, reloadToken])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), 4500)
    return () => window.clearTimeout(timer)
  }, [notice])

  const navigate = useCallback(
    (next: string) => {
      const params = new URLSearchParams(searchParams)
      if (next) params.set('path', next)
      else params.delete('path')
      setSearchParams(params)
      setQuery('')
      setExtension('')
      setActiveName(null)
      setViewerEntry(null)
      lastIndexRef.current = null
    },
    [searchParams, setSearchParams],
  )

  const requestStats = useCallback((paths: string[]) => {
    const missing = paths.filter(
      (value) => !fetchedRef.current.has(value) && !inflightRef.current.has(value),
    )
    if (missing.length === 0) return

    const batch = missing.slice(0, 200)
    for (const value of batch) inflightRef.current.add(value)

    api
      .stats(batch)
      .then(({ items }) => {
        setStats((previous) => {
          const next = new Map(previous)
          for (const item of items) next.set(item.path, item)
          return next
        })
        for (const value of batch) {
          inflightRef.current.delete(value)
          fetchedRef.current.add(value)
        }
      })
      .catch(() => {
        for (const value of batch) inflightRef.current.delete(value)
      })
  }, [])

  const handleVisible = useCallback(
    (paths: string[]) => {
      requestStats(paths)
    },
    [requestStats],
  )

  const entries = listing?.entries ?? []
  const currentDir = listing?.path ?? path

  const activeEntry = useMemo(
    () => entries.find((entry) => entry.name === activeName && entry.type === 'file') ?? null,
    [entries, activeName],
  )

  useEffect(() => {
    if (!activeName) return
    if (!entries.some((entry) => entry.name === activeName && entry.type === 'file')) {
      setActiveName(null)
    }
  }, [entries, activeName])

  const extensions = useMemo(
    () =>
      [...new Set(entries.filter((entry) => entry.type === 'file').map((entry) => entry.extension))]
        .filter(Boolean)
        .sort(),
    [entries],
  )

  const displayEntries = useMemo(() => {
    let list = entries
    const term = query.trim().toLowerCase()

    if (term) list = list.filter((entry) => entry.name.toLowerCase().includes(term))
    if (extension) {
      list = list.filter((entry) => entry.type === 'directory' || entry.extension === extension)
    }

    const factor = sortDir === 'asc' ? 1 : -1

    return [...list].sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1

      if (sortKey === 'name') {
        return a.name.localeCompare(b.name, 'zh-CN', { numeric: true }) * factor
      }
      if (sortKey === 'type') {
        return (
          (a.extension.localeCompare(b.extension) || a.name.localeCompare(b.name)) * factor
        )
      }

      const left = stats.get(joinPath(currentDir, a.name))
      const right = stats.get(joinPath(currentDir, b.name))

      if (sortKey === 'size') {
        return ((left?.size ?? -1) - (right?.size ?? -1)) * factor
      }
      return ((left?.mtimeMs ?? 0) - (right?.mtimeMs ?? 0)) * factor
    })
  }, [entries, query, extension, sortKey, sortDir, stats, currentDir])

  const effectiveSelected = useMemo(() => {
    const next = new Set(selected)
    if (activeEntry && displayEntries.some((entry) => entry.name === activeEntry.name)) {
      next.add(activeEntry.name)
    }
    return next
  }, [selected, activeEntry, displayEntries])

  const handleSort = (key: SortKey) => {
    setSortKey(key)
    setSortDir('asc')
  }
  const handleToggleDir = () => setSortDir((value) => (value === 'asc' ? 'desc' : 'asc'))

  const handleView = (next: ViewMode) => {
    setView(next)
    window.localStorage.setItem(VIEW_KEY, next)
  }

  const handleToggleSelect = useCallback(
    (entry: FsEntry, index: number, event: ReactMouseEvent) => {
      if (entry.type === 'directory') return

      setSelected((previous) => {
        const next = new Set(previous)

        if (event.shiftKey && lastIndexRef.current !== null) {
          const start = Math.min(lastIndexRef.current, index)
          const end = Math.max(lastIndexRef.current, index)
          for (let cursor = start; cursor <= end; cursor += 1) {
            const item = displayEntries[cursor]
            if (item && item.type === 'file') next.add(item.name)
          }
          return next
        }

        if (next.has(entry.name)) next.delete(entry.name)
        else next.add(entry.name)
        lastIndexRef.current = index
        return next
      })
    },
    [displayEntries],
  )

  const handleActivate = useCallback((entry: FsEntry) => {
    if (entry.type === 'file') setActiveName(entry.name)
  }, [])

  const handleOpenDirectory = useCallback(
    (entry: FsEntry) => {
      if (entry.type === 'directory') navigate(joinPath(currentDir, entry.name))
    },
    [navigate, currentDir],
  )

  const handleSingleRename = useCallback(
    async (to: string) => {
      if (!singleTarget) return
      const from = singleTarget

      const result = await api.renameOne({ dir: currentDir, from, to })

      if (result.failed.length > 0) {
        throw new Error(result.failed[0]?.message ?? '重命名失败')
      }

      setNotice({ kind: 'ok', text: `已重命名为「${to}」` })
      setSelected(new Set())
      setActiveName(null)
      setSingleTarget(null)
      setReloadToken((value) => value + 1)
    },
    [singleTarget, currentDir],
  )

  const selectedFiles = useMemo(
    () =>
      displayEntries
        .filter((entry) => entry.type === 'file' && effectiveSelected.has(entry.name))
        .map((entry) => entry.name),
    [displayEntries, effectiveSelected],
  )

  const existingNames = useMemo(
    () => entries.filter((entry) => !effectiveSelected.has(entry.name)).map((entry) => entry.name),
    [entries, effectiveSelected],
  )

  const handleUndo = async () => {
    setUndoing(true)
    try {
      const result = await api.undo()
      setNotice({ kind: 'ok', text: `已撤销 ${result.renamed.length} 个改名` })
      setSelected(new Set())
      setActiveName(null)
      setReloadToken((value) => value + 1)
    } catch (caught) {
      setNotice({
        kind: 'error',
        text: caught instanceof ApiError ? caught.message : '撤销失败',
      })
    } finally {
      setUndoing(false)
    }
  }

  const showList = Boolean(path) && !error

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-line/70 bg-panel/35">
      <FolderBar
        path={currentDir}
        parent={listing?.parent ?? null}
        roots={roots}
        loading={loading}
        showHidden={showHidden}
        onNavigate={navigate}
        onToggleHidden={() => setShowHidden((value) => !value)}
      />

      {showList && listing && (
        <FileToolbar
          total={displayEntries.length}
          selectedCount={selectedFiles.length}
          search={query}
          extension={extension}
          extensions={extensions}
          sortKey={sortKey}
          sortDir={sortDir}
          view={view}
          undoing={undoing}
          onSearch={setQuery}
          onExtension={setExtension}
          onSort={handleSort}
          onToggleDir={handleToggleDir}
          onView={handleView}
          onSelectAll={() =>
            setSelected(new Set(displayEntries.filter((entry) => entry.type === 'file').map((entry) => entry.name)))
          }
          onInvert={() =>
            setSelected((previous) => {
              const next = new Set<string>()
              for (const entry of displayEntries) {
                if (entry.type === 'file' && !previous.has(entry.name)) next.add(entry.name)
              }
              return next
            })
          }
          onClear={() => {
            setSelected(new Set())
            setActiveName(null)
          }}
          onOpenSingleRename={() => setSingleTarget(selectedFiles[0] ?? null)}
          onOpenRename={() => setRenameOpen(true)}
          onUndo={handleUndo}
        />
      )}

      <div className="relative flex min-h-0 flex-1">
        <div className="relative flex min-w-0 flex-1 flex-col">
          {!path ? (
            <WelcomeView roots={roots} onNavigate={navigate} error={rootsError} />
          ) : error ? (
            <ErrorView message={error} onRetry={() => setReloadToken((value) => value + 1)} />
          ) : !listing || (loading && entries.length === 0) ? (
            <LoadingView />
          ) : displayEntries.length === 0 ? (
            <EmptyView
              title={entries.length === 0 ? '这个目录是空的' : '没有匹配的文件'}
              description={
                entries.length === 0
                  ? '换一个目录，或使用上方的路径栏直接输入路径。'
                  : '调整搜索关键字或类型筛选后再试。'
              }
            />
          ) : view === 'list' ? (
            <FileList
              dir={currentDir}
              entries={displayEntries}
              stats={stats}
              selected={selected}
              activeName={activeName}
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
              onActivate={handleActivate}
              onToggleSelect={handleToggleSelect}
              onOpenDirectory={handleOpenDirectory}
              onVisible={handleVisible}
            />
          ) : (
            <FileGrid
              dir={currentDir}
              entries={displayEntries}
              stats={stats}
              selected={selected}
              activeName={activeName}
              capabilities={roots?.capabilities ?? null}
              onActivate={handleActivate}
              onToggleSelect={handleToggleSelect}
              onOpenDirectory={handleOpenDirectory}
              onVisible={handleVisible}
            />
          )}
        </div>

        {activeEntry && (
          <FileDetails
            key={joinPath(currentDir, activeEntry.name)}
            dir={currentDir}
            entry={activeEntry}
            stat={stats.get(joinPath(currentDir, activeEntry.name))}
            capabilities={roots?.capabilities ?? null}
            onClose={() => setActiveName(null)}
            onPreview={() => setViewerEntry(activeEntry)}
          />
        )}
      </div>

      <SingleRenameDialog
        open={singleTarget !== null}
        dir={currentDir}
        name={singleTarget ?? ''}
        onClose={() => setSingleTarget(null)}
        onSubmit={handleSingleRename}
      />

      <RenamePanel
        open={renameOpen}
        dir={currentDir}
        names={selectedFiles}
        existingNames={existingNames}
        stats={stats}
        onClose={() => setRenameOpen(false)}
        onApplied={(next) => {
          setNotice(next)
          if (next.kind === 'ok') {
            setReloadToken((value) => value + 1)
            setSelected(new Set())
            setActiveName(null)
          }
        }}
      />

      {viewerEntry && (
        <FileViewer
          key={joinPath(currentDir, viewerEntry.name)}
          dir={currentDir}
          entry={viewerEntry}
          onClose={() => setViewerEntry(null)}
        />
      )}

      {notice && (
        <div
          className={cn(
            'absolute bottom-4 right-4 z-40 flex max-w-md items-start gap-2 rounded-xl border px-3.5 py-2.5 text-[12px] shadow-2xl backdrop-blur',
            notice.kind === 'ok' && 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200',
            notice.kind === 'error' && 'border-rose-400/30 bg-rose-500/10 text-rose-200',
            notice.kind === 'info' && 'border-line-strong bg-panel-2/90 text-ink-dim',
          )}
        >
          {notice.kind === 'ok' ? (
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          ) : notice.kind === 'error' ? (
            <XCircle className="mt-0.5 size-4 shrink-0" />
          ) : (
            <Info className="mt-0.5 size-4 shrink-0" />
          )}
          <span className="leading-relaxed">{notice.text}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="ml-1 text-current/70 transition hover:text-current"
            aria-label="关闭提示"
          >
            ×
          </button>
        </div>
      )}
    </div>
  )
}
