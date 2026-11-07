/** 重命名规则、校验与计划相关的公共类型。 */

export interface RenameOpBase {
  id: string
  /** 缺省视为启用。 */
  enabled?: boolean
}

export interface ReplaceOp extends RenameOpBase {
  type: 'replace'
  find: string
  with: string
  regex?: boolean
  caseSensitive?: boolean
}

export interface RemoveOp extends RenameOpBase {
  type: 'remove'
  find: string
  regex?: boolean
  caseSensitive?: boolean
}

export interface AffixOp extends RenameOpBase {
  type: 'affix'
  side: 'prefix' | 'suffix'
  text: string
}

export interface CaseOp extends RenameOpBase {
  type: 'case'
  mode: 'lower' | 'upper' | 'title'
}

export interface SequenceOp extends RenameOpBase {
  type: 'sequence'
  start: number
  step: number
  pad: number
  side: 'prefix' | 'suffix'
  separator?: string
}

export interface TemplateOp extends RenameOpBase {
  type: 'template'
  pattern: string
}

export interface ExtensionOp extends RenameOpBase {
  type: 'extension'
  mode: 'keep' | 'lower' | 'custom'
  value?: string
}

export type RenameOp =
  | ReplaceOp
  | RemoveOp
  | AffixOp
  | CaseOp
  | SequenceOp
  | TemplateOp
  | ExtensionOp

export type RenameOpType = RenameOp['type']

export interface RenameContext {
  parentName?: string
  size?: number
  date?: Date | string | number
}

export type RenameIssueCode =
  | 'empty'
  | 'invalid-char'
  | 'reserved-name'
  | 'trailing-dot-or-space'
  | 'too-long'
  | 'duplicate-target'
  | 'target-exists'
  | 'unknown-variable'
  | 'invalid-regex'

export interface RenameIssue {
  code: RenameIssueCode
  message: string
  detail?: string
}

export interface ApplyResult {
  name: string
  issues: RenameIssue[]
}

export interface TargetEntry {
  source: string
  target: string
}

export type ConflictStrategy = 'block' | 'skip' | 'auto-index'

export interface PlannedRename {
  source: string
  target: string
  issues: RenameIssue[]
  skipped: boolean
}
