import { describe, expect, it } from 'vitest'

import { resolveConflicts } from '../src/rename/conflicts.js'

const entries = [
  { source: 'a.mkv', target: 'same.mkv' },
  { source: 'b.mkv', target: 'same.mkv' },
]

describe('resolveConflicts', () => {
  it('blocks when the strategy is block', () => {
    const result = resolveConflicts(entries, { strategy: 'block' })

    expect(result.blocking).toBe(true)
    expect(result.items.map((item) => item.target)).toEqual(['same.mkv', 'same.mkv'])
    expect(result.items.every((item) => !item.skipped)).toBe(true)
  })

  it('skips conflicting entries', () => {
    const result = resolveConflicts(entries, { strategy: 'skip' })

    expect(result.blocking).toBe(false)
    expect(result.items.every((item) => item.skipped)).toBe(true)
  })

  it('skips only the conflicting entries', () => {
    const result = resolveConflicts(
      [...entries, { source: 'c.mkv', target: 'unique.mkv' }],
      { strategy: 'skip' },
    )

    expect(result.items.map((item) => item.skipped)).toEqual([true, true, false])
    expect(result.blocking).toBe(false)
  })

  it('appends an index until the name is free', () => {
    const result = resolveConflicts(
      [
        { source: 'a.mkv', target: 'same.mkv' },
        { source: 'b.mkv', target: 'same.mkv' },
      ],
      { strategy: 'auto-index', existingNames: ['same (1).mkv'] },
    )

    expect(result.blocking).toBe(false)
    expect(result.items.map((item) => item.target)).toEqual(['same.mkv', 'same (2).mkv'])
  })

  it('still blocks on non-conflict problems', () => {
    const result = resolveConflicts(
      [{ source: 'a.mkv', target: 'bad<name.mkv' }],
      { strategy: 'auto-index' },
    )

    expect(result.blocking).toBe(true)
  })
})
