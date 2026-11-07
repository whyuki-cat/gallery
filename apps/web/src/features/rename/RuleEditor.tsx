import { useRef } from 'react'
import type { RenameOp, RenameOpType } from '@gallery/core'
import { GripVertical, Plus, Trash2 } from 'lucide-react'

import { cn } from '@/lib/cn'

const RULE_TYPES: Array<{ type: RenameOpType; label: string }> = [
  { type: 'replace', label: '文本替换' },
  { type: 'remove', label: '删除片段' },
  { type: 'affix', label: '前后缀' },
  { type: 'case', label: '大小写' },
  { type: 'sequence', label: '序列编号' },
  { type: 'template', label: '模板' },
  { type: 'extension', label: '扩展名' },
]

const INPUT_CLASS =
  'h-8 w-full rounded-md border border-line bg-panel/80 px-2 text-[12px] text-ink outline-none transition placeholder:text-ink-faint/70 focus:border-brand/60'

const SELECT_CLASS =
  'h-8 rounded-md border border-line bg-panel/80 px-2 text-[12px] text-ink-dim outline-none transition focus:border-brand/60'

export function createOp(type: RenameOpType): RenameOp {
  const id = crypto.randomUUID()

  switch (type) {
    case 'replace':
      return { id, type, find: '', with: '', regex: false, caseSensitive: false }
    case 'remove':
      return { id, type, find: '', regex: false, caseSensitive: false }
    case 'affix':
      return { id, type, side: 'prefix', text: '' }
    case 'case':
      return { id, type, mode: 'title' }
    case 'sequence':
      return { id, type, start: 1, step: 1, pad: 2, side: 'suffix', separator: '_' }
    case 'template':
      return { id, type, pattern: '{name}' }
    case 'extension':
      return { id, type, mode: 'keep' }
  }
}

interface RuleEditorProps {
  operations: RenameOp[]
  onChange: (operations: RenameOp[]) => void
}

export function RuleEditor({ operations, onChange }: RuleEditorProps) {
  const dragIndex = useRef<number | null>(null)

  const add = (type: RenameOpType) => onChange([...operations, createOp(type)])
  const replace = (next: RenameOp) =>
    onChange(operations.map((operation) => (operation.id === next.id ? next : operation)))
  const remove = (id: string) => onChange(operations.filter((operation) => operation.id !== id))
  const toggle = (id: string) =>
    onChange(
      operations.map((operation) =>
        operation.id === id ? { ...operation, enabled: operation.enabled === false } : operation,
      ),
    )
  const reorder = (from: number, to: number) => {
    const next = [...operations]
    const [moved] = next.splice(from, 1)
    if (!moved) return
    next.splice(to, 0, moved)
    onChange(next)
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {RULE_TYPES.map((rule) => (
          <button
            key={rule.type}
            type="button"
            onClick={() => add(rule.type)}
            className="flex items-center gap-1 rounded-md border border-line bg-panel-2/60 px-2 py-1 text-[11.5px] text-ink-dim transition hover:border-brand/40 hover:text-ink"
          >
            <Plus className="size-3" />
            {rule.label}
          </button>
        ))}
      </div>

      {operations.length === 0 && (
        <div className="rounded-xl border border-dashed border-line-strong px-4 py-6 text-center text-[12px] leading-relaxed text-ink-faint">
          还没有规则。添加一条规则后，右侧会实时显示新名称。
        </div>
      )}

      <div className="space-y-2">
        {operations.map((operation, index) => (
          <div
            key={operation.id}
            draggable
            onDragStart={(event) => {
              dragIndex.current = index
              event.dataTransfer.effectAllowed = 'move'
            }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault()
              const from = dragIndex.current
              if (from !== null && from !== index) reorder(from, index)
              dragIndex.current = null
            }}
            className={cn(
              'rounded-xl border border-line/80 bg-panel-2/40 p-2.5 transition',
              operation.enabled === false && 'opacity-50',
            )}
          >
            <div className="mb-2 flex items-center gap-1.5">
              <GripVertical className="size-3.5 cursor-grab text-ink-faint/70" />
              <span className="text-[10.5px] font-medium uppercase tracking-[0.12em] text-ink-faint">
                {RULE_TYPES.find((rule) => rule.type === operation.type)?.label}
              </span>

              <div className="ml-auto flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => toggle(operation.id)}
                  className={cn(
                    'rounded px-1.5 py-0.5 text-[10.5px] transition',
                    operation.enabled === false
                      ? 'text-ink-faint hover:text-ink-dim'
                      : 'text-brand-soft hover:text-ink',
                  )}
                >
                  {operation.enabled === false ? '已禁用' : '启用中'}
                </button>
                <button
                  type="button"
                  onClick={() => remove(operation.id)}
                  className="grid size-6 place-items-center rounded text-ink-faint transition hover:bg-rose-500/10 hover:text-rose-300"
                  aria-label="删除规则"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            </div>

            <RuleFields operation={operation} onChange={replace} />
          </div>
        ))}
      </div>
    </div>
  )
}

function RuleFields({
  operation,
  onChange,
}: {
  operation: RenameOp
  onChange: (operation: RenameOp) => void
}) {
  switch (operation.type) {
    case 'replace':
      return (
        <div className="space-y-1.5">
          <div className="grid grid-cols-2 gap-1.5">
            <input
              value={operation.find}
              onChange={(event) => onChange({ ...operation, find: event.target.value })}
              placeholder="查找"
              className={INPUT_CLASS}
            />
            <input
              value={operation.with}
              onChange={(event) => onChange({ ...operation, with: event.target.value })}
              placeholder="替换为"
              className={INPUT_CLASS}
            />
          </div>
          <div className="flex gap-3 text-[11px] text-ink-faint">
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={operation.regex === true}
                onChange={(event) => onChange({ ...operation, regex: event.target.checked })}
              />
              正则
            </label>
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={operation.caseSensitive === true}
                onChange={(event) =>
                  onChange({ ...operation, caseSensitive: event.target.checked })
                }
              />
              区分大小写
            </label>
          </div>
        </div>
      )

    case 'remove':
      return (
        <div className="space-y-1.5">
          <input
            value={operation.find}
            onChange={(event) => onChange({ ...operation, find: event.target.value })}
            placeholder="要删除的文本"
            className={INPUT_CLASS}
          />
          <div className="flex gap-3 text-[11px] text-ink-faint">
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={operation.regex === true}
                onChange={(event) => onChange({ ...operation, regex: event.target.checked })}
              />
              正则
            </label>
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={operation.caseSensitive === true}
                onChange={(event) =>
                  onChange({ ...operation, caseSensitive: event.target.checked })
                }
              />
              区分大小写
            </label>
          </div>
        </div>
      )

    case 'affix':
      return (
        <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-1.5">
          <select
            value={operation.side}
            onChange={(event) =>
              onChange({ ...operation, side: event.target.value as 'prefix' | 'suffix' })
            }
            className={SELECT_CLASS}
          >
            <option value="prefix">前缀</option>
            <option value="suffix">后缀</option>
          </select>
          <input
            value={operation.text}
            onChange={(event) => onChange({ ...operation, text: event.target.value })}
            placeholder="附加文本"
            className={INPUT_CLASS}
          />
        </div>
      )

    case 'case':
      return (
        <select
          value={operation.mode}
          onChange={(event) =>
            onChange({ ...operation, mode: event.target.value as 'lower' | 'upper' | 'title' })
          }
          className={SELECT_CLASS}
        >
          <option value="lower">全部小写</option>
          <option value="upper">全部大写</option>
          <option value="title">首字母大写</option>
        </select>
      )

    case 'sequence':
      return (
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-5">
          <NumberField
            label="起始"
            value={operation.start}
            onChange={(start) => onChange({ ...operation, start })}
          />
          <NumberField
            label="步长"
            value={operation.step}
            onChange={(step) => onChange({ ...operation, step })}
          />
          <NumberField
            label="补零"
            value={operation.pad}
            onChange={(pad) => onChange({ ...operation, pad })}
          />
          <select
            value={operation.side}
            onChange={(event) =>
              onChange({ ...operation, side: event.target.value as 'prefix' | 'suffix' })
            }
            className={SELECT_CLASS}
          >
            <option value="prefix">前置</option>
            <option value="suffix">后置</option>
          </select>
          <input
            value={operation.separator ?? ''}
            onChange={(event) => onChange({ ...operation, separator: event.target.value })}
            placeholder="分隔符"
            className={INPUT_CLASS}
          />
        </div>
      )

    case 'template':
      return (
        <div className="space-y-1">
          <input
            value={operation.pattern}
            onChange={(event) => onChange({ ...operation, pattern: event.target.value })}
            placeholder="{index:2}-{name}"
            className={`${INPUT_CLASS} font-mono`}
          />
          <div className="text-[10.5px] leading-relaxed text-ink-faint">
            可用变量：{'{name}'} {'{ext}'} {'{index}'} {'{index:3}'} {'{date}'} {'{parent}'}{' '}
            {'{size}'}
          </div>
        </div>
      )

    case 'extension':
      return (
        <div className="grid grid-cols-[140px_minmax(0,1fr)] gap-1.5">
          <select
            value={operation.mode}
            onChange={(event) =>
              onChange({
                ...operation,
                mode: event.target.value as 'keep' | 'lower' | 'custom',
              })
            }
            className={SELECT_CLASS}
          >
            <option value="keep">保持原扩展名</option>
            <option value="lower">扩展名转小写</option>
            <option value="custom">指定扩展名</option>
          </select>
          <input
            value={operation.value ?? ''}
            onChange={(event) => onChange({ ...operation, value: event.target.value })}
            placeholder="mp4"
            disabled={operation.mode !== 'custom'}
            className={`${INPUT_CLASS} disabled:opacity-40`}
          />
        </div>
      )
  }
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (value: number) => void
}) {
  return (
    <label className="flex items-center gap-1 rounded-md border border-line bg-panel/80 px-1.5">
      <span className="shrink-0 text-[10px] text-ink-faint">{label}</span>
      <input
        type="number"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-8 w-full min-w-0 bg-transparent text-[12px] text-ink outline-none"
      />
    </label>
  )
}
