import { AlertTriangle, FolderOpen, HardDrive, Loader2, MapPin, SearchX } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '@/lib/cn'
import type { RootsResponse } from '@/features/rename/types'

export function LoadingView() {
  return (
    <div className="flex flex-1 items-center justify-center gap-2 text-[12.5px] text-ink-faint">
      <Loader2 className="size-4 animate-spin" />
      正在读取目录…
    </div>
  )
}

export function EmptyView({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
      <SearchX className="size-8 text-ink-faint/70" strokeWidth={1.4} />
      <div className="text-[13px] font-medium text-ink-dim">{title}</div>
      <div className="max-w-xs text-[12px] leading-relaxed text-ink-faint">{description}</div>
    </div>
  )
}

export function ErrorView({
  message,
  onRetry,
}: {
  message: string
  onRetry: () => void
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
      <AlertTriangle className="size-8 text-rose-300/80" strokeWidth={1.4} />
      <div className="max-w-sm text-[12.5px] leading-relaxed text-ink-dim">{message}</div>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-lg border border-line bg-panel-2/70 px-3 py-1.5 text-[12px] text-ink-dim transition hover:border-line-strong hover:text-ink"
      >
        重试
      </button>
    </div>
  )
}

export function WelcomeView({
  roots,
  onNavigate,
  error,
}: {
  roots: RootsResponse | null
  onNavigate: (path: string) => void
  error: string | null
}) {
  if (error) {
    return <ErrorView message={error} onRetry={() => window.location.reload()} />
  }

  if (!roots) {
    return <LoadingView />
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-2 py-8">
      <div className="mb-6">
        <h2 className="text-[16px] font-semibold text-ink">选择一个目录开始</h2>
        <p className="mt-1 text-[12.5px] text-ink-dim">
          浏览本地文件夹，选中文件或文件夹后可以按规则批量重命名。
        </p>
      </div>

      <Section title="磁盘">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {roots.roots.map((location) => (
            <LocationCard
              key={location.path}
              icon={<HardDrive className="size-4" />}
              name={location.name}
              hint={location.path}
              onClick={() => onNavigate(location.path)}
            />
          ))}
        </div>
      </Section>

      {roots.common.length > 0 && (
        <Section title="常用位置">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {roots.common.map((location) => (
              <LocationCard
                key={location.path}
                icon={<FolderOpen className="size-4" />}
                name={location.name}
                hint={location.path}
                onClick={() => onNavigate(location.path)}
              />
            ))}
          </div>
        </Section>
      )}

      <div className="mt-6 flex items-start gap-2 rounded-xl border border-line/80 bg-panel-2/40 px-3 py-2.5 text-[11.5px] leading-relaxed text-ink-faint">
        <MapPin className="mt-0.5 size-3.5 shrink-0" />
        也可以在上方路径栏直接粘贴绝对路径。服务只在本机回环地址上监听。
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mb-5">
      <div className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
        {title}
      </div>
      {children}
    </div>
  )
}

function LocationCard({
  icon,
  name,
  hint,
  onClick,
}: {
  icon: ReactNode
  name: string
  hint: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-2.5 rounded-xl border border-line/80 bg-panel-2/40 px-3 py-2.5 text-left transition',
        'hover:border-brand/40 hover:bg-panel-2/80',
      )}
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-raised text-ink-dim">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[12.5px] text-ink">{name}</span>
        <span className="block truncate font-mono text-[10.5px] text-ink-faint">{hint}</span>
      </span>
    </button>
  )
}
