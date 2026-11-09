import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CheckCircle2,
  Combine,
  Download,
  FastForward,
  Film,
  FolderOpen,
  Info,
  Loader2,
  Pause,
  Play,
  Rewind,
  Scissors,
  X,
  XCircle,
} from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import {
  formatTimecode,
  initialTrimSegments,
  moveTrimBoundary,
  planTrimOutputs,
  setTrimEndAt,
  setTrimStartAt,
  validateSegments,
  type TrimBoundaryRef,
  type TrimExportKind,
  type TrimSegment,
} from '@gallery/core'

import { api, ApiError, rawUrl } from '@/lib/api'
import { cn } from '@/lib/cn'
import { SegmentList } from '@/features/trim/SegmentList'
import { TrimTimeline } from '@/features/trim/TrimTimeline'
import { VideoPicker } from '@/features/trim/VideoPicker'
import type { TrimNotice } from '@/features/trim/types'
import { isVideoFile } from '@/features/rename/format'
import type { RootsResponse } from '@/features/rename/types'

function fileNameOf(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}

function extensionOf(path: string): string {
  const name = fileNameOf(path)
  const dot = name.lastIndexOf('.')
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : ''
}

function dirNameOf(path: string): string {
  const index = Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/'))
  if (index <= 0) return ''

  const dir = path.slice(0, index)
  return /^[A-Za-z]:$/.test(dir) ? `${dir}\\` : dir
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function TrimPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const sourcePath = searchParams.get('path') ?? ''
  const sourceName = sourcePath ? fileNameOf(sourcePath) : ''
  const sourceDir = sourcePath ? dirNameOf(sourcePath) : ''

  const [roots, setRoots] = useState<RootsResponse | null>(null)
  const [segments, setSegments] = useState<TrimSegment[]>([])
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [videoError, setVideoError] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const [existingNames, setExistingNames] = useState<string[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [notice, setNotice] = useState<TrimNotice | null>(null)
  const [exporting, setExporting] = useState<TrimExportKind | null>(null)

  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    api
      .roots()
      .then(setRoots)
      .catch(() => setRoots(null))
  }, [])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), 6000)
    return () => window.clearTimeout(timer)
  }, [notice])

  useEffect(() => {
    setSegments([])
    setDuration(0)
    setCurrentTime(0)
    setVideoError(null)
    setPlaying(false)
    setActiveIndex(null)
    setExistingNames([])
    setNotice(null)

    const video = videoRef.current
    if (
      sourcePath &&
      video &&
      video.readyState >= 1 &&
      Number.isFinite(video.duration) &&
      video.duration > 0
    ) {
      // 深链首次加载时元数据可能早于本 effect 就绪，直接补齐默认片段，避免被重置覆盖。
      setDuration(video.duration)
      setSegments(initialTrimSegments(video.duration))
    }

    if (!sourcePath || !sourceDir) return

    let cancelled = false
    api
      .list(sourceDir, false)
      .then((listing) => {
        if (!cancelled) setExistingNames(listing.entries.map((entry) => entry.name))
      })
      .catch(() => {
        if (!cancelled) setExistingNames([])
      })

    return () => {
      cancelled = true
    }
  }, [sourcePath, sourceDir])

  const setSourcePath = useCallback(
    (next: string) => {
      const params = new URLSearchParams(searchParams)
      if (next) params.set('path', next)
      else params.delete('path')
      setSearchParams(params, { replace: true })
    },
    [searchParams, setSearchParams],
  )

  const seek = useCallback(
    (time: number) => {
      const video = videoRef.current
      const videoDuration = video?.duration
      const limit =
        duration > 0
          ? duration
          : typeof videoDuration === 'number' && Number.isFinite(videoDuration)
            ? videoDuration
            : 0
      const next = clamp(time, 0, limit)
      setCurrentTime(next)

      if (!video) return
      try {
        video.currentTime = next
      } catch {
        // 元数据尚未就绪时忽略定位请求，等 loadedmetadata 后可再次操作。
      }
    },
    [duration],
  )

  const togglePlay = useCallback(() => {
    const video = videoRef.current
    if (!video || duration <= 0) return

    if (video.paused || video.ended) {
      if (video.ended) {
        video.currentTime = 0
        setCurrentTime(0)
      }
      void video.play().catch(() => {
        setNotice({ kind: 'error', text: '无法开始播放，请检查视频格式' })
      })
    } else {
      video.pause()
    }
  }, [duration])

  const seekBy = useCallback(
    (delta: number) => {
      seek((videoRef.current?.currentTime ?? currentTime) + delta)
    },
    [currentTime, seek],
  )

  const markStartAtPlayhead = useCallback(() => {
    if (duration <= 0) return
    const time = clamp(videoRef.current?.currentTime ?? currentTime, 0, duration)
    const result = setTrimStartAt(segments, time, duration)
    if (result.issue) {
      setNotice({ kind: 'info', text: result.issue.message })
      return
    }

    setSegments(result.segments)
    setActiveIndex(null)
    seek(time)
  }, [currentTime, duration, seek, segments])

  const markEndAtPlayhead = useCallback(() => {
    if (duration <= 0) return
    const time = clamp(videoRef.current?.currentTime ?? currentTime, 0, duration)
    const result = setTrimEndAt(segments, time, duration)
    if (result.issue) {
      setNotice({ kind: 'info', text: result.issue.message })
      return
    }

    setSegments(result.segments)
    setActiveIndex(null)
    seek(time)
  }, [currentTime, duration, seek, segments])

  const handleMoveBoundary = useCallback(
    (refs: TrimBoundaryRef[], time: number) => {
      if (exporting) return
      setSegments((previous) => moveTrimBoundary(previous, refs, time, duration))
      setActiveIndex(null)
    },
    [duration, exporting],
  )

  useEffect(() => {
    if (duration <= 0 || pickerOpen || exporting !== null) return

    const handler = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return
      const target = event.target instanceof HTMLElement ? event.target : null
      if (
        target?.closest(
          'input, textarea, select, button, a, [contenteditable="true"], [role="slider"]',
        )
      ) {
        return
      }

      if (event.key === 'i' || event.key === 'I') {
        event.preventDefault()
        markStartAtPlayhead()
      } else if (event.key === 'o' || event.key === 'O') {
        event.preventDefault()
        markEndAtPlayhead()
      } else if (event.key === ' ') {
        event.preventDefault()
        togglePlay()
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault()
        seekBy(event.key === 'ArrowLeft' ? -1 : 1)
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [duration, exporting, markStartAtPlayhead, markEndAtPlayhead, pickerOpen, seekBy, togglePlay])

  const handleLoadedMetadata = () => {
    const video = videoRef.current
    if (!video) return

    if (Number.isFinite(video.duration) && video.duration > 0) {
      setDuration(video.duration)
      setSegments(initialTrimSegments(video.duration))
      setVideoError(null)
    } else {
      setDuration(0)
      setSegments([])
      setVideoError('无法读取视频时长，暂不支持该格式')
    }
  }

  const handleVideoError = () => {
    setDuration(0)
    setVideoError('浏览器无法播放该视频格式，或文件无法读取')
  }

  const handleRemove = (index: number) => {
    if (exporting) return
    setSegments((previous) => previous.filter((_, itemIndex) => itemIndex !== index))
    setActiveIndex((current) => {
      if (current === null) return null
      if (current === index) return null
      return current > index ? current - 1 : current
    })
  }

  const handleSelectSegment = (index: number) => {
    const segment = segments[index]
    if (!segment) return
    setActiveIndex(index)
    seek(segment.start)
  }

  const handleClear = () => {
    if (exporting) return
    setSegments(initialTrimSegments(duration))
    setActiveIndex(null)
  }

  const refreshExistingNames = useCallback(async () => {
    if (!sourceDir) return
    try {
      const listing = await api.list(sourceDir, false)
      setExistingNames(listing.entries.map((entry) => entry.name))
    } catch {
      // 导出已经成功，预览名称刷新失败时保留旧值即可。
    }
  }, [sourceDir])

  const handleExport = async (kind: TrimExportKind) => {
    if (!sourcePath || exporting) return
    setExporting(kind)
    setNotice(null)

    try {
      const result = await api.trimExport({ path: sourcePath, output: kind, segments })

      if (result.failed.length > 0) {
        const firstFailed = result.failed[0]
        setNotice({
          kind: 'error',
          text: `导出完成 ${result.outputs.length} 个，${result.failed.length} 个失败：第 ${
            firstFailed?.index ?? '?'
          } 段 ${firstFailed?.message ?? '未知错误'}`,
        })
      } else if (result.outputs.length === 0) {
        setNotice({ kind: 'error', text: '没有生成任何输出文件' })
      } else if (kind === 'merged') {
        setNotice({ kind: 'ok', text: `已合并导出「${result.outputs[0]?.name ?? ''}」` })
      } else {
        const first = result.outputs[0]?.name ?? ''
        setNotice({
          kind: 'ok',
          text: `已导出 ${result.outputs.length} 个片段${
            first ? `：${first}${result.outputs.length > 1 ? ' 等' : ''}` : ''
          }`,
        })
      }

      await refreshExistingNames()
    } catch (caught) {
      setNotice({
        kind: 'error',
        text: caught instanceof ApiError ? caught.message : '导出失败',
      })
    } finally {
      setExporting(null)
    }
  }

  const handleSelectVideo = (path: string) => {
    if (!isVideoFile(extensionOf(path))) {
      setNotice({ kind: 'error', text: '请选择受支持的视频文件' })
      return
    }
    setPickerOpen(false)
    setSourcePath(path)
  }

  const validationIssues = useMemo(() => validateSegments(segments), [segments])
  const videoReady = duration > 0 && !videoError
  const editingDisabled = !videoReady || exporting !== null
  const ffmpegAvailable = roots?.capabilities.ffmpeg !== false
  const canExport =
    Boolean(sourcePath) &&
    segments.length > 0 &&
    validationIssues.length === 0 &&
    videoReady &&
    ffmpegAvailable &&
    exporting === null

  const separatePlan = useMemo(
    () =>
      sourceName && segments.length > 0
        ? planTrimOutputs({
            fileName: sourceName,
            kind: 'separate',
            segments,
            existingNames,
          })
        : null,
    [sourceName, segments, existingNames],
  )

  const mergedPlan = useMemo(
    () =>
      sourceName && segments.length > 0
        ? planTrimOutputs({
            fileName: sourceName,
            kind: 'merged',
            segments,
            existingNames,
          })
        : null,
    [sourceName, segments, existingNames],
  )

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-line/70 bg-panel/35">
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-line/70 px-6 py-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-brand/30 bg-brand/10 text-brand-soft">
          <Scissors className="size-5" strokeWidth={1.8} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-[14px] font-semibold text-ink">视频裁剪</h1>
            <span className="rounded-full border border-line bg-panel-2/60 px-2 py-0.5 text-[10px] text-ink-faint">
              无损
            </span>
          </div>
          <div className="truncate text-[11px] text-ink-faint" title={sourcePath || undefined}>
            {sourcePath || '选择本地视频后开始标记片段'}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          disabled={exporting !== null}
          className="flex h-9 items-center gap-1.5 rounded-lg border border-line bg-panel-2/60 px-3 text-[12px] text-ink-dim transition hover:border-line-strong hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
        >
          <FolderOpen className="size-4" />
          {sourcePath ? '更换视频' : '选择视频'}
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        <section className="flex min-w-0 flex-1 flex-col">
          {sourcePath ? (
            <>
              <div className="relative flex min-h-0 flex-1 items-center justify-center bg-black">
                <video
                  key={sourcePath}
                  ref={videoRef}
                  src={rawUrl(sourcePath)}
                  playsInline
                  preload="metadata"
                  onClick={togglePlay}
                  onPlay={() => setPlaying(true)}
                  onPause={() => setPlaying(false)}
                  onEnded={() => setPlaying(false)}
                  onLoadedMetadata={handleLoadedMetadata}
                  onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
                  onError={handleVideoError}
                  className="h-full w-full cursor-pointer object-contain"
                />

                {videoError && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/65 p-6">
                    <div className="max-w-md rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-center text-[12px] leading-relaxed text-rose-200">
                      {videoError}
                    </div>
                  </div>
                )}
              </div>

              <div className="shrink-0 border-t border-line/70 px-5 py-4">
                <TrimTimeline
                  duration={duration}
                  currentTime={currentTime}
                  segments={segments}
                  disabled={editingDisabled}
                  onSeek={seek}
                  onMoveBoundary={handleMoveBoundary}
                />

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={togglePlay}
                    disabled={!videoReady || exporting !== null}
                    title={playing ? '暂停（空格）' : '播放（空格）'}
                    aria-label={playing ? '暂停' : '播放'}
                    className="grid size-9 place-items-center rounded-lg border border-brand/40 bg-brand/15 text-brand-soft transition hover:border-brand/60 hover:bg-brand/20 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => seekBy(-1)}
                    disabled={editingDisabled}
                    title="后退 1 秒（←）"
                    aria-label="后退 1 秒"
                    className="grid size-9 place-items-center rounded-lg border border-line bg-panel-2/70 text-ink-dim transition hover:border-line-strong hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Rewind className="size-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => seekBy(1)}
                    disabled={editingDisabled}
                    title="前进 1 秒（→）"
                    aria-label="前进 1 秒"
                    className="grid size-9 place-items-center rounded-lg border border-line bg-panel-2/70 text-ink-dim transition hover:border-line-strong hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <FastForward className="size-4" />
                  </button>

                  <span className="ml-1 font-mono text-[11.5px] text-ink-dim">
                    {formatTimecode(currentTime)}
                    <span className="text-ink-faint"> / {formatTimecode(duration)}</span>
                  </span>

                  <div className="ml-auto flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={markStartAtPlayhead}
                      disabled={editingDisabled}
                      className="flex h-8 items-center gap-1.5 rounded-lg border border-amber-400/35 bg-amber-400/10 px-3 text-[12px] text-amber-200 transition hover:border-amber-400/60 hover:bg-amber-400/15 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <span className="size-1.5 rounded-full bg-amber-300" />
                      设为起点
                      <kbd className="rounded border border-amber-400/25 px-1 font-mono text-[9px] text-amber-200/70">
                        I
                      </kbd>
                    </button>
                    <button
                      type="button"
                      onClick={markEndAtPlayhead}
                      disabled={editingDisabled}
                      className="flex h-8 items-center gap-1.5 rounded-lg border border-brand/35 bg-brand/10 px-3 text-[12px] text-brand-soft transition hover:border-brand/60 hover:bg-brand/15 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <span className="size-1.5 rounded-full bg-brand-soft" />
                      设为终点
                      <kbd className="rounded border border-brand/25 px-1 font-mono text-[9px] text-brand-soft/70">
                        O
                      </kbd>
                    </button>
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px]">
                  <span className="text-ink-faint">
                    默认以 0:00 为起点、视频结尾为终点。定位后点“设为起点/终点”会移动对应浮标，也可以直接拖动时间轴上的浮标微调。
                  </span>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
              <div className="relative">
                <div className="absolute inset-0 -z-10 rounded-full bg-brand/20 blur-3xl" />
                <div className="grid size-16 place-items-center rounded-2xl border border-line/70 bg-[linear-gradient(160deg,rgba(139,92,246,0.24),rgba(34,211,238,0.07))] shadow-[0_18px_50px_-24px_rgba(139,92,246,0.9)]">
                  <Film className="size-7 text-brand-soft" strokeWidth={1.6} />
                </div>
              </div>
              <h2 className="mt-5 text-lg font-semibold tracking-tight text-ink">选择一个视频开始</h2>
              <p className="mt-2 max-w-sm text-[12.5px] leading-relaxed text-ink-dim">
                在左侧预览视频，点击或拖动时间轴定位，再用“设为起点 / 设为终点”移动边界；时间轴上的“起 / 终”浮标可以直接拖动微调。
              </p>
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className="mt-5 flex h-9 items-center gap-1.5 rounded-lg bg-[linear-gradient(135deg,#8b5cf6,#7c3aed)] px-4 text-[12px] font-medium text-white shadow-[0_10px_26px_-14px_rgba(139,92,246,0.95)] transition hover:brightness-110"
              >
                <FolderOpen className="size-4" />
                选择视频
              </button>
            </div>
          )}
        </section>

        <aside className="flex w-[340px] shrink-0 flex-col border-l border-line/70 bg-panel/95 backdrop-blur-sm max-xl:w-[300px]">
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line/70 px-4 py-3">
            <div>
              <div className="text-[12.5px] font-semibold text-ink">待导出的片段</div>
              <div className="text-[10.5px] text-ink-faint">{segments.length} 个片段</div>
            </div>
            {segments.length > 0 && (
              <button
                type="button"
                onClick={handleClear}
                disabled={exporting !== null}
                className="rounded-md px-2 py-1 text-[11px] text-ink-faint transition hover:bg-hover-strong hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
                title="恢复为覆盖整个视频的默认片段"
              >
                重置
              </button>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <SegmentList
              segments={segments}
              activeIndex={activeIndex}
              onSelect={handleSelectSegment}
              onRemove={handleRemove}
            />

            {segments.length > 0 && separatePlan && mergedPlan && (
              <div className="mt-4 rounded-xl border border-line/70 bg-panel-2/40 p-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                  输出预览
                </div>
                <div className="mt-2 space-y-2 text-[10.5px]">
                  <div>
                    <div className="text-ink-faint">逐段导出</div>
                    {separatePlan.names.slice(0, 3).map((name) => (
                      <div key={name} className="truncate font-mono text-ink-dim" title={name}>
                        {name}
                      </div>
                    ))}
                    {separatePlan.names.length > 3 && (
                      <div className="text-ink-faint">等 {separatePlan.names.length} 个文件</div>
                    )}
                  </div>
                  <div>
                    <div className="text-ink-faint">合并导出</div>
                    <div className="truncate font-mono text-ink-dim" title={mergedPlan.names[0]}>
                      {mergedPlan.names[0]}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="shrink-0 space-y-2 border-t border-line/70 p-3.5">
            {!ffmpegAvailable && (
              <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-[10.5px] leading-relaxed text-amber-200">
                当前环境缺少 FFmpeg，无法导出。视频预览与标记仍可使用。
              </div>
            )}

            {segments.length > 0 && validationIssues.length > 0 && (
              <div className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-[10.5px] leading-relaxed text-rose-200">
                {validationIssues[0]?.message}
              </div>
            )}

            <button
              type="button"
              onClick={() => void handleExport('separate')}
              disabled={!canExport}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[linear-gradient(135deg,#8b5cf6,#7c3aed)] px-3 text-[12px] font-medium text-white shadow-[0_10px_26px_-14px_rgba(139,92,246,0.95)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {exporting === 'separate' ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Download className="size-4" />
              )}
              导出片段（{segments.length}）
            </button>

            <button
              type="button"
              onClick={() => void handleExport('merged')}
              disabled={!canExport}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-brand/40 bg-brand/10 px-3 text-[12px] font-medium text-brand-soft transition hover:border-brand/60 hover:bg-brand/15 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {exporting === 'merged' ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Combine className="size-4" />
              )}
              导出并合并
            </button>

            <p className="text-[10px] leading-relaxed text-ink-faint">
              使用无损流复制，不重新编码；切割点会对齐到最近关键帧。输出写入源文件目录，重名自动追加序号，不会覆盖已有文件。
            </p>
          </div>
        </aside>
      </div>

      <VideoPicker
        open={pickerOpen}
        initialDir={sourceDir}
        onClose={() => setPickerOpen(false)}
        onSelect={handleSelectVideo}
      />

      {notice && (
        <div
          className={cn(
            'absolute bottom-4 right-4 z-40 flex max-w-md items-start gap-2 rounded-xl border px-3.5 py-2.5 text-[12px] shadow-2xl backdrop-blur',
            notice.kind === 'ok' && 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200',
            notice.kind === 'error' && 'border-rose-400/30 bg-rose-500/10 text-rose-200',
            notice.kind === 'info' && 'border-line-strong bg-panel-2/90 text-ink-dim',
          )}
        >
          {notice.kind === 'ok' ? (
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          ) : notice.kind === 'error' ? (
            <XCircle className="mt-0.5 size-4 shrink-0" />
          ) : (
            <Info className="mt-0.5 size-4 shrink-0" />
          )}
          <span className="leading-relaxed">{notice.text}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="ml-1 text-current/70 transition hover:text-current"
            aria-label="关闭提示"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}
