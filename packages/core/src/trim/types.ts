/** 视频裁剪片段、校验与输出命名的公共类型。 */

export interface TrimSegment {
  start: number
  end: number
}

export type TrimExportKind = 'separate' | 'merged'

export type TrimIssueCode =
  | 'empty'
  | 'too-many'
  | 'invalid-segment'
  | 'not-finite'
  | 'negative-start'
  | 'invalid-range'
  | 'too-short'

export interface TrimIssue {
  code: TrimIssueCode
  message: string
  /** 出问题的片段在输入数组中的下标。整体性问题（如为空或过多）不设置。 */
  index?: number
}

export interface TrimOutputPlanInput {
  fileName: string
  kind: TrimExportKind
  segments: TrimSegment[]
  existingNames: Iterable<string>
}

export interface TrimOutputPlan {
  /** 与按起点排序后的片段一一对应；合并导出时只有一个名称。 */
  names: string[]
}

export const MAX_TRIM_SEGMENTS = 100
export const MIN_TRIM_DURATION = 0.1
