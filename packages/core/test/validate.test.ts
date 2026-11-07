import { describe, expect, it } from 'vitest'

import { validateTargets } from '../src/rename/validate.js'

function codesFor(
  entries: Array<{ source: string; target: string }>,
  existingNames: string[] = [],
  caseInsensitive = true,
) {
  const result = validateTargets(entries, { existingNames, caseInsensitive })
  return entries.map((entry) => (result.get(entry.source) ?? []).map((issue) => issue.code))
}

describe('validateTargets', () => {
  it('rejects empty names', () => {
    expect(codesFor([{ source: 'a.mkv', target: '' }])[0]).toContain('empty')
  })

  it('rejects invalid characters', () => {
    expect(codesFor([{ source: 'a.mkv', target: 'a<b.mkv' }])[0]).toContain('invalid-char')
  })

  it('rejects reserved names', () => {
    expect(codesFor([{ source: 'a.mkv', target: 'CON.txt' }])[0]).toContain('reserved-name')
  })

  it('rejects trailing dots and spaces', () => {
    expect(codesFor([{ source: 'a.mkv', target: 'movie.' }])[0]).toContain(
      'trailing-dot-or-space',
    )
    expect(codesFor([{ source: 'a.mkv', target: 'movie ' }])[0]).toContain(
      'trailing-dot-or-space',
    )
  })

  it('rejects names that are too long', () => {
    const target = `${'a'.repeat(300)}.mkv`
    expect(codesFor([{ source: 'a.mkv', target }])[0]).toContain('too-long')
  })

  it('rejects duplicate targets case-insensitively', () => {
    const codes = codesFor([
      { source: 'a.mkv', target: 'same.mkv' },
      { source: 'b.mkv', target: 'SAME.mkv' },
    ])

    expect(codes[0]).toContain('duplicate-target')
    expect(codes[1]).toContain('duplicate-target')
  })

  it('rejects targets that already exist in the directory', () => {
    expect(
      codesFor([{ source: 'a.mkv', target: 'taken.mkv' }], ['taken.mkv'])[0],
    ).toContain('target-exists')
  })

  it('compares existing names case-insensitively', () => {
    expect(
      codesFor([{ source: 'a.mkv', target: 'TAKEN.mkv' }], ['taken.mkv'])[0],
    ).toContain('target-exists')
  })

  it('allows a case-only rename', () => {
    expect(codesFor([{ source: 'movie.mkv', target: 'Movie.mkv' }])[0]).toEqual([])
  })

  it('allows a case-only rename when the name also exists in a different case', () => {
    expect(
      codesFor([{ source: 'movie.mkv', target: 'Movie.mkv' }], ['Movie.mkv'])[0],
    ).toEqual([])
  })

  it('can compare case-sensitively when asked', () => {
    const result = validateTargets(
      [
        { source: 'a.mkv', target: 'same.mkv' },
        { source: 'b.mkv', target: 'SAME.mkv' },
      ],
      { caseInsensitive: false },
    )

    expect(result.get('a.mkv')).toEqual([])
    expect(result.get('b.mkv')).toEqual([])
  })
})
