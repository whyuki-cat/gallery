import { sortSegments } from './segments.js'
import { MIN_TRIM_DURATION, type TrimIssue, type TrimSegment } from './types.js'

export type TrimBoundaryEdge = 'start' | 'end'

export interface TrimBoundaryRef {
  /** 片段在排序后数组中的下标。 */
  index: number
  edge: TrimBoundaryEdge
}

export interface TrimBoundaryHandle {
  time: number
  hasStart: boolean
  hasEnd: boolean
  refs: TrimBoundaryRef[]
}

export interface TrimMarkerResult {
  segments: TrimSegment[]
  issue: TrimIssue | null
}

const TOO_SHORT_ISSUE: TrimIssue = {
  code: 'too-short',
  message: `片段不能短于 ${MIN_TRIM_DURATION} 秒`,
}

const INVALID_RANGE_ISSUE: TrimIssue = {
  code: 'invalid-range',
  message: '终点必须晚于起点',
}

/** 边界时间相差小于该值时视为同一个浮标，起点与终点会一起拖动。 */
const BOUNDARY_EPSILON = 1e-4

function clampTime(value: number, duration: number): number {
  if (!Number.isFinite(value)) return 0
  if (!Number.isFinite(duration) || duration <= 0) return Math.max(0, value)
  return Math.min(duration, Math.max(0, value))
}

/** 视频加载后的默认片段：0:00 为起点，视频最后为终点。 */
export function initialTrimSegments(duration: number): TrimSegment[] {
  if (!Number.isFinite(duration) || duration <= 0) return []
  return [{ start: 0, end: duration }]
}

/**
 * 在指定位置设置终点：与该位置之前最近的起点组成片段。
 * 若该片段已有终点，新终点会替换旧终点（向后移动时即合并原来的终点）。
 * 若位置之前没有任何起点，则以默认起点 0:00 创建片段。
 */
export function setTrimEndAt(
  segments: TrimSegment[],
  time: number,
  duration: number,
): TrimMarkerResult {
  const targetTime = clampTime(time, duration)
  const sorted = sortSegments(segments)

  let targetIndex = -1
  for (const [index, segment] of sorted.entries()) {
    if (segment.start >= targetTime) continue
    const target = targetIndex === -1 ? null : sorted[targetIndex]
    if (!target || segment.start > target.start) targetIndex = index
  }

  if (targetIndex === -1) {
    if (targetTime < MIN_TRIM_DURATION) {
      return { segments: sorted, issue: TOO_SHORT_ISSUE }
    }
    return {
      segments: sortSegments([...sorted, { start: 0, end: targetTime }]),
      issue: null,
    }
  }

  const target = sorted[targetIndex]
  if (!target) return { segments: sorted, issue: null }

  if (targetTime - target.start < MIN_TRIM_DURATION) {
    return {
      segments: sorted,
      issue: targetTime <= target.start ? INVALID_RANGE_ISSUE : TOO_SHORT_ISSUE,
    }
  }

  return {
    segments: sorted.map((segment, index) =>
      index === targetIndex ? { start: segment.start, end: targetTime } : segment,
    ),
    issue: null,
  }
}

/**
 * 在指定位置设置起点：与该位置之后最近的终点组成片段。
 * 若该片段已有起点，新起点会替换旧起点（向前移动时即合并原来的起点）。
 * 若位置之后没有任何终点，则以视频结尾为默认终点创建片段。
 */
export function setTrimStartAt(
  segments: TrimSegment[],
  time: number,
  duration: number,
): TrimMarkerResult {
  const targetTime = clampTime(time, duration)
  const sorted = sortSegments(segments)

  let targetIndex = -1
  for (const [index, segment] of sorted.entries()) {
    if (segment.end <= targetTime) continue
    const target = targetIndex === -1 ? null : sorted[targetIndex]
    if (!target || segment.end < target.end) targetIndex = index
  }

  if (targetIndex === -1) {
    const end = Number.isFinite(duration) ? duration : targetTime
    if (end - targetTime < MIN_TRIM_DURATION) {
      return { segments: sorted, issue: TOO_SHORT_ISSUE }
    }
    return {
      segments: sortSegments([...sorted, { start: targetTime, end }]),
      issue: null,
    }
  }

  const target = sorted[targetIndex]
  if (!target) return { segments: sorted, issue: null }

  if (target.end - targetTime < MIN_TRIM_DURATION) {
    return {
      segments: sorted,
      issue: targetTime >= target.end ? INVALID_RANGE_ISSUE : TOO_SHORT_ISSUE,
    }
  }

  return {
    segments: sorted.map((segment, index) =>
      index === targetIndex ? { start: targetTime, end: segment.end } : segment,
    ),
    issue: null,
  }
}

/**
 * 把同一个浮标上的起点和终点聚合成一组，按时间排序。
 * 时间相差很小的边界会合并，保证拖动时相邻片段不会互相穿透。
 */
export function groupTrimBoundaries(
  segments: TrimSegment[],
  epsilon = BOUNDARY_EPSILON,
): TrimBoundaryHandle[] {
  const points = segments.flatMap<TrimBoundaryRef & { time: number }>((segment, index) => [
    { index, edge: 'start', time: segment.start },
    { index, edge: 'end', time: segment.end },
  ])

  points.sort((left, right) => left.time - right.time)

  const handles: TrimBoundaryHandle[] = []

  for (const point of points) {
    const last = handles[handles.length - 1]
    if (last && Math.abs(point.time - last.time) <= epsilon) {
      last.refs.push({ index: point.index, edge: point.edge })
      last.hasStart = last.hasStart || point.edge === 'start'
      last.hasEnd = last.hasEnd || point.edge === 'end'
      continue
    }

    handles.push({
      time: point.time,
      hasStart: point.edge === 'start',
      hasEnd: point.edge === 'end',
      refs: [{ index: point.index, edge: point.edge }],
    })
  }

  return handles
}

/** 拖动浮标时的边界约束：不能越过相邻片段，也不能让任一片段短于最小时长。 */
function moveBounds(
  segments: TrimSegment[],
  refs: TrimBoundaryRef[],
  duration: number,
): { lower: number; upper: number } | null {
  const endRef = refs.find((ref) => ref.edge === 'end')
  const startRef = refs.find((ref) => ref.edge === 'start')

  let lower = 0
  let upper = Number.isFinite(duration) && duration > 0 ? duration : Number.POSITIVE_INFINITY

  if (startRef) {
    const segment = segments[startRef.index]
    if (!segment) return null
    upper = Math.min(upper, segment.end - MIN_TRIM_DURATION)

    const previous = segments[startRef.index - 1]
    if (previous && !(endRef && endRef.index === startRef.index - 1)) {
      lower = Math.max(lower, previous.end)
    }
  }

  if (endRef) {
    const segment = segments[endRef.index]
    if (!segment) return null
    lower = Math.max(lower, segment.start + MIN_TRIM_DURATION)

    const next = segments[endRef.index + 1]
    if (next && !(startRef && startRef.index === endRef.index + 1)) {
      upper = Math.min(upper, next.start)
    }
  }

  return lower <= upper ? { lower, upper } : null
}

/**
 * 计算某个浮标能落到的实际时间：受视频范围、相邻片段和最小时长限制。
 * 拖动或键盘微调时先调用它，能让播放头与浮标保持一致。
 */
export function clampTrimBoundaryTime(
  segments: TrimSegment[],
  refs: TrimBoundaryRef[],
  time: number,
  duration: number,
): number {
  const fallback = clampTime(time, duration)
  const bounds = moveBounds(segments, refs, duration)
  if (!bounds) return fallback
  return Math.min(bounds.upper, Math.max(bounds.lower, fallback))
}

/**
 * 把一组边界（同一浮标上的起点/终点）拖到新位置，返回排序后的新数组。
 * 位置会被限制在相邻片段之间，保证片段不重叠且不短于最小时长。
 */
export function moveTrimBoundary(
  segments: TrimSegment[],
  refs: TrimBoundaryRef[],
  time: number,
  duration: number,
): TrimSegment[] {
  if (refs.length === 0) return segments

  const bounds = moveBounds(segments, refs, duration)
  if (!bounds) return segments

  const targetTime = Math.min(bounds.upper, Math.max(bounds.lower, clampTime(time, duration)))

  return sortSegments(
    segments.map((segment, index) => {
      const movesStart = refs.some((ref) => ref.index === index && ref.edge === 'start')
      const movesEnd = refs.some((ref) => ref.index === index && ref.edge === 'end')
      if (!movesStart && !movesEnd) return segment

      return {
        start: movesStart ? targetTime : segment.start,
        end: movesEnd ? targetTime : segment.end,
      }
    }),
  )
}
