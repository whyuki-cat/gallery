import { useMemo, useRef } from 'react'
import type { KeyboardEvent, PointerEvent } from 'react'
import {
  clampTrimBoundaryTime,
  formatTimecode,
  groupTrimBoundaries,
  type TrimBoundaryHandle,
  type TrimBoundaryRef,
  type TrimSegment,
} from '@gallery/core'

import { cn } from '@/lib/cn'

interface TrimTimelineProps {
  duration: number
  currentTime: number
  segments: TrimSegment[]
  disabled?: boolean
  onSeek: (time: number) => void
  onMoveBoundary: (refs: TrimBoundaryRef[], time: number) => void
}

function percent(value: number, duration: number): number {
  if (duration <= 0) return 0
  return Math.min(100, Math.max(0, (value / duration) * 100))
}

function handleKey(handle: TrimBoundaryHandle): string {
  return handle.refs.map((ref) => `${ref.edge}-${ref.index}`).join('|')
}

function handleLabel(handle: TrimBoundaryHandle): string {
  if (handle.hasStart && handle.hasEnd) return '起止'
  return handle.hasStart ? '起点' : '终点'
}

export function TrimTimeline({
  duration,
  currentTime,
  segments,
  disabled = false,
  onSeek,
  onMoveBoundary,
}: TrimTimelineProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const seekDraggingRef = useRef(false)
  const boundaryDragRef = useRef<TrimBoundaryRef[] | null>(null)
  const dragPointerRef = useRef<number | null>(null)

  const ticks = useMemo(
    () => [0, 0.25, 0.5, 0.75, 1].map((ratio) => ({ ratio, time: duration * ratio })),
    [duration],
  )

  const boundaries = useMemo(() => groupTrimBoundaries(segments), [segments])

  const timeAt = (clientX: number): number | null => {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect || rect.width <= 0) return null

    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    return ratio * duration
  }

  const endDrag = (event?: PointerEvent<HTMLDivElement>) => {
    const pointerId = dragPointerRef.current
    const track = trackRef.current
    if (event && pointerId !== null && event.currentTarget.hasPointerCapture(pointerId)) {
      event.currentTarget.releasePointerCapture(pointerId)
    } else if (pointerId !== null && track?.hasPointerCapture(pointerId)) {
      track.releasePointerCapture(pointerId)
    }

    seekDraggingRef.current = false
    boundaryDragRef.current = null
    dragPointerRef.current = null
  }

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (disabled || duration <= 0) return
    const time = timeAt(event.clientX)
    if (time === null) return

    seekDraggingRef.current = true
    boundaryDragRef.current = null
    dragPointerRef.current = event.pointerId
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // 指针捕获失败时仍允许在同一条轨道上继续拖动。
    }
    onSeek(time)
  }

  const handleBoundaryPointerDown = (
    event: PointerEvent<HTMLDivElement>,
    handle: TrimBoundaryHandle,
  ) => {
    if (disabled || duration <= 0) return
    event.stopPropagation()

    boundaryDragRef.current = handle.refs
    seekDraggingRef.current = false
    dragPointerRef.current = event.pointerId
    try {
      trackRef.current?.setPointerCapture(event.pointerId)
    } catch {
      // 指针捕获失败时仍允许继续拖动，只是离开轨道后可能中断。
    }
    onSeek(handle.time)
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!seekDraggingRef.current && !boundaryDragRef.current) return
    if (event.pointerType === 'mouse' && event.buttons === 0) {
      endDrag(event)
      return
    }

    const time = timeAt(event.clientX)
    if (time === null) return

    if (boundaryDragRef.current) {
      const clamped = clampTrimBoundaryTime(segments, boundaryDragRef.current, time, duration)
      onMoveBoundary(boundaryDragRef.current, clamped)
      onSeek(clamped)
    } else {
      onSeek(time)
    }
  }

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (!seekDraggingRef.current && !boundaryDragRef.current) return
    endDrag(event)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (disabled || duration <= 0) return
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return

    event.preventDefault()
    const step = event.shiftKey ? 5 : 1
    onSeek(Math.min(duration, Math.max(0, currentTime + (event.key === 'ArrowLeft' ? -step : step))))
  }

  const handleBoundaryKeyDown = (
    event: KeyboardEvent<HTMLDivElement>,
    handle: TrimBoundaryHandle,
  ) => {
    if (disabled || duration <= 0) return
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return

    event.preventDefault()
    event.stopPropagation()
    const step = event.shiftKey ? 1 : 0.1
    const next = clampTrimBoundaryTime(
      segments,
      handle.refs,
      handle.time + (event.key === 'ArrowLeft' ? -step : step),
      duration,
    )
    onMoveBoundary(handle.refs, next)
    onSeek(next)
  }

  return (
    <div
      ref={trackRef}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label="时间轴，点击或拖动定位播放位置"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration * 1000) / 1000}
      aria-valuenow={Math.round(currentTime * 1000) / 1000}
      aria-disabled={disabled}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onKeyDown={handleKeyDown}
      className={cn(
        'relative h-20 w-full touch-none select-none overflow-hidden rounded-xl border border-line bg-panel-2/70',
        disabled
          ? 'cursor-default opacity-60'
          : 'cursor-pointer transition hover:border-line-strong',
      )}
    >
      <div className="absolute inset-x-0 top-0 h-[52px]">
        {segments.map((segment, index) => {
          const left = percent(segment.start, duration)
          const width = Math.max(0.35, percent(segment.end - segment.start, duration))

          return (
            <div
              key={`${segment.start}-${segment.end}-${index}`}
              title={`${formatTimecode(segment.start)} - ${formatTimecode(segment.end)}`}
              className="absolute inset-y-1.5 min-w-0 rounded-md border border-brand/45 bg-brand/25"
              style={{ left: `${left}%`, width: `${width}%` }}
            />
          )
        })}

        {boundaries.map((handle) => {
          const left = percent(handle.time, duration)
          const both = handle.hasStart && handle.hasEnd
          const knobShift =
            left <= 2
              ? 'left-1/2'
              : left >= 98
                ? 'left-1/2 -translate-x-full'
                : 'left-1/2 -translate-x-1/2'

          return (
            <div
              key={handleKey(handle)}
              role="slider"
              tabIndex={disabled ? -1 : 0}
              aria-label={`${handleLabel(handle)}浮标，位置 ${formatTimecode(
                handle.time,
              )}，左右方向键微调`}
              aria-valuemin={0}
              aria-valuemax={Math.round(duration * 1000) / 1000}
              aria-valuenow={Math.round(handle.time * 1000) / 1000}
              aria-disabled={disabled}
              title={`${handleLabel(handle)} ${formatTimecode(handle.time)}，拖动或按左右方向键调整`}
              onPointerDown={(event) => handleBoundaryPointerDown(event, handle)}
              onKeyDown={(event) => handleBoundaryKeyDown(event, handle)}
              className={cn(
                'group absolute inset-y-0 z-20 w-5 -translate-x-1/2 touch-none select-none',
                disabled ? 'cursor-default' : 'cursor-ew-resize',
              )}
              style={{ left: `${left}%` }}
            >
              <span
                className={cn(
                  'pointer-events-none absolute inset-y-1.5 left-1/2 w-[2px] -translate-x-1/2 rounded-full',
                  both && 'bg-[linear-gradient(180deg,var(--color-amber-300),var(--color-brand-soft))]',
                  !both && handle.hasStart && 'bg-amber-300',
                  !both && handle.hasEnd && 'bg-brand-soft',
                )}
              />

              <span
                className={cn(
                  'pointer-events-none absolute top-0.5 grid h-[15px] min-w-[15px] place-items-center whitespace-nowrap rounded-[4px] border px-1 text-[8px] font-semibold leading-none shadow-[0_2px_6px_rgba(0,0,0,0.45)] transition group-hover:brightness-125',
                  knobShift,
                  both
                    ? 'border-ink/30 bg-panel-3 text-ink'
                    : handle.hasStart
                      ? 'border-amber-300/70 bg-amber-300/30 text-amber-200'
                      : 'border-brand-soft/70 bg-brand/30 text-brand-soft',
                  disabled && 'group-hover:brightness-100',
                )}
              >
                {handleLabel(handle)}
              </span>
            </div>
          )
        })}

        <div
          className="pointer-events-none absolute inset-y-0 z-10 w-px bg-ink/80"
          style={{ left: `${percent(currentTime, duration)}%` }}
        >
          <span className="absolute -left-1 top-0 size-2 rounded-full bg-ink shadow" />
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-7 border-t border-line/60 bg-panel/40">
        {ticks.map((tick) => (
          <span
            key={tick.ratio}
            className={cn(
              'absolute top-1.5 font-mono text-[10px] text-ink-dim',
              tick.ratio === 0
                ? 'left-2'
                : tick.ratio === 1
                  ? 'right-2'
                  : '-translate-x-1/2',
            )}
            style={tick.ratio === 0 || tick.ratio === 1 ? undefined : { left: `${tick.ratio * 100}%` }}
          >
            {formatTimecode(tick.time)}
          </span>
        ))}
      </div>
    </div>
  )
}
