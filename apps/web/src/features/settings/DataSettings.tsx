import { Database } from 'lucide-react'

export function DataSettings({ databasePath }: { databasePath: string | null }) {
  return (
    <section className="px-5 py-4">
      <h2 className="text-[12.5px] font-medium text-ink">数据存储</h2>
      <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-faint">
        媒体根路径、媒体库、删除密码与迁移任务都保存在本机 SQLite 数据库中，不写入项目仓库。
      </p>

      <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-line/80 bg-panel-2/40 px-3 py-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-raised text-ink-dim">
          <Database className="size-4" />
        </span>
        <div className="min-w-0">
          <div className="text-[11px] text-ink-faint">数据库位置</div>
          <div className="mt-0.5 break-all font-mono text-[11.5px] text-ink-dim">
            {databasePath ?? '数据库尚未初始化'}
          </div>
        </div>
      </div>
    </section>
  )
}
