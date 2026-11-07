import { describe, expect, it } from 'vitest'

import { needsIntermediateNames } from '../src/rename/plan.js'

describe('needsIntermediateNames', () => {
  it('returns false for independent renames', () => {
    expect(needsIntermediateNames([{ from: 'a.mkv', to: 'b.mkv' }])).toBe(false)
  })

  it('detects swaps', () => {
    expect(
      needsIntermediateNames([
        { from: 'a.mkv', to: 'b.mkv' },
        { from: 'b.mkv', to: 'a.mkv' },
      ]),
    ).toBe(true)
  })

  it('detects chained dependencies', () => {
    expect(
      needsIntermediateNames([
        { from: 'a.mkv', to: 'b.mkv' },
        { from: 'b.mkv', to: 'c.mkv' },
      ]),
    ).toBe(true)
  })

  it('detects case-only changes', () => {
    expect(needsIntermediateNames([{ from: 'movie.mkv', to: 'Movie.mkv' }])).toBe(true)
    expect(needsIntermediateNames([{ from: 'movie.mkv', to: 'Movie.mkv' }], false)).toBe(false)
  })

  it('returns false for an empty plan', () => {
    expect(needsIntermediateNames([])).toBe(false)
  })
})
