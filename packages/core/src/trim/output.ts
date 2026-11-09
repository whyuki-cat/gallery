import { sortSegments } from './segments.js'
import type { TrimOutputPlan, TrimOutputPlanInput } from './types.js'

function pad(value: number, length: number): string {
  return String(value).padStart(length, '0')
}

interface TimeParts {
  hours: number
  minutes: number
  seconds: number
  milliseconds: number
}

function splitTime(value: number): TimeParts {
  const totalMilliseconds = Math.round(value * 1000)
  const milliseconds = totalMilliseconds % 1000
  const totalSeconds = Math.floor(totalMilliseconds / 1000)

  return {
    hours: Math.floor(totalSeconds / 3600),
    minutes: Math.floor(totalSeconds / 60) % 60,
    seconds: totalSeconds % 60,
    milliseconds,
  }
}

/** 界面展示用时间：一小时以内为 `mm:ss.SSS`，超过一小时后为 `hh:mm:ss.SSS`。 */
export function formatTimecode(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '--:--.---'

  const time = splitTime(seconds)
  const clock = `${pad(time.minutes, 2)}:${pad(time.seconds, 2)}.${pad(
    time.milliseconds,
    3,
  )}`

  return time.hours > 0 ? `${pad(time.hours, 2)}:${clock}` : clock
}

/** 文件名时间：固定 `HH.MM.SS.mmm`，补零且不含 Windows 非法字符。 */
export function formatFileTime(seconds: number): string {
  const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0
  const time = splitTime(safe)

  return `${pad(time.hours, 2)}.${pad(time.minutes, 2)}.${pad(
    time.seconds,
    2,
  )}.${pad(time.milliseconds, 3)}`
}

function splitFileName(fileName: string): { stem: string; extension: string } {
  const dot = fileName.lastIndexOf('.')
  if (dot <= 0) return { stem: fileName || 'video', extension: '' }
  return { stem: fileName.slice(0, dot), extension: fileName.slice(dot + 1) }
}

function joinName(stem: string, extension: string): string {
  return extension ? `${stem}.${extension}` : stem
}

/**
 * 生成逐段或合并导出的输出名称。逐段名称包含片段起止时间并按起点排序；
 * 批次内重复或目录中已有同名文件时追加 `(1)`、`(2)`，比较不区分大小写。
 */
export function planTrimOutputs(input: TrimOutputPlanInput): TrimOutputPlan {
  const { stem, extension } = splitFileName(input.fileName)
  const used = new Set<string>()
  for (const name of input.existingNames) used.add(name.toLowerCase())

  const take = (base: string): string => {
    let candidate = joinName(base, extension)
    let suffix = 1

    while (used.has(candidate.toLowerCase())) {
      candidate = joinName(`${base} (${suffix})`, extension)
      suffix += 1
    }

    used.add(candidate.toLowerCase())
    return candidate
  }

  if (input.kind === 'merged') {
    return { names: [take(`${stem}.trimmed`)] }
  }

  return {
    names: sortSegments(input.segments).map((segment) =>
      take(`${stem}-${formatFileTime(segment.start)}-${formatFileTime(segment.end)}`),
    ),
  }
}
