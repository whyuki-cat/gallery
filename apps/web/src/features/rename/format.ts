export function formatSize(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return '—'
  if (bytes < 1024) return `${bytes} B`

  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let index = 0

  while (value >= 1024 && index < units.length - 1) {
    value /= 1024
    index += 1
  }

  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`
}

export function formatDate(ms: number | null | undefined): string {
  if (!ms) return '—'
  const date = new Date(ms)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`
}

export interface DiffParts {
  prefix: string
  oldMiddle: string
  newMiddle: string
  suffix: string
}

/** 计算新旧名称的公共前后缀，用于高亮差异部分。 */
export function diffName(before: string, after: string): DiffParts {
  let prefixLength = 0
  const maxPrefix = Math.min(before.length, after.length)
  while (prefixLength < maxPrefix && before[prefixLength] === after[prefixLength]) {
    prefixLength += 1
  }

  let suffixLength = 0
  while (
    suffixLength < min(before.length, after.length) - prefixLength &&
    before[before.length - 1 - suffixLength] === after[after.length - 1 - suffixLength]
  ) {
    suffixLength += 1
  }

  return {
    prefix: after.slice(0, prefixLength),
    oldMiddle: before.slice(prefixLength, before.length - suffixLength),
    newMiddle: after.slice(prefixLength, after.length - suffixLength),
    suffix: after.slice(after.length - suffixLength),
  }
}

function min(a: number, b: number): number {
  return a < b ? a : b
}

export function fileIconTone(extension: string): string {
  switch (extension) {
    case 'mkv':
    case 'mp4':
    case 'avi':
    case 'mov':
    case 'webm':
    case 'm4v':
      return 'text-brand-soft'
    case 'jpg':
    case 'jpeg':
    case 'png':
    case 'gif':
    case 'webp':
    case 'avif':
      return 'text-emerald-300'
    case 'srt':
    case 'ass':
    case 'vtt':
      return 'text-amber-300'
    default:
      return 'text-ink-faint'
  }
}

export function isImageFile(extension: string): boolean {
  return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'bmp', 'tif', 'tiff', 'svg'].includes(
    extension,
  )
}

export function isVideoFile(extension: string): boolean {
  return ['mp4', 'm4v', 'mkv', 'webm', 'avi', 'mov', 'wmv', 'flv', 'ts', 'm2ts'].includes(extension)
}

export function isAudioFile(extension: string): boolean {
  return ['mp3', 'm4a', 'aac', 'flac', 'wav', 'ogg', 'opus'].includes(extension)
}

export function isTextFile(extension: string): boolean {
  return ['txt', 'srt', 'ass', 'ssa', 'vtt', 'json', 'nfo'].includes(extension)
}

export function isPdfFile(extension: string): boolean {
  return extension === 'pdf'
}
