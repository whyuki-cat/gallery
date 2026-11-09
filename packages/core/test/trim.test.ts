import { describe, expect, it } from 'vitest'

import { formatFileTime, formatTimecode, planTrimOutputs } from '../src/trim/output.js'
import { sortSegments, validateSegments } from '../src/trim/segments.js'
import type { TrimSegment } from '../src/trim/types.js'

const segment = (start: number, end: number): TrimSegment => ({ start, end })

describe('validateSegments', () => {
  it('rejects a non-array and an empty array', () => {
    expect(validateSegments(null)[0]?.code).toBe('empty')
    expect(validateSegments([])[0]?.code).toBe('empty')
  })

  it('accepts one segment and the maximum number of segments', () => {
    expect(validateSegments([segment(0, 1)])).toEqual([])
    expect(validateSegments(Array.from({ length: 100 }, (_, index) => segment(index, index + 1)))).toEqual([])
  })

  it('rejects more than the maximum number of segments', () => {
    const segments = Array.from({ length: 101 }, (_, index) => segment(index, index + 1))
    expect(validateSegments(segments)[0]?.code).toBe('too-many')
  })

  it('rejects non-object entries', () => {
    expect(validateSegments([null])[0]?.code).toBe('invalid-segment')
  })

  it('rejects non-finite values', () => {
    expect(validateSegments([segment(Number.NaN, 1)])[0]?.code).toBe('not-finite')
    expect(validateSegments([segment(0, Number.POSITIVE_INFINITY)])[0]?.code).toBe('not-finite')
  })

  it('rejects negative starts', () => {
    expect(validateSegments([segment(-0.1, 1)])[0]?.code).toBe('negative-start')
  })

  it('rejects reversed and empty ranges', () => {
    expect(validateSegments([segment(2, 1)])[0]?.code).toBe('invalid-range')
    expect(validateSegments([segment(1, 1)])[0]?.code).toBe('invalid-range')
  })

  it('rejects segments shorter than 0.1 seconds but allows exactly 0.1', () => {
    expect(validateSegments([segment(0, 0.09)])[0]?.code).toBe('too-short')
    expect(validateSegments([segment(0, 0.1)])).toEqual([])
  })
})

describe('sortSegments', () => {
  it('sorts by start and then end without mutating the input', () => {
    const input = [segment(10, 12), segment(1, 4), segment(1, 2)]
    const sorted = sortSegments(input)

    expect(sorted).toEqual([segment(1, 2), segment(1, 4), segment(10, 12)])
    expect(input).toEqual([segment(10, 12), segment(1, 4), segment(1, 2)])
  })
})

describe('formatTimecode', () => {
  it('formats minutes and milliseconds below one hour', () => {
    expect(formatTimecode(0)).toBe('00:00.000')
    expect(formatTimecode(61.234)).toBe('01:01.234')
  })

  it('formats hours once the duration reaches one hour', () => {
    expect(formatTimecode(3661.234)).toBe('01:01:01.234')
  })

  it('carries rounded milliseconds into the next second', () => {
    expect(formatTimecode(59.9999)).toBe('01:00.000')
  })

  it('returns a placeholder for invalid values', () => {
    expect(formatTimecode(-1)).toBe('--:--.---')
    expect(formatTimecode(Number.NaN)).toBe('--:--.---')
  })
})

describe('formatFileTime', () => {
  it('uses zero-padded HH.MM.SS.mmm', () => {
    expect(formatFileTime(0)).toBe('00.00.00.000')
    expect(formatFileTime(1.2)).toBe('00.00.01.200')
    expect(formatFileTime(3661.234)).toBe('01.01.01.234')
    expect(formatFileTime(36000)).toBe('10.00.00.000')
  })

  it('treats invalid and negative values as zero', () => {
    expect(formatFileTime(-1)).toBe('00.00.00.000')
    expect(formatFileTime(Number.NaN)).toBe('00.00.00.000')
  })
})

describe('planTrimOutputs', () => {
  it('names a single segment with its source time range', () => {
    expect(
      planTrimOutputs({
        fileName: 'demo.mp4',
        kind: 'separate',
        segments: [segment(1.2, 4.5)],
        existingNames: [],
      }).names,
    ).toEqual(['demo-00.00.01.200-00.00.04.500.mp4'])
  })

  it('sorts segments and names each one', () => {
    expect(
      planTrimOutputs({
        fileName: 'demo.mp4',
        kind: 'separate',
        segments: [segment(10, 12), segment(1.2, 4.5)],
        existingNames: [],
      }).names,
    ).toEqual([
      'demo-00.00.01.200-00.00.04.500.mp4',
      'demo-00.00.10.000-00.00.12.000.mp4',
    ])
  })

  it('keeps the source extension and handles names with dots', () => {
    expect(
      planTrimOutputs({
        fileName: 'my.video.mkv',
        kind: 'separate',
        segments: [segment(0, 1)],
        existingNames: [],
      }).names,
    ).toEqual(['my.video-00.00.00.000-00.00.01.000.mkv'])
  })

  it('names a merged output with the trimmed suffix', () => {
    expect(
      planTrimOutputs({
        fileName: 'demo.mp4',
        kind: 'merged',
        segments: [segment(0, 1)],
        existingNames: [],
      }).names,
    ).toEqual(['demo.trimmed.mp4'])
  })

  it('adds a suffix when the name already exists, ignoring case', () => {
    expect(
      planTrimOutputs({
        fileName: 'demo.mp4',
        kind: 'separate',
        segments: [segment(1.2, 4.5)],
        existingNames: ['DEMO-00.00.01.200-00.00.04.500.MP4'],
      }).names,
    ).toEqual(['demo-00.00.01.200-00.00.04.500 (1).mp4'])
  })

  it('keeps duplicate time ranges distinct within one batch', () => {
    expect(
      planTrimOutputs({
        fileName: 'demo.mp4',
        kind: 'separate',
        segments: [segment(0, 1), segment(0, 1)],
        existingNames: [],
      }).names,
    ).toEqual([
      'demo-00.00.00.000-00.00.01.000.mp4',
      'demo-00.00.00.000-00.00.01.000 (1).mp4',
    ])
  })

  it('adds a suffix to a merged name when needed', () => {
    expect(
      planTrimOutputs({
        fileName: 'demo.mp4',
        kind: 'merged',
        segments: [segment(0, 1)],
        existingNames: ['demo.trimmed.mp4'],
      }).names,
    ).toEqual(['demo.trimmed (1).mp4'])
  })

  it('supports files without an extension', () => {
    expect(
      planTrimOutputs({
        fileName: 'demo',
        kind: 'separate',
        segments: [segment(0, 1)],
        existingNames: [],
      }).names,
    ).toEqual(['demo-00.00.00.000-00.00.01.000'])
  })
})
