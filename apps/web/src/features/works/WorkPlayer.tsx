import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, Captions, Film, Play } from 'lucide-react'

import { workPosterUrl, workSubtitleUrl, workVideoUrl } from '@/lib/api'
import type { WorkDetail } from '@/features/works/types'

interface WorkPlayerProps {
  work: WorkDetail
}

export function WorkPlayer({ work }: WorkPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [selected, setSelected] = useState<string>('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setSelected(work.subtitles[0]?.id ?? '')
    setError(null)
  }, [work.id, work.subtitles])

  const applyTrack = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    for (let index = 0; index < work.subtitles.length; index += 1) {
      const track = video.textTracks[index]
      if (!track) continue
      track.mode = work.subtitles[index]?.id === selected ? 'showing' : 'disabled'
    }
  }, [selected, work.subtitles])

  useEffect(() => {
    applyTrack()
  }, [applyTrack])

  if (!work.video) {
    return (
      <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-2xl border border-line/80 bg-black/50 text-center">
        <Film className="size-9 text-ink-faint" strokeWidth={1.3} />
        <div className="text-[12.5px] text-ink-dim">主视频缺失，无法播放</div>
        <div className="text-[11px] text-ink-faint">请检查作品目录或重新上传主视频</div>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-line/80 bg-black">
      <div className="relative">
        <video
          ref={videoRef}
          key={work.video.id}
          src={workVideoUrl(work.id)}
          poster={work.posterUrl ? workPosterUrl(work.id, 1200) : undefined}
          controls
          playsInline
          preload="metadata"
          onLoadedMetadata={() => {
            applyTrack()
            setError(null)
          }}
          onError={() => setError('浏览器无法播放该视频格式，或文件无法读取')}
          className="aspect-video w-full bg-black"
        >
          {work.subtitles.map((asset, index) => (
            <track
              key={asset.id}
              kind="subtitles"
              src={workSubtitleUrl(work.id, asset.id)}
              srcLang={asset.language ?? 'und'}
              label={asset.label ?? asset.language ?? asset.fileName}
              default={index === 0}
            />
          ))}
        </video>

        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70 p-6">
            <div className="flex max-w-md items-start gap-2 rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-[12px] leading-relaxed text-rose-200">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              {error}
            </div>
          </div>
        )}
      </div>

      {work.subtitles.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-white/10 bg-panel/95 px-3 py-2">
          <span className="flex items-center gap-1.5 text-[11px] text-ink-faint">
            <Captions className="size-3.5" />
            字幕
          </span>
          <select
            value={selected}
            onChange={(event) => setSelected(event.target.value)}
            className="h-7 rounded-md border border-line bg-panel-2 px-2 text-[11px] text-ink outline-none focus:border-brand/60"
          >
            {work.subtitles.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.label ?? asset.language ?? asset.fileName}
              </option>
            ))}
          </select>
          <span className="ml-auto flex items-center gap-1 text-[10.5px] text-ink-faint">
            <Play className="size-3" />
            使用播放器控制栏调整字幕
          </span>
        </div>
      )}
    </div>
  )
}
