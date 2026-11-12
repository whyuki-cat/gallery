import { describe, expect, it } from 'vitest'

import {
  extractSubtitleSuffix,
  generateWorkFolderName,
  inferSubtitleLanguage,
  parseSubtitleLanguage,
  srtToWebVtt,
  validateWorkName,
  workNameKey,
} from '../src/index.js'

describe('work validation', () => {
  it('accepts a normal movie name', () => {
    expect(validateWorkName('  星际穿越  ')).toEqual([])
  })

  it('rejects empty names and control characters', () => {
    expect(validateWorkName('   ').map((issue) => issue.code)).toEqual(['empty-name'])
    expect(validateWorkName('bad\u0000name').map((issue) => issue.code)).toEqual(['invalid-name'])
  })

  it('rejects names longer than 80 characters', () => {
    expect(validateWorkName('a'.repeat(81)).map((issue) => issue.code)).toEqual([
      'name-too-long',
    ])
  })

  it('normalizes the name key', () => {
    expect(workNameKey('  Movie  ')).toBe('movie')
  })

  it('generates folder names with collision suffixes', () => {
    expect(generateWorkFolderName('Movie', [])).toBe('Movie')
    expect(generateWorkFolderName('Movie', ['movie'])).toBe('Movie-2')
  })
})

describe('subtitle language', () => {
  it('recognizes common language suffixes', () => {
    expect(parseSubtitleLanguage('zh-CN')).toEqual({
      language: 'zh-CN',
      label: '简体中文',
    })
    expect(parseSubtitleLanguage('chs')).toEqual({ language: 'zh-CN', label: '简体中文' })
    expect(parseSubtitleLanguage('en')).toEqual({ language: 'en', label: '英语' })
    expect(parseSubtitleLanguage('eng')).toEqual({ language: 'en', label: '英语' })
  })

  it('keeps unknown code-like suffixes and labels unknown text', () => {
    expect(parseSubtitleLanguage('xx-YY')).toEqual({ language: 'xx-yy', label: 'xx-YY' })
    expect(parseSubtitleLanguage('简体')).toEqual({ language: null, label: '简体' })
    expect(parseSubtitleLanguage(null)).toEqual({ language: null, label: '默认字幕' })
  })

  it('extracts the suffix from a subtitle filename', () => {
    expect(extractSubtitleSuffix('Inception.2010.zh-CN.srt', 'Inception.2010')).toBe(
      'zh-CN',
    )
    expect(inferSubtitleLanguage('Inception.2010.eng.srt', 'Inception.2010')).toEqual({
      language: 'en',
      label: '英语',
    })
    expect(inferSubtitleLanguage('Inception.2010.srt', 'Inception.2010')).toEqual({
      language: null,
      label: '默认字幕',
    })
  })
})

describe('srtToWebVtt', () => {
  it('converts BOM, CRLF and comma timestamps', () => {
    const result = srtToWebVtt(
      '\uFEFF1\r\n00:00:01,250 --> 00:00:03,500\r\n第一行\r\n第二行\r\n',
    )
    expect(result.cueCount).toBe(1)
    expect(result.vtt).toBe(
      'WEBVTT\n\n00:00:01.250 --> 00:00:03.500\n第一行\n第二行\n',
    )
    expect(result.warnings).toEqual([])
  })

  it('accepts a missing cue index and skips invalid blocks', () => {
    const result = srtToWebVtt(
      [
        '00:00:01,000 --> 00:00:02,000',
        '有效字幕',
        '',
        '不是时间轴',
        '',
        '2',
        '00:00:03,000 --> 00:00:04,000',
        '第二段',
      ].join('\n'),
    )
    expect(result.cueCount).toBe(2)
    expect(result.vtt).toContain('有效字幕')
    expect(result.vtt).toContain('第二段')
    expect(result.warnings).toHaveLength(1)
  })

  it('returns a valid empty document for empty input', () => {
    expect(srtToWebVtt('   ')).toEqual({
      vtt: 'WEBVTT\n\n',
      cueCount: 0,
      warnings: ['字幕内容为空'],
    })
  })
})
