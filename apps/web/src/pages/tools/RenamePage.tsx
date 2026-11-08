import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CheckCircle2, Info, XCircle } from 'lucide-react'

import { api, ApiError, joinPath } from '@/lib/api'
import { cn } from '@/lib/cn'
import { DeleteDialog } from '@/features/rename/DeleteDialog'
import { FileDetails } from '@/features/rename/FileDetails'
import { FileGrid } from '@/features/rename/FileGrid'
import { FileList } from '@/features/rename/FileList'
import { FileViewer } from '@/features/rename/FileViewer'
import { FileToolbar, type SortKey, type ViewMode } from '@/features/rename/FileToolbar'
import { FolderBar } from '@/features/rename/FolderBar'
import { isImageFile, isVideoFile } from '@/features/rename/format'
import { RenamePanel } from '@/features/rename/RenamePanel'
import { SingleRenameDialog } from '@/features/rename/SingleRenameDialog'
import {
  EmptyView,
  ErrorView,
  LoadingView,
  WelcomeView,
} from '@/features/rename/StatusViews'
import type {
  ActivateModifiers,
  DirectoryListing,
  FsEntry,
  Notice,
  RootsResponse,
  StatItem,
} from '@/features/rename/types'

const VIEW_KEY = 'gallery.rename.view'
const PATH_KEY = 'gallery.rename.path'

export function RenamePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const queryPath = searchParams.get('path') ?? ''

  // 从其他导航项返回或点击当前导航项时 URL 可能不再携带 path，用上次浏览的目录兜底
  const [lastPath, setLastPath] = useState(
    () => queryPath || (window.localStorage.getItem(PATH_KEY) ?? ''),
  )
  const path = queryPath || lastPath

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
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [viewerDeleteOpen, setViewerDeleteOpen] = useState(false)
  const [singleTarget, setSingleTarget] = useState<string | null>(null)
  const [stats, setStats] = useState<Map<string, StatItem>>(new Map())
  const [notice, setNotice] = useState<Notice | null>(null)

  const lastIndexRef = useRef<number | null>(null)
  const fetchedRef = useRef(new Set<string>())
  const inflightRef = useRef(new Set<string>())
  const pendingSelectionRef = useRef<{ dir: string; name: string } | null>(null)

  useEffect(() => {
    if (queryPath) setLastPath(queryPath)
  }, [queryPath])

  useEffect(() => {
    if (queryPath || !lastPath) return

    const params = new URLSearchParams(searchParams)
    params.set('path', lastPath)
    setSearchParams(params, { replace: true })
  }, [queryPath, lastPath, searchParams, setSearchParams])

  useEffect(() => {
    if (path) window.localStorage.setItem(PATH_KEY, path)
  }, [path])

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

        const pending = pendingSelectionRef.current
        pendingSelectionRef.current = null
        if (pending && pending.dir === data.path && data.entries.some((entry) => entry.name === pending.name)) {
          setSelected(new Set([pending.name]))
          lastIndexRef.current = data.entries.findIndex((entry) => entry.name === pending.name)
        } else {
          setSelected(new Set())
          lastIndexRef.current = null
        }
      })
      .catch((caught) => {
        if (cancelled) return
        pendingSelectionRef.current = null
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

  const viewerEntries = useMemo(
    () =>
      displayEntries.filter(
        (entry) =>
          entry.type === 'file' && (isImageFile(entry.extension) || isVideoFile(entry.extension)),
      ),
    [displayEntries],
  )

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
      if (event.shiftKey && lastIndexRef.current !== null) {
        const start = Math.min(lastIndexRef.current, index)
        const end = Math.max(lastIndexRef.current, index)

        setSelected((previous) => {
          const next = new Set(previous)
          for (let cursor = start; cursor <= end; cursor += 1) {
            const item = displayEntries[cursor]
            if (item) next.add(item.name)
          }
          return next
        })
        return
      }

      const wasSelected = selected.has(entry.name) || activeName === entry.name

      setSelected((previous) => {
        const next = new Set(previous)
        if (wasSelected) next.delete(entry.name)
        else next.add(entry.name)
        return next
      })

      if (wasSelected && activeName === entry.name) setActiveName(null)
      lastIndexRef.current = index
    },
    [activeName, displayEntries, selected],
  )

  const handleActivate = useCallback(
    (entry: FsEntry, event: ActivateModifiers) => {
      const index = displayEntries.findIndex((item) => item.name === entry.name)
      const additive = event.ctrlKey || event.metaKey

      if (event.shiftKey && lastIndexRef.current !== null && index >= 0) {
        const start = Math.min(lastIndexRef.current, index)
        const end = Math.max(lastIndexRef.current, index)

        setSelected((previous) => {
          const next = new Set(previous)
          for (let cursor = start; cursor <= end; cursor += 1) {
            const item = displayEntries[cursor]
            if (item) next.add(item.name)
          }
          return next
        })
        if (entry.type === 'file') setActiveName(entry.name)
        return
      }

      if (additive) {
        const wasSelected = selected.has(entry.name) || activeName === entry.name

        setSelected((previous) => {
          const next = new Set(previous)
          if (wasSelected) next.delete(entry.name)
          else next.add(entry.name)
          return next
        })

        if (wasSelected) {
          if (activeName === entry.name) setActiveName(null)
        } else if (entry.type === 'file') {
          setActiveName(entry.name)
        }

        lastIndexRef.current = index
        return
      }

      setSelected(new Set([entry.name]))
      setActiveName(entry.type === 'file' ? entry.name : null)
      lastIndexRef.current = index
    },
    [activeName, displayEntries, selected],
  )

  const clearSelection = useCallback(() => {
    setSelected(new Set())
    setActiveName(null)
    lastIndexRef.current = null
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

  const selectedEntries = useMemo(
    () => displayEntries.filter((entry) => effectiveSelected.has(entry.name)),
    [displayEntries, effectiveSelected],
  )

  const selectedNames = useMemo(
    () => selectedEntries.map((entry) => entry.name),
    [selectedEntries],
  )

  const singleEntry = useMemo(
    () => entries.find((entry) => entry.name === singleTarget) ?? null,
    [entries, singleTarget],
  )

  const existingNames = useMemo(
    () => entries.filter((entry) => !effectiveSelected.has(entry.name)).map((entry) => entry.name),
    [entries, effectiveSelected],
  )

  const findNextFileName = useCallback(
    (deleting: Set<string>) => {
      let anchor = -1
      for (let index = 0; index < displayEntries.length; index += 1) {
        const entry = displayEntries[index]
        if (entry && deleting.has(entry.name)) anchor = index
      }

      for (let index = anchor + 1; index < displayEntries.length; index += 1) {
        const entry = displayEntries[index]
        if (entry && entry.type === 'file' && !deleting.has(entry.name)) {
          return entry.name
        }
      }

      return null
    },
    [displayEntries],
  )

  const handleDelete = useCallback(async () => {
    if (!currentDir || selectedNames.length === 0) return

    const deleting = new Set(selectedNames)
    const nextFile = findNextFileName(deleting)

    try {
      const result = await api.deleteFiles({ dir: currentDir, names: selectedNames })
      const firstFailure = result.failed[0]

      if (result.failed.length > 0) {
        setNotice({
          kind: 'error',
          text: `已删除 ${result.deleted.length} 项，${result.failed.length} 项失败${
            firstFailure ? `（${firstFailure.name}：${firstFailure.message}）` : ''
          }`,
        })
      } else {
        setNotice({ kind: 'ok', text: `已删除 ${result.deleted.length} 项` })
      }

      const jumpTarget = result.deleted.length > 0 ? nextFile : null
      pendingSelectionRef.current = jumpTarget ? { dir: currentDir, name: jumpTarget } : null
      setSelected(jumpTarget ? new Set([jumpTarget]) : new Set())
      setActiveName(jumpTarget)
      lastIndexRef.current = null
      setViewerEntry(null)
      setReloadToken((value) => value + 1)
    } catch (caught) {
      setNotice({
        kind: 'error',
        text: caught instanceof ApiError ? caught.message : '删除失败',
      })
      setReloadToken((value) => value + 1)
    } finally {
      setDeleteOpen(false)
    }
  }, [currentDir, selectedNames, findNextFileName])

  const handleViewerDelete = useCallback(async () => {
    if (!currentDir || !viewerEntry) return

    const target = viewerEntry
    const nextName = findNextFileName(new Set([target.name]))
    const result = await api.deleteFiles({ dir: currentDir, names: [target.name] })

    const firstFailure = result.failed[0]
    if (firstFailure) {
      throw new Error(`${firstFailure.name}：${firstFailure.message}`)
    }
    if (result.deleted.length === 0) {
      throw new Error('删除失败')
    }

    setNotice({ kind: 'ok', text: '已删除 1 项' })
    pendingSelectionRef.current = nextName ? { dir: currentDir, name: nextName } : null
    setSelected(nextName ? new Set([nextName]) : new Set())
    setActiveName(nextName)
    lastIndexRef.current = null
    setReloadToken((value) => value + 1)
    setViewerDeleteOpen(false)

    const nextEntry = nextName
      ? (displayEntries.find((entry) => entry.name === nextName) ?? null)
      : null
    const previewable = nextEntry
      ? viewerEntries.some((entry) => entry.name === nextEntry.name)
      : false
    setViewerEntry(previewable ? nextEntry : null)
  }, [currentDir, viewerEntry, findNextFileName, displayEntries, viewerEntries])

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
          selectedCount={selectedNames.length}
          search={query}
          extension={extension}
          extensions={extensions}
          sortKey={sortKey}
          sortDir={sortDir}
          view={view}
          refreshing={loading}
          onSearch={setQuery}
          onExtension={setExtension}
          onSort={handleSort}
          onToggleDir={handleToggleDir}
          onView={handleView}
          onSelectAll={() => setSelected(new Set(displayEntries.map((entry) => entry.name)))}
          onInvert={() =>
            setSelected((previous) => {
              const next = new Set<string>()
              for (const entry of displayEntries) {
                if (!previous.has(entry.name)) next.add(entry.name)
              }
              return next
            })
          }
          onClear={() => {
            setSelected(new Set())
            setActiveName(null)
          }}
          onOpenSingleRename={() => setSingleTarget(selectedNames[0] ?? null)}
          onOpenRename={() => setRenameOpen(true)}
          onDelete={() => setDeleteOpen(true)}
          onRefresh={() => setReloadToken((value) => value + 1)}
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
              onClearSelection={clearSelection}
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
              onClearSelection={clearSelection}
            />
          )}
        </div>

        {activeEntry ? (
          <FileDetails
            key={joinPath(currentDir, activeEntry.name)}
            dir={currentDir}
            entry={activeEntry}
            stat={stats.get(joinPath(currentDir, activeEntry.name))}
            capabilities={roots?.capabilities ?? null}
            onClose={() => setActiveName(null)}
            onPreview={() => setViewerEntry(activeEntry)}
          />
        ) : (
          <aside className="hidden w-[304px] shrink-0 flex-col border-l border-line/70 bg-panel/95 backdrop-blur-sm xl:flex">
            <div className="flex flex-1 items-center justify-center px-6 text-center">
              <p className="text-[11.5px] leading-relaxed text-ink-faint">
                选择文件后可在这里查看详情
              </p>
            </div>
          </aside>
        )}
      </div>

      <SingleRenameDialog
        open={singleTarget !== null}
        dir={currentDir}
        name={singleTarget ?? ''}
        kind={singleEntry?.type ?? 'file'}
        onClose={() => setSingleTarget(null)}
        onSubmit={handleSingleRename}
      />

      <DeleteDialog
        open={deleteOpen}
        dir={currentDir}
        entries={selectedEntries}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
      />

      <RenamePanel
        open={renameOpen}
        dir={currentDir}
        names={selectedNames}
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
          entries={viewerEntries}
          onNavigate={(entry) => {
            if (!viewerDeleteOpen) setViewerEntry(entry)
          }}
          onDelete={() => setViewerDeleteOpen(true)}
          onClose={() => {
            if (viewerDeleteOpen) return
            const name = viewerEntry.name
            setActiveName(name)
            setSelected(new Set([name]))
            lastIndexRef.current = displayEntries.findIndex((item) => item.name === name)
            setViewerEntry(null)
          }}
        />
      )}

      {viewerDeleteOpen && viewerEntry && (
        <DeleteDialog
          open
          dir={currentDir}
          entries={[viewerEntry]}
          onClose={() => setViewerDeleteOpen(false)}
          onConfirm={handleViewerDelete}
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
