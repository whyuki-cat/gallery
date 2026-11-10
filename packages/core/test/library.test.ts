import { describe, expect, it } from 'vitest'

import {
  generateFolderName,
  isLibraryOrganization,
  isLibraryType,
  isValidFolderSegment,
  libraryNameKey,
  sanitizeFolderName,
  summarizeLibraryStatus,
  validateLibraryName,
} from '../src/library/validate.js'

describe('validateLibraryName', () => {
  it('accepts a normal Chinese name', () => {
    expect(validateLibraryName('宫崎骏作品集')).toEqual([])
  })

  it('rejects empty and whitespace-only names', () => {
    expect(validateLibraryName('   ').map((issue) => issue.code)).toEqual(['empty-name'])
  })

  it('rejects names longer than 80 characters', () => {
    expect(validateLibraryName('a'.repeat(81)).map((issue) => issue.code)).toEqual([
      'name-too-long',
    ])
  })

  it('rejects duplicates ignoring case and surrounding whitespace', () => {
    expect(validateLibraryName(' Movies ', ['movies']).map((issue) => issue.code)).toEqual([
      'duplicate-name',
    ])
  })

  it('normalizes the uniqueness key', () => {
    expect(libraryNameKey('  Movies ')).toBe('movies')
  })
})

describe('sanitizeFolderName', () => {
  it('keeps Chinese characters', () => {
    expect(sanitizeFolderName('宫崎骏作品集')).toBe('宫崎骏作品集')
  })

  it('replaces Windows illegal characters', () => {
    expect(sanitizeFolderName('a<b>c:d"e/f\\g|h?i*j')).toBe('a-b-c-d-e-f-g-h-i-j')
  })

  it('prefixes reserved device names', () => {
    expect(sanitizeFolderName('CON')).toBe('_CON')
    expect(sanitizeFolderName('com1')).toBe('_com1')
  })

  it('removes trailing dots and spaces', () => {
    expect(sanitizeFolderName('  name.  ')).toBe('name')
  })

  it('falls back when nothing remains', () => {
    expect(sanitizeFolderName('...')).toBe('library')
  })

  it('always produces a valid folder segment', () => {
    for (const input of ['宫崎骏作品集', 'a/b', 'CON', 'name.', 'a'.repeat(200)]) {
      expect(isValidFolderSegment(sanitizeFolderName(input))).toBe(true)
    }
  })
})

describe('isValidFolderSegment', () => {
  it('rejects separators, dot segments and trailing dots', () => {
    expect(isValidFolderSegment('a/b')).toBe(false)
    expect(isValidFolderSegment('..')).toBe(false)
    expect(isValidFolderSegment('name.')).toBe(false)
    expect(isValidFolderSegment('CON')).toBe(false)
  })

  it('accepts a normal segment', () => {
    expect(isValidFolderSegment('作品集-2026')).toBe(true)
  })
})

describe('generateFolderName', () => {
  it('returns the sanitized name when free', () => {
    expect(generateFolderName('作品集', [])).toBe('作品集')
  })

  it('appends suffixes on collision ignoring case', () => {
    expect(generateFolderName('Movies', ['movies'])).toBe('Movies-2')
    expect(generateFolderName('Movies', ['movies', 'movies-2'])).toBe('Movies-3')
  })
})

describe('enums', () => {
  it('recognizes organizations and types', () => {
    expect(isLibraryOrganization('collection')).toBe(true)
    expect(isLibraryOrganization('jellyfin')).toBe(false)
    expect(isLibraryType('series')).toBe(true)
    expect(isLibraryType('music')).toBe(false)
  })
})

describe('summarizeLibraryStatus', () => {
  it('returns missing for no statuses', () => {
    expect(summarizeLibraryStatus([])).toBe('missing')
  })

  it('returns ok when all paths are ok', () => {
    expect(summarizeLibraryStatus(['ok', 'ok'])).toBe('ok')
  })

  it('returns partial when some paths are missing', () => {
    expect(summarizeLibraryStatus(['ok', 'missing'])).toBe('partial')
  })

  it('returns missing when all paths are missing', () => {
    expect(summarizeLibraryStatus(['missing', 'missing'])).toBe('missing')
  })

  it('prioritizes symlink and unreadable states', () => {
    expect(summarizeLibraryStatus(['ok', 'symlink'])).toBe('symlink')
    expect(summarizeLibraryStatus(['ok', 'unreadable'])).toBe('unreadable')
  })
})
