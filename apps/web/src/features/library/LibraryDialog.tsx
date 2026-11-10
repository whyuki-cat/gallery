import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  FolderOpen,
  FolderPlus,
  Layers,
  Loader2,
  Plus,
  Trash2,
  X,
} from 'lucide-react'

import { api, ApiError } from '@/lib/api'
import { cn } from '@/lib/cn'
import { DirectoryPicker } from '@/features/library/DirectoryPicker'
import {
  ORGANIZATION_LABELS,
  TYPE_LABELS,
  type LibraryOrganization,
  type LibraryType,
  type LibraryView,
} from '@/features/library/types'

interface LibraryDialogProps {
  open: boolean
  library: LibraryView | null
  onClose: () => void
  onSaved: (library: LibraryView) => void
}

export function LibraryDialog({ open, library, onClose, onSaved }: LibraryDialogProps) {
  const isEdit = Boolean(library)
  const [name, setName] = useState('')
  const [organization, setOrganization] = useState<LibraryOrganization>('collection')
  const [type, setType] = useState<LibraryType | ''>('')
  const [sources, setSources] = useState<string[]>([''])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pickerIndex, setPickerIndex] = useState<number | null>(null)

  useEffect(() => {
    if (!open) return
    setName(library?.name ?? '')
    setOrganization(library?.organization ?? 'collection')
    setType(library?.type ?? '')
    setSources(
      library?.organization === 'convention' && library.sources.length > 0
        ? [...library.sources]
        : [''],
    )
    setBusy(false)
    setError(null)
    setPickerIndex(null)
  }, [open, library])

  useEffect(() => {
    if (!open) return
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  function updateSource(index: number, value: string): void {
    setSources((current) => current.map((item, itemIndex) => (itemIndex === index ? value : item)))
  }

  async function submit(): Promise<void> {
    setError(null)
    const trimmedName = name.trim()
    if (!trimmedName) {
      setError('请输入媒体库名称')
      return
    }

    const cleanedSources = sources.map((item) => item.trim()).filter(Boolean)
    if (organization === 'convention' && cleanedSources.length === 0) {
      setError('请至少配置一个来源目录')
      return
    }

    setBusy(true)
    try {
      const saved =
        isEdit && library
          ? await api.updateLibrary(library.id, {
              name: trimmedName,
              type: type || null,
              sources: organization === 'convention' ? cleanedSources : undefined,
            })
          : await api.createLibrary({
              name: trimmedName,
              organization,
              type: type || null,
              sources: organization === 'convention' ? cleanedSources : undefined,
            })
      onSaved(saved)
      onClose()
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : '保存媒体库失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-4 backdrop-blur-sm"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="library-dialog-title"
        className="animate-rise flex max-h-[86vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-line-strong bg-panel shadow-[0_40px_120px_-40px_rgba(0,0,0,0.9)]"
      >
        <header className="flex shrink-0 items-center gap-3 border-b border-line/70 px-5 py-4">
          <span className="grid size-9 place-items-center rounded-xl border border-line bg-panel-2 text-brand-soft">
            <FolderPlus className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="library-dialog-title" className="text-[14px] font-semibold text-ink">
              {isEdit ? '编辑媒体库' : '新建媒体库'}
            </h2>
            <p className="mt-0.5 text-[11.5px] text-ink-faint">
              {isEdit ? '修改名称、类型或文件规范来源。' : '选择组织形式并登记媒体来源。'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭媒体库对话框"
            className="grid size-8 place-items-center rounded-lg text-ink-faint transition hover:bg-hover-strong hover:text-ink"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <label className="block">
            <span className="text-[11.5px] font-medium text-ink-dim">名称</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="例如：宫崎骏作品集"
              className="mt-1.5 h-9 w-full rounded-lg border border-line bg-panel-2/60 px-3 text-[12.5px] text-ink outline-none transition placeholder:text-ink-faint focus:border-brand/60"
            />
          </label>

          <div>
            <span className="text-[11.5px] font-medium text-ink-dim">组织形式</span>
            {isEdit ? (
              <div className="mt-1.5 flex items-center gap-2 rounded-lg border border-line bg-panel-2/40 px-3 py-2 text-[12px] text-ink-dim">
                <Layers className="size-4 text-ink-faint" />
                {ORGANIZATION_LABELS[organization]}（创建后不可修改）
              </div>
            ) : (
              <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
                <OrganizationOption
                  active={organization === 'collection'}
                  title="作品集"
                  description="一个媒体库对应媒体根路径下由系统托管的目录。"
                  onClick={() => setOrganization('collection')}
                />
                <OrganizationOption
                  active={organization === 'convention'}
                  title="文件规范"
                  description="配置多个来源目录，兼容 Jellyfin 命名与组织。"
                  onClick={() => setOrganization('convention')}
                />
              </div>
            )}
          </div>

          <label className="block">
            <span className="text-[11.5px] font-medium text-ink-dim">类型（可选）</span>
            <select
              value={type}
              onChange={(event) => setType(event.target.value as LibraryType | '')}
              className="mt-1.5 h-9 w-full rounded-lg border border-line bg-panel-2/60 px-3 text-[12.5px] text-ink outline-none transition focus:border-brand/60"
            >
              <option value="">不指定</option>
              <option value="movie">{TYPE_LABELS.movie}</option>
              <option value="series">{TYPE_LABELS.series}</option>
              <option value="photo">{TYPE_LABELS.photo}</option>
            </select>
          </label>

          {organization === 'collection' ? (
            <div className="rounded-xl border border-line/80 bg-panel-2/40 px-3 py-2.5 text-[11.5px] leading-relaxed text-ink-faint">
              系统会自动创建并管理存储目录。重命名媒体库只会修改显示名称，不会移动文件；底层目录不会显示在界面中。
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11.5px] font-medium text-ink-dim">来源目录</span>
                <button
                  type="button"
                  onClick={() => setSources((current) => [...current, ''])}
                  className="flex items-center gap-1 rounded-md border border-line bg-panel-2/60 px-2 py-1 text-[11px] text-ink-dim transition hover:border-line-strong hover:text-ink"
                >
                  <Plus className="size-3" />
                  添加来源
                </button>
              </div>

              <div className="mt-2 space-y-2">
                {sources.map((source, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <input
                      value={source}
                      onChange={(event) => updateSource(index, event.target.value)}
                      placeholder="绝对路径"
                      spellCheck={false}
                      className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-panel-2/60 px-3 font-mono text-[11.5px] text-ink outline-none transition placeholder:text-ink-faint focus:border-brand/60"
                    />
                    <button
                      type="button"
                      onClick={() => setPickerIndex(index)}
                      aria-label="浏览来源目录"
                      title="浏览"
                      className="grid size-9 shrink-0 place-items-center rounded-lg border border-line bg-panel-2/60 text-ink-dim transition hover:border-line-strong hover:text-ink"
                    >
                      <FolderOpen className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setSources((current) =>
                          current.length <= 1
                            ? current
                            : current.filter((_, itemIndex) => itemIndex !== index),
                        )
                      }
                      disabled={sources.length <= 1}
                      aria-label="移除来源目录"
                      title="移除"
                      className="grid size-9 shrink-0 place-items-center rounded-lg border border-line bg-panel-2/60 text-ink-dim transition hover:border-rose-400/30 hover:text-rose-200 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-1.5 rounded-lg border border-rose-400/25 bg-rose-400/5 px-3 py-2 text-[11.5px] leading-relaxed text-rose-200">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <footer className="flex shrink-0 items-center gap-2 border-t border-line/70 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-line bg-panel-2/60 px-3 py-1.5 text-[11.5px] text-ink-dim transition hover:border-line-strong hover:text-ink"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy}
            className="ml-auto flex items-center gap-1.5 rounded-lg border border-brand/50 bg-brand/15 px-3 py-1.5 text-[11.5px] font-medium text-brand-soft transition hover:bg-brand/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy && <Loader2 className="size-3.5 animate-spin" />}
            {isEdit ? '保存修改' : '创建媒体库'}
          </button>
        </footer>
      </div>

      <DirectoryPicker
        open={pickerIndex !== null}
        title="选择来源目录"
        initialPath={pickerIndex !== null ? sources[pickerIndex] : undefined}
        onClose={() => setPickerIndex(null)}
        onSelect={(path) => {
          if (pickerIndex !== null) updateSource(pickerIndex, path)
        }}
      />
    </div>
  )
}

function OrganizationOption({
  active,
  title,
  description,
  onClick,
}: {
  active: boolean
  title: string
  description: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-xl border p-3 text-left transition',
        active
          ? 'border-brand/60 bg-brand/[0.10] shadow-[0_0_0_1px_rgba(139,92,246,0.22)]'
          : 'border-line bg-panel-2/50 hover:border-line-strong hover:bg-hover',
      )}
    >
      <span className="text-[12px] font-medium text-ink">{title}</span>
      <span className="mt-1 block text-[10.5px] leading-relaxed text-ink-faint">
        {description}
      </span>
    </button>
  )
}
