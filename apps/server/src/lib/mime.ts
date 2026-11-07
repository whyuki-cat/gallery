import { extname } from 'node:path'

const MIME_TYPES: Record<string, string> = {
  // 视频
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mkv: 'video/x-matroska',
  webm: 'video/webm',
  avi: 'video/x-msvideo',
  mov: 'video/quicktime',
  wmv: 'video/x-ms-wmv',
  flv: 'video/x-flv',
  ts: 'video/mp2t',
  m2ts: 'video/mp2t',
  // 音频
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  flac: 'audio/flac',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  opus: 'audio/opus',
  // 图片
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  // 字幕与文本
  srt: 'text/plain; charset=utf-8',
  ass: 'text/plain; charset=utf-8',
  ssa: 'text/plain; charset=utf-8',
  vtt: 'text/vtt; charset=utf-8',
  txt: 'text/plain; charset=utf-8',
  json: 'application/json; charset=utf-8',
  nfo: 'text/plain; charset=utf-8',
  // 其他
  pdf: 'application/pdf',
}

export function mimeForPath(path: string): string {
  const ext = extname(path).slice(1).toLowerCase()
  return MIME_TYPES[ext] ?? 'application/octet-stream'
}

export function isImagePath(path: string): boolean {
  const ext = extname(path).slice(1).toLowerCase()
  return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'bmp', 'tif', 'tiff'].includes(ext)
}

export function isVideoPath(path: string): boolean {
  const ext = extname(path).slice(1).toLowerCase()
  return ['mp4', 'm4v', 'mkv', 'webm', 'avi', 'mov', 'wmv', 'flv', 'ts', 'm2ts'].includes(ext)
}
