import {
  MAX_TRIM_SEGMENTS,
  MIN_TRIM_DURATION,
  type TrimIssue,
  type TrimSegment,
} from './types.js'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * 校验用户提交的片段数组。接受 unknown，避免把 JSON 输入直接当成可信类型。
 * 时间必须是有限数字，且满足 0 <= start < end；单段不短于 MIN_TRIM_DURATION。
 */
export function validateSegments(input: unknown): TrimIssue[] {
  if (!Array.isArray(input)) {
    return [{ code: 'empty', message: '请至少添加一个片段' }]
  }

  if (input.length === 0) {
    return [{ code: 'empty', message: '请至少添加一个片段' }]
  }

  if (input.length > MAX_TRIM_SEGMENTS) {
    return [
      {
        code: 'too-many',
        message: `单次最多导出 ${MAX_TRIM_SEGMENTS} 个片段`,
      },
    ]
  }

  const issues: TrimIssue[] = []

  input.forEach((value, index) => {
    if (!isRecord(value)) {
      issues.push({
        code: 'invalid-segment',
        message: `第 ${index + 1} 个片段格式无效`,
        index,
      })
      return
    }

    const { start, end } = value

    if (typeof start !== 'number' || !Number.isFinite(start)) {
      issues.push({
        code: 'not-finite',
        message: `第 ${index + 1} 个片段的起点不是有效数字`,
        index,
      })
    } else if (start < 0) {
      issues.push({
        code: 'negative-start',
        message: `第 ${index + 1} 个片段的起点不能小于 0`,
        index,
      })
    }

    if (typeof end !== 'number' || !Number.isFinite(end)) {
      issues.push({
        code: 'not-finite',
        message: `第 ${index + 1} 个片段的终点不是有效数字`,
        index,
      })
    }

    if (
      typeof start === 'number' &&
      Number.isFinite(start) &&
      typeof end === 'number' &&
      Number.isFinite(end) &&
      start >= end
    ) {
      issues.push({
        code: 'invalid-range',
        message: `第 ${index + 1} 个片段的终点必须晚于起点`,
        index,
      })
      return
    }

    if (
      typeof start === 'number' &&
      Number.isFinite(start) &&
      typeof end === 'number' &&
      Number.isFinite(end) &&
      start >= 0 &&
      end > start &&
      end - start < MIN_TRIM_DURATION
    ) {
      issues.push({
        code: 'too-short',
        message: `第 ${index + 1} 个片段短于 ${MIN_TRIM_DURATION} 秒`,
        index,
      })
    }
  })

  return issues
}

/** 按起点、终点升序返回新数组，不修改输入。 */
export function sortSegments(segments: TrimSegment[]): TrimSegment[] {
  return [...segments].sort((left, right) => left.start - right.start || left.end - right.end)
}
