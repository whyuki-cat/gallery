import { describe, expect, it } from 'vitest'

import { applyRules, splitFileName } from '../src/rename/operations.js'
import type { RenameOp } from '../src/rename/types.js'

const op = <T extends RenameOp>(value: T): T => value

describe('splitFileName', () => {
  it('splits base name and extension', () => {
    expect(splitFileName('movie.mkv')).toEqual({ base: 'movie', ext: '.mkv' })
  })

  it('treats dotfiles as base names', () => {
    expect(splitFileName('.gitignore')).toEqual({ base: '.gitignore', ext: '' })
  })

  it('handles names without extension', () => {
    expect(splitFileName('README')).toEqual({ base: 'README', ext: '' })
  })
})

describe('applyRules basic rules', () => {
  it('applies rules in order', () => {
    const ops: RenameOp[] = [
      op({ id: '1', type: 'replace', find: '.', with: ' ' }),
      op({ id: '2', type: 'case', mode: 'title' }),
    ]

    const result = applyRules('my.file.name.mkv', 0, {}, ops)

    expect(result.name).toBe('My File Name.mkv')
    expect(result.issues).toEqual([])
  })

  it('replaces with a regular expression when requested', () => {
    const ops: RenameOp[] = [
      op({ id: '1', type: 'replace', find: '\\d{3,4}p', with: '', regex: true }),
    ]

    expect(applyRules('movie.1080p.mkv', 0, {}, ops).name).toBe('movie..mkv')
  })

  it('removes matching text', () => {
    const ops: RenameOp[] = [op({ id: '1', type: 'remove', find: '[site]' })]

    expect(applyRules('[site]movie.mkv', 0, {}, ops).name).toBe('movie.mkv')
  })

  it('adds prefix and suffix to the base name only', () => {
    const ops: RenameOp[] = [
      op({ id: '1', type: 'affix', side: 'prefix', text: '[' }),
      op({ id: '2', type: 'affix', side: 'suffix', text: ']' }),
    ]

    expect(applyRules('movie.mkv', 0, {}, ops).name).toBe('[movie].mkv')
  })

  it('converts case', () => {
    expect(
      applyRules('My Movie.mkv', 0, {}, [op({ id: '1', type: 'case', mode: 'lower' })]).name,
    ).toBe('my movie.mkv')
    expect(
      applyRules('My Movie.mkv', 0, {}, [op({ id: '1', type: 'case', mode: 'upper' })]).name,
    ).toBe('MY MOVIE.mkv')
  })

  it('keeps the previous name and reports an invalid regular expression', () => {
    const result = applyRules('movie.mkv', 0, {}, [
      op({ id: '1', type: 'replace', find: '([', with: 'x', regex: true }),
    ])

    expect(result.name).toBe('movie.mkv')
    expect(result.issues.map((issue) => issue.code)).toContain('invalid-regex')
  })

  it('ignores disabled rules', () => {
    const result = applyRules('movie.mkv', 0, {}, [
      op({ id: '1', type: 'affix', side: 'prefix', text: 'x', enabled: false }),
    ])

    expect(result.name).toBe('movie.mkv')
  })
})

describe('sequence numbering', () => {
  it('numbers by the provided order', () => {
    const ops: RenameOp[] = [
      op({ id: '1', type: 'sequence', start: 1, step: 1, pad: 3, side: 'prefix' }),
    ]

    const names = ['b.mkv', 'a.mkv', 'c.mkv'].map((name, index) =>
      applyRules(name, index, {}, ops).name,
    )

    expect(names).toEqual(['001b.mkv', '002a.mkv', '003c.mkv'])
  })

  it('reassigns numbers when the order changes', () => {
    const ops: RenameOp[] = [
      op({ id: '1', type: 'sequence', start: 1, step: 1, pad: 2, side: 'suffix', separator: '_' }),
    ]

    const firstOrder = ['b.mkv', 'a.mkv'].map((name, index) => applyRules(name, index, {}, ops).name)
    const secondOrder = ['a.mkv', 'b.mkv'].map((name, index) =>
      applyRules(name, index, {}, ops).name,
    )

    expect(firstOrder).toEqual(['b_01.mkv', 'a_02.mkv'])
    expect(secondOrder).toEqual(['a_01.mkv', 'b_02.mkv'])
  })

  it('honours start, step and padding', () => {
    const ops: RenameOp[] = [
      op({ id: '1', type: 'sequence', start: 10, step: 5, pad: 4, side: 'suffix' }),
    ]

    expect(applyRules('a.mkv', 0, {}, ops).name).toBe('a0010.mkv')
    expect(applyRules('a.mkv', 2, {}, ops).name).toBe('a0020.mkv')
  })
})

describe('template variables', () => {
  it('renders known variables', () => {
    const ops: RenameOp[] = [op({ id: '1', type: 'template', pattern: '{index:3}-{name}' })]

    const result = applyRules('movie.mkv', 4, { parentName: 'Videos' }, ops)

    expect(result.name).toBe('005-movie.mkv')
    expect(result.issues).toEqual([])
  })

  it('exposes extension, parent, size and date', () => {
    const ops: RenameOp[] = [
      op({ id: '1', type: 'template', pattern: '{parent}-{date}-{size}.{ext}' }),
    ]

    const result = applyRules('movie.mkv', 0, {
      parentName: 'Videos',
      size: 1024,
      date: new Date(2024, 0, 2),
    }, ops)

    expect(result.name).toBe('Videos-2024-01-02-1024.mkv.mkv')
    expect(result.issues).toEqual([])
  })

  it('reports unknown variables instead of dropping them', () => {
    const result = applyRules('movie.mkv', 0, {}, [
      op({ id: '1', type: 'template', pattern: '{unknown}' }),
    ])

    expect(result.name).toBe('{unknown}.mkv')
    expect(result.issues.map((issue) => issue.code)).toContain('unknown-variable')
  })
})

describe('extension strategies', () => {
  it('keeps the original extension by default', () => {
    expect(applyRules('Movie.MKV', 0, {}, []).name).toBe('Movie.MKV')
  })

  it('lowercases the extension', () => {
    const ops: RenameOp[] = [op({ id: '1', type: 'extension', mode: 'lower' })]

    expect(applyRules('Movie.MKV', 0, {}, ops).name).toBe('Movie.mkv')
  })

  it('applies a custom extension', () => {
    const ops: RenameOp[] = [op({ id: '1', type: 'extension', mode: 'custom', value: 'mp4' })]

    expect(applyRules('Movie.MKV', 0, {}, ops).name).toBe('Movie.mp4')
  })
})
