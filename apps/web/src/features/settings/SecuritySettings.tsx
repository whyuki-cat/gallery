import { useEffect, useState } from 'react'
import { Loader2, ShieldCheck } from 'lucide-react'

import { api, ApiError } from '@/lib/api'
import { cn } from '@/lib/cn'
import { notifyLibraryChanged } from '@/features/library/types'

interface Notice {
  kind: 'ok' | 'error'
  text: string
}

export function SecuritySettings() {
  const [configured, setConfigured] = useState(false)
  const [loading, setLoading] = useState(true)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)

  useEffect(() => {
    api
      .libraryOverview()
      .then((overview) => setConfigured(overview.deletePasswordConfigured))
      .catch((reason: unknown) => {
        setNotice({
          kind: 'error',
          text: reason instanceof ApiError ? reason.message : '无法读取安全设置',
        })
      })
      .finally(() => setLoading(false))
  }, [])

  async function save(): Promise<void> {
    setNotice(null)
    if (newPassword !== confirmPassword) {
      setNotice({ kind: 'error', text: '两次输入的新密码不一致' })
      return
    }

    setBusy(true)
    try {
      await api.setDeletePassword({
        currentPassword: configured ? currentPassword : undefined,
        newPassword,
      })
      setConfigured(true)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setNotice({ kind: 'ok', text: configured ? '删除保护密码已更新' : '删除保护密码已设置' })
      notifyLibraryChanged()
    } catch (reason) {
      setNotice({
        kind: 'error',
        text: reason instanceof ApiError ? reason.message : '保存删除保护密码失败',
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="px-5 py-4">
      <div className="flex items-center gap-2">
        <h2 className="text-[12.5px] font-medium text-ink">删除保护密码</h2>
        <span
          className={cn(
            'rounded-md border px-1.5 py-0.5 text-[10.5px]',
            configured
              ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200'
              : 'border-line bg-panel-2/60 text-ink-faint',
          )}
        >
          {configured ? '已设置' : '未设置'}
        </span>
      </div>
      <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-faint">
        删除作品集媒体库与迁移媒体根路径时需要此密码。文件规范媒体库只解除登记，不需要密码。
      </p>

      {loading ? (
        <div className="mt-4 flex items-center gap-2 text-[12px] text-ink-faint">
          <Loader2 className="size-4 animate-spin" />
          读取设置…
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          {configured && (
            <input
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              placeholder="当前密码"
              autoComplete="current-password"
              className="h-9 w-full rounded-lg border border-line bg-panel-2/60 px-3 text-[12px] text-ink outline-none transition placeholder:text-ink-faint focus:border-brand/60"
            />
          )}
          <input
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            placeholder={configured ? '新密码' : '设置密码'}
            autoComplete="new-password"
            className="h-9 w-full rounded-lg border border-line bg-panel-2/60 px-3 text-[12px] text-ink outline-none transition placeholder:text-ink-faint focus:border-brand/60"
          />
          <input
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            placeholder="再次输入新密码"
            autoComplete="new-password"
            className="h-9 w-full rounded-lg border border-line bg-panel-2/60 px-3 text-[12px] text-ink outline-none transition placeholder:text-ink-faint focus:border-brand/60"
          />
          <p className="text-[11px] text-ink-faint">密码长度 8–128 个字符，忘记后需手工重置数据库。</p>

          <button
            type="button"
            onClick={() => void save()}
            disabled={busy}
            className="mt-1 flex items-center gap-1.5 rounded-lg border border-brand/50 bg-brand/15 px-3 py-1.5 text-[11.5px] font-medium text-brand-soft transition hover:bg-brand/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <ShieldCheck className="size-3.5" />}
            {configured ? '更新密码' : '设置密码'}
          </button>

          {notice && (
            <div
              className={cn(
                'rounded-lg border px-3 py-2 text-[11.5px]',
                notice.kind === 'ok'
                  ? 'border-emerald-400/25 bg-emerald-400/5 text-emerald-200'
                  : 'border-rose-400/25 bg-rose-400/5 text-rose-200',
              )}
            >
              {notice.text}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
