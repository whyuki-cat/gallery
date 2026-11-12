export interface SubtitleLanguageInfo {
  language: string | null
  label: string
}

export interface SrtConversionResult {
  vtt: string
  cueCount: number
  warnings: string[]
}

const LANGUAGE_ALIASES: Record<string, SubtitleLanguageInfo> = {
  zh: { language: 'zh-CN', label: '简体中文' },
  cn: { language: 'zh-CN', label: '简体中文' },
  chi: { language: 'zh-CN', label: '简体中文' },
  chs: { language: 'zh-CN', label: '简体中文' },
  zho: { language: 'zh-CN', label: '简体中文' },
  'zh-cn': { language: 'zh-CN', label: '简体中文' },
  'zh-hans': { language: 'zh-CN', label: '简体中文' },
  'zh-tw': { language: 'zh-TW', label: '繁体中文' },
  'zh-hant': { language: 'zh-TW', label: '繁体中文' },
  cht: { language: 'zh-TW', label: '繁体中文' },
  en: { language: 'en', label: '英语' },
  eng: { language: 'en', label: '英语' },
  ja: { language: 'ja', label: '日语' },
  jp: { language: 'ja', label: '日语' },
  jpn: { language: 'ja', label: '日语' },
  ko: { language: 'ko', label: '韩语' },
  kr: { language: 'ko', label: '韩语' },
  kor: { language: 'ko', label: '韩语' },
  fr: { language: 'fr', label: '法语' },
  fra: { language: 'fr', label: '法语' },
  fre: { language: 'fr', label: '法语' },
  de: { language: 'de', label: '德语' },
  deu: { language: 'de', label: '德语' },
  ger: { language: 'de', label: '德语' },
  es: { language: 'es', label: '西班牙语' },
  spa: { language: 'es', label: '西班牙语' },
  ru: { language: 'ru', label: '俄语' },
  rus: { language: 'ru', label: '俄语' },
  pt: { language: 'pt', label: '葡萄牙语' },
  por: { language: 'pt', label: '葡萄牙语' },
  it: { language: 'it', label: '意大利语' },
  ita: { language: 'it', label: '意大利语' },
  ar: { language: 'ar', label: '阿拉伯语' },
  ara: { language: 'ar', label: '阿拉伯语' },
  und: { language: null, label: '未指定语言' },
}

const CODE_LIKE = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i

export function parseSubtitleLanguage(value: string | null | undefined): SubtitleLanguageInfo {
  const raw = (value ?? '').trim().replace(/^[.\-_]+/, '')
  if (raw === '') return { language: null, label: '默认字幕' }

  const normalized = raw.toLocaleLowerCase()
  const known = LANGUAGE_ALIASES[normalized]
  if (known) return known

  if (CODE_LIKE.test(raw)) {
    return { language: normalized, label: raw }
  }

  return { language: null, label: raw }
}

export function extractSubtitleSuffix(
  fileName: string,
  videoBase?: string,
): string | null {
  const withoutExtension = fileName.replace(/\.[^.]+$/, '')
  const base = videoBase?.trim() ?? ''
  const remainder = base && withoutExtension.startsWith(`${base}.`)
    ? withoutExtension.slice(base.length + 1)
    : base && withoutExtension === base
      ? ''
      : withoutExtension

  if (remainder === '') return null

  const tokens = remainder.split('.').filter(Boolean)
  for (const token of tokens) {
    if (LANGUAGE_ALIASES[token.toLocaleLowerCase()] || CODE_LIKE.test(token)) {
      return token
    }
  }

  return tokens[tokens.length - 1] ?? null
}

export function inferSubtitleLanguage(
  fileName: string,
  videoBase?: string,
): SubtitleLanguageInfo {
  return parseSubtitleLanguage(extractSubtitleSuffix(fileName, videoBase))
}

function parseTiming(line: string): { start: string; end: string } | null {
  const match =
    /^\s*(?:(\d{1,3}):)?(\d{1,2}):(\d{2})[,.](\d{1,3})\s*-->\s*(?:(\d{1,3}):)?(\d{1,2}):(\d{2})[,.](\d{1,3})\b/.exec(
      line,
    )
  if (!match) return null

  const startHours = Number(match[1] ?? 0)
  const startMinutes = Number(match[2])
  const startSeconds = Number(match[3])
  const startMillis = Number((match[4] ?? '').padEnd(3, '0').slice(0, 3))
  const endHours = Number(match[5] ?? 0)
  const endMinutes = Number(match[6])
  const endSeconds = Number(match[7])
  const endMillis = Number((match[8] ?? '').padEnd(3, '0').slice(0, 3))

  if (
    startMinutes > 59 ||
    startSeconds > 59 ||
    endMinutes > 59 ||
    endSeconds > 59
  ) {
    return null
  }

  const format = (hours: number, minutes: number, seconds: number, millis: number) =>
    `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(
      seconds,
    ).padStart(2, '0')}.${String(millis).padStart(3, '0')}`

  return {
    start: format(startHours, startMinutes, startSeconds, startMillis),
    end: format(endHours, endMinutes, endSeconds, endMillis),
  }
}

/**
 * 把 SRT 字幕转换成浏览器可直接加载的 WebVTT。
 * 非法 cue 会被跳过并记入 warnings，不会让整份字幕失败。
 */
export function srtToWebVtt(input: string): SrtConversionResult {
  const normalized = input
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .trim()
  const warnings: string[] = []

  if (normalized === '') {
    return { vtt: 'WEBVTT\n\n', cueCount: 0, warnings: ['字幕内容为空'] }
  }

  const blocks = normalized.split(/\n{2,}/)
  const cues: string[] = []

  for (const block of blocks) {
    const lines = block.split('\n')
    const timingIndex = lines.findIndex((line) => parseTiming(line) !== null)

    if (timingIndex < 0) {
      warnings.push('已跳过无法识别时间轴的字幕片段')
      continue
    }

    const timing = parseTiming(lines[timingIndex] ?? '')
    if (!timing) {
      warnings.push('已跳过时间格式无效的字幕片段')
      continue
    }

    const textLines = lines.slice(timingIndex + 1)
    while (textLines.length > 0 && textLines[textLines.length - 1]?.trim() === '') {
      textLines.pop()
    }

    cues.push(`${timing.start} --> ${timing.end}\n${textLines.join('\n')}`)
  }

  const body = cues.length > 0 ? `${cues.join('\n\n')}\n` : ''
  return {
    vtt: `WEBVTT\n\n${body}`,
    cueCount: cues.length,
    warnings,
  }
}
