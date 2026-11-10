import { useCallback, useEffect, useState } from 'react'
import {
  AlertTriangle,
  HardDrive,
  Library,
  Loader2,
  Plus,
  RefreshCw,
  Settings2,
} from 'lucide-react'

import { api, ApiError } from '@/lib/api'
import { cn } from '@/lib/cn'
import { DeleteLibraryDialog } from '@/features/library/DeleteLibraryDialog'
import { LibraryCard } from '@/features/library/LibraryCard'
import { LibraryDialog } from '@/features/library/LibraryDialog'
import {
  LIBRARY_CHANGED_EVENT,
  isActiveMigration,
  type LibraryOverview,
  type LibraryView,
  type RootStatus,
} from '@/features/library/types'
import { useSettings } from '@/features/settings/settings-context'

const ROOT_STATUS_LABELS: Record<RootStatus, string> = {
  unset: '未配置',
  ok: '可用',
  missing: '目录不存在',
  'not-directory': '不是目录',
  unreadable: '不可读',
  unwritable: '不可写',
  symlink: '符号链接',
}

interface Notice {
  kind: 'ok' | 'error'
  text: string
}

export function LibraryPage() {
  const { openSettings } = useSettings()
  const [overview, setOverview] = useState<LibraryOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState<LibraryView | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<LibraryView | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.libraryOverview()
      setOverview(data)
      setError(null)
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : '无法读取媒体库')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const handler = () => void load()
    window.addEventListener(LIBRARY_CHANGED_EVENT, handler)
    return () => window.removeEventListener(LIBRARY_CHANGED_EVENT, handler)
  }, [load])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), 5000)
    return () => window.clearTimeout(timer)
  }, [notice])

  const rootStatus = overview?.rootStatus ?? 'unset'
  const needsRoot = rootStatus === 'unset'
  const rootWarning = rootStatus !== 'ok' && rootStatus !== 'unset'
  const libraries = overview?.libraries ?? []
  const migration = overview?.migration ?? null
  const showMigration =
    migration !== null && (isActiveMigration(migration.state) || migration.state !== 'succeeded')

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[17px] font-semibold tracking-tight text-ink">媒体库</h1>
          <p className="mt-1 text-[12.5px] text-ink-dim">
            管理媒体根路径与媒体库。作品集目录由系统托管，文件规范来源保持原位。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void load()}
            aria-label="刷新媒体库"
            title="刷新"
            className="grid size-9 place-items-center rounded-lg border border-line bg-panel-2/60 text-ink-dim transition hover:border-line-strong hover:text-ink"
          >
            <RefreshCw className={cn('size-4', loading && 'animate-spin')} />
          </button>
          {!needsRoot && (
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="flex items-center gap-1.5 rounded-lg border border-brand/50 bg-brand/15 px-3 py-1.5 text-[12px] font-medium text-brand-soft transition hover:bg-brand/20"
            >
              <Plus className="size-3.5" />
              新建媒体库
            </button>
          )}
        </div>
      </header>

      {loading && !overview ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-[12.5px] text-ink-faint">
          <Loader2 className="size-4 animate-spin" />
          正在读取媒体库…
        </div>
      ) : error && !overview ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <AlertTriangle className="size-8 text-rose-300/80" strokeWidth={1.4} />
          <div className="max-w-md text-[12.5px] leading-relaxed text-ink-dim">{error}</div>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg border border-line bg-panel-2/70 px-3 py-1.5 text-[12px] text-ink-dim transition hover:border-line-strong hover:text-ink"
          >
            重试
          </button>
        </div>
      ) : needsRoot ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <div className="grid size-16 place-items-center rounded-2xl border border-line/70 bg-[linear-gradient(160deg,rgba(139,92,246,0.24),rgba(34,211,238,0.07))] shadow-[0_18px_50px_-24px_rgba(139,92,246,0.9)]">
            <Library className="size-7 text-brand-soft" strokeWidth={1.6} />
          </div>
          <h2 className="mt-2 text-lg font-semibold tracking-tight text-ink">先配置媒体根路径</h2>
          <p className="max-w-md text-[12.5px] leading-relaxed text-ink-dim">
            媒体根路径是作品集媒体库的默认落点。配置后才能创建媒体库。
          </p>
          <button
            type="button"
            onClick={() => openSettings('media')}
            className="mt-1 flex items-center gap-1.5 rounded-lg border border-brand/50 bg-brand/15 px-3.5 py-2 text-[12px] font-medium text-brand-soft transition hover:bg-brand/20"
          >
            <Settings2 className="size-3.5" />
            去设置
          </button>
        </div>
      ) : (
        <>
          <div
            className={cn(
              'flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 text-[11.5px]',
              rootWarning
                ? 'border-amber-400/25 bg-amber-400/5 text-amber-200'
                : 'border-line/80 bg-panel-2/40 text-ink-dim',
            )}
          >
            <HardDrive className="size-3.5 shrink-0" />
            <span className="shrink-0 text-ink-faint">媒体根路径</span>
            <span className="min-w-0 flex-1 truncate font-mono text-[11px]">
              {overview?.mediaRoot ?? '未配置'}
            </span>
            <span className="shrink-0 rounded-md border border-current/20 px-1.5 py-0.5">
              {ROOT_STATUS_LABELS[rootStatus]}
            </span>
            <button
              type="button"
              onClick={() => openSettings('media')}
              className="shrink-0 rounded-md border border-line bg-panel-2/60 px-2 py-0.5 text-[11px] text-ink-dim transition hover:border-line-strong hover:text-ink"
            >
              设置
            </button>
          </div>

          {rootWarning && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-400/25 bg-amber-400/5 px-3 py-2 text-[11.5px] leading-relaxed text-amber-200">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <span>媒体根路径当前不可用，作品集媒体库会显示异常；请到设置中修复。</span>
            </div>
          )}

          {showMigration && migration && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-brand/30 bg-brand/5 px-3 py-2 text-[11.5px] text-ink-dim">
              <RefreshCw
                className={cn('size-3.5 shrink-0 text-brand-soft', isActiveMigration(migration.state) && 'animate-spin')}
              />
              <span className="min-w-0 flex-1">
                {isActiveMigration(migration.state)
                  ? `媒体根路径迁移进行中（${migration.current}/${migration.total}）`
                  : migration.state === 'cleanup_failed'
                    ? '迁移已完成，但旧副本未完全清理'
                    : `上次迁移状态：${migration.state}`}
              </span>
              <button
                type="button"
                onClick={() => openSettings('media')}
                className="rounded-md border border-line bg-panel-2/60 px-2 py-0.5 text-[11px] text-ink-dim transition hover:border-line-strong hover:text-ink"
              >
                查看
              </button>
            </div>
          )}

          {libraries.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-line/80 bg-panel/25 text-center">
              <Library className="size-8 text-ink-faint/70" strokeWidth={1.4} />
              <div className="text-[13px] font-medium text-ink-dim">还没有媒体库</div>
              <p className="max-w-sm text-[12px] leading-relaxed text-ink-faint">
                创建作品集媒体库，登记媒体根路径下的内容；或创建文件规范媒体库，引用已有的 Jellyfin 风格目录。
              </p>
              <button
                type="button"
                onClick={() => setCreateOpen(true)}
                className="mt-1 flex items-center gap-1.5 rounded-lg border border-brand/50 bg-brand/15 px-3 py-1.5 text-[11.5px] font-medium text-brand-soft transition hover:bg-brand/20"
              >
                <Plus className="size-3.5" />
                新建媒体库
              </button>
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto pb-2">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {libraries.map((library) => (
                  <LibraryCard
                    key={library.id}
                    library={library}
                    onEdit={() => setEditing(library)}
                    onDelete={() => setDeleteTarget(library)}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <LibraryDialog
        open={createOpen || editing !== null}
        library={editing}
        onClose={() => {
          setCreateOpen(false)
          setEditing(null)
        }}
        onSaved={(saved) => {
          setNotice({ kind: 'ok', text: `已保存媒体库「${saved.name}」` })
          void load()
        }}
      />

      <DeleteLibraryDialog
        open={deleteTarget !== null}
        library={deleteTarget}
        passwordConfigured={overview?.deletePasswordConfigured ?? false}
        onClose={() => setDeleteTarget(null)}
        onDeleted={(message) => {
          setNotice({ kind: 'ok', text: message })
          void load()
        }}
        onNeedPassword={() => {
          setDeleteTarget(null)
          openSettings('security')
        }}
      />

      {notice && (
        <div
          className={cn(
            'fixed bottom-6 right-6 z-40 max-w-sm rounded-xl border px-3.5 py-2.5 text-[11.5px] shadow-lg backdrop-blur',
            notice.kind === 'ok'
              ? 'border-emerald-400/25 bg-emerald-950/80 text-emerald-200'
              : 'border-rose-400/25 bg-rose-950/80 text-rose-200',
          )}
        >
          {notice.text}
        </div>
      )}
    </div>
  )
}
