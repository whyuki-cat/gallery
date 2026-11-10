import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'

import { api, ApiError } from '@/lib/api'
import { cn } from '@/lib/cn'
import { DirectoryPicker } from '@/features/library/DirectoryPicker'
import {
  isActiveMigration,
  notifyLibraryChanged,
  type LibraryOverview,
  type MigrationView,
  type RootStatus,
} from '@/features/library/types'
import type { SettingsSection } from '@/features/settings/settings-context'

const ROOT_STATUS_LABELS: Record<RootStatus, string> = {
  unset: '未配置',
  ok: '可用',
  missing: '目录不存在',
  'not-directory': '不是目录',
  unreadable: '不可读',
  unwritable: '不可写',
  symlink: '符号链接',
}

const PHASE_LABELS: Record<string, string> = {
  pending: '准备中',
  copying: '复制中',
  switching: '切换中',
  cleanup: '清理旧副本',
  cleanup_failed: '清理未完成',
  succeeded: '已完成',
  failed: '失败',
  interrupted: '已中断',
}

interface Notice {
  kind: 'ok' | 'error'
  text: string
}

export function MediaSettings({
  onOpenSection,
}: {
  onOpenSection: (section: SettingsSection) => void
}) {
  const [overview, setOverview] = useState<LibraryOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [rootDraft, setRootDraft] = useState('')
  const [createMissing, setCreateMissing] = useState(false)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [migrationId, setMigrationId] = useState<string | null>(null)
  const [migration, setMigration] = useState<MigrationView | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.libraryOverview()
      setOverview(data)
      setRootDraft((current) => current || data.mediaRoot || '')
      setMigration(data.migration)
      if (data.migration && isActiveMigration(data.migration.state)) {
        setMigrationId(data.migration.id)
      }
    } catch (reason) {
      setNotice({
        kind: 'error',
        text: reason instanceof ApiError ? reason.message : '无法读取媒体库设置',
      })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!migrationId) return

    let cancelled = false
    const timer = window.setInterval(() => {
      api
        .migrationStatus(migrationId)
        .then((view) => {
          if (cancelled) return
          setMigration(view)
          if (!isActiveMigration(view.state)) {
            window.clearInterval(timer)
            setMigrationId(null)
            setBusy(false)
            setPassword('')
            if (view.state === 'succeeded') {
              setNotice({ kind: 'ok', text: '媒体根路径迁移完成' })
            } else {
              setNotice({
                kind: 'error',
                text:
                  view.state === 'cleanup_failed'
                    ? '迁移已完成，但旧副本未完全清理，请查看提示'
                    : view.error ?? '媒体根路径迁移失败',
              })
            }
            notifyLibraryChanged()
            void load()
          }
        })
        .catch((reason: unknown) => {
          if (cancelled) return
          window.clearInterval(timer)
          setMigrationId(null)
          setBusy(false)
          setNotice({
            kind: 'error',
            text: reason instanceof ApiError ? reason.message : '无法读取迁移进度',
          })
        })
    }, 800)

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [migrationId, load])

  const collectionCount =
    overview?.libraries.filter((library) => library.organization === 'collection').length ?? 0
  const rootStatus = overview?.rootStatus ?? 'unset'
  const needsMigration = collectionCount > 0

  async function save(): Promise<void> {
    setNotice(null)
    const target = rootDraft.trim()
    if (!target) {
      setNotice({ kind: 'error', text: '请输入媒体根路径' })
      return
    }

    if (!needsMigration) {
      setBusy(true)
      try {
        await api.setMediaRoot({ mediaRoot: target, create: createMissing })
        setNotice({ kind: 'ok', text: '媒体根路径已保存' })
        notifyLibraryChanged()
        await load()
      } catch (reason) {
        setNotice({
          kind: 'error',
          text: reason instanceof ApiError ? reason.message : '保存媒体根路径失败',
        })
      } finally {
        setBusy(false)
      }
      return
    }

    if (!overview?.deletePasswordConfigured) {
      setNotice({ kind: 'error', text: '请先在「安全」中设置删除保护密码' })
      return
    }
    if (!password) {
      setNotice({ kind: 'error', text: '请输入删除保护密码' })
      return
    }

    setBusy(true)
    try {
      const result = await api.startMigration({ mediaRoot: target, password })
      setMigrationId(result.migrationId)
      setNotice({ kind: 'ok', text: '迁移已开始，请等待完成' })
    } catch (reason) {
      setBusy(false)
      setNotice({
        kind: 'error',
        text: reason instanceof ApiError ? reason.message : '启动迁移失败',
      })
    }
  }

  const progress =
    migration && migration.total > 0
      ? Math.min(100, Math.round((migration.current / migration.total) * 100))
      : 0

  return (
    <section className="px-5 py-4">
      <h2 className="text-[12.5px] font-medium text-ink">媒体根路径</h2>
      <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-faint">
        作品集媒体库会保存在此目录下。修改根路径时，已有作品集目录会自动迁移。
      </p>

      {loading && !overview ? (
        <div className="mt-4 flex items-center gap-2 text-[12px] text-ink-faint">
          <Loader2 className="size-4 animate-spin" />
          读取设置…
        </div>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11.5px]">
            <span className="rounded-md border border-line bg-panel-2/60 px-2 py-1 text-ink-faint">
              当前状态：{ROOT_STATUS_LABELS[rootStatus]}
            </span>
            {needsMigration && (
              <span className="rounded-md border border-amber-400/25 bg-amber-400/10 px-2 py-1 text-amber-200">
                已有 {collectionCount} 个作品集媒体库，保存将触发迁移
              </span>
            )}
          </div>

          <div className="mt-3 flex items-center gap-2">
            <input
              value={rootDraft}
              onChange={(event) => setRootDraft(event.target.value)}
              placeholder="输入媒体根路径"
              spellCheck={false}
              disabled={busy || Boolean(migrationId)}
              className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-panel-2/60 px-3 font-mono text-[12px] text-ink outline-none transition placeholder:text-ink-faint focus:border-brand/60 disabled:opacity-60"
            />
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              disabled={busy || Boolean(migrationId)}
              className="h-9 shrink-0 rounded-lg border border-line bg-panel-2/60 px-3 text-[12px] text-ink-dim transition hover:border-line-strong hover:text-ink disabled:opacity-50"
            >
              浏览
            </button>
          </div>

          {!needsMigration && (
            <label className="mt-2 flex items-center gap-2 text-[11.5px] text-ink-faint">
              <input
                type="checkbox"
                checked={createMissing}
                onChange={(event) => setCreateMissing(event.target.checked)}
                className="size-3.5 accent-[var(--color-brand)]"
              />
              目录不存在时创建
            </label>
          )}

          {needsMigration && (
            <div className="mt-3 rounded-xl border border-line/80 bg-panel-2/40 px-3 py-2.5">
              <p className="text-[11.5px] leading-relaxed text-ink-dim">
                修改根路径需要输入删除保护密码。迁移会先复制作品集目录，切换成功后再清理旧副本。
              </p>
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="删除保护密码"
                  disabled={busy || Boolean(migrationId)}
                  className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-panel-2/60 px-3 text-[12px] text-ink outline-none transition placeholder:text-ink-faint focus:border-brand/60 disabled:opacity-60"
                />
                {!overview?.deletePasswordConfigured && (
                  <button
                    type="button"
                    onClick={() => onOpenSection('security')}
                    className="h-9 shrink-0 rounded-lg border border-line bg-panel-2/60 px-3 text-[11.5px] text-brand-soft transition hover:border-brand/40"
                  >
                    去设置密码
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => void save()}
              disabled={busy || Boolean(migrationId)}
              className="flex items-center gap-1.5 rounded-lg border border-brand/50 bg-brand/15 px-3 py-1.5 text-[11.5px] font-medium text-brand-soft transition hover:bg-brand/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy && <Loader2 className="size-3.5 animate-spin" />}
              {needsMigration ? '开始迁移' : '保存根路径'}
            </button>
          </div>

          {migration && (
            <div className="mt-4 rounded-xl border border-line/80 bg-panel-2/40 px-3 py-3">
              <div className="flex items-center justify-between gap-2 text-[11.5px]">
                <span className="text-ink-dim">
                  迁移：{PHASE_LABELS[migration.state] ?? migration.state}
                </span>
                <span className="text-ink-faint">
                  {migration.current}/{migration.total}
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-raised">
                <div
                  className="h-full rounded-full bg-brand transition-[width] duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              {migration.currentLibraryName && (
                <div className="mt-2 truncate text-[11px] text-ink-faint">
                  当前：{migration.currentLibraryName}
                </div>
              )}
              {migration.error && (
                <div className="mt-2 text-[11px] leading-relaxed text-rose-200">
                  {migration.error}
                </div>
              )}
              {migration.warnings.length > 0 && (
                <div className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-amber-200">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  <span>{migration.warnings.join('；')}</span>
                </div>
              )}
            </div>
          )}

          {notice && (
            <div
              className={cn(
                'mt-3 rounded-lg border px-3 py-2 text-[11.5px]',
                notice.kind === 'ok'
                  ? 'border-emerald-400/25 bg-emerald-400/5 text-emerald-200'
                  : 'border-rose-400/25 bg-rose-400/5 text-rose-200',
              )}
            >
              {notice.text}
            </div>
          )}
        </>
      )}

      <DirectoryPicker
        open={pickerOpen}
        title="选择媒体根路径"
        initialPath={rootDraft}
        onClose={() => setPickerOpen(false)}
        onSelect={(selected) => {
          setRootDraft(selected)
          setCreateMissing(false)
        }}
      />
    </section>
  )
}
