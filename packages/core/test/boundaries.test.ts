import { describe, expect, it } from 'vitest'

import {
  clampTrimBoundaryTime,
  groupTrimBoundaries,
  initialTrimSegments,
  moveTrimBoundary,
  setTrimEndAt,
  setTrimStartAt,
} from '../src/trim/boundaries.js'
import type { TrimSegment } from '../src/trim/types.js'

const segment = (start: number, end: number): TrimSegment => ({ start, end })

describe('initialTrimSegments', () => {
  it('starts with the whole video as one segment', () => {
    expect(initialTrimSegments(12.5)).toEqual([segment(0, 12.5)])
  })

  it('returns an empty list when the duration is invalid', () => {
    expect(initialTrimSegments(0)).toEqual([])
    expect(initialTrimSegments(Number.NaN)).toEqual([])
  })
})

describe('setTrimEndAt', () => {
  it('trims the default segment from its end', () => {
    expect(setTrimEndAt([segment(0, 30)], 10, 30)).toEqual({
      segments: [segment(0, 10)],
      issue: null,
    })
  })

  it('pairs a new end with the previous start and replaces the old end', () => {
    expect(setTrimEndAt([segment(0, 5), segment(10, 15)], 20, 30)).toEqual({
      segments: [segment(0, 5), segment(10, 20)],
      issue: null,
    })
    expect(setTrimEndAt([segment(0, 5), segment(10, 15)], 12, 30)).toEqual({
      segments: [segment(0, 5), segment(10, 12)],
      issue: null,
    })
  })

  it('extends the previous segment into a gap', () => {
    expect(setTrimEndAt([segment(0, 5), segment(10, 15)], 7, 30)).toEqual({
      segments: [segment(0, 7), segment(10, 15)],
      issue: null,
    })
  })

  it('creates a segment from 0:00 when there is no earlier start', () => {
    expect(setTrimEndAt([segment(10, 20)], 5, 30)).toEqual({
      segments: [segment(0, 5), segment(10, 20)],
      issue: null,
    })
  })

  it('rejects a too-short result and keeps the original segments', () => {
    const segments = [segment(5, 20)]
    const result = setTrimEndAt(segments, 5.05, 30)

    expect(result.issue?.code).toBe('too-short')
    expect(result.segments).toEqual(segments)
  })

  it('clamps the end to the video duration', () => {
    expect(setTrimEndAt([segment(0, 10)], 40, 30)).toEqual({
      segments: [segment(0, 30)],
      issue: null,
    })
  })
})

describe('setTrimStartAt', () => {
  it('trims the default segment from its start', () => {
    expect(setTrimStartAt([segment(0, 30)], 10, 30)).toEqual({
      segments: [segment(10, 30)],
      issue: null,
    })
  })

  it('pairs a new start with the next end and replaces the old start', () => {
    expect(setTrimStartAt([segment(0, 10), segment(20, 30)], 25, 30)).toEqual({
      segments: [segment(0, 10), segment(25, 30)],
      issue: null,
    })
    expect(setTrimStartAt([segment(0, 10), segment(20, 30)], 12, 30)).toEqual({
      segments: [segment(0, 10), segment(12, 30)],
      issue: null,
    })
  })

  it('creates a segment ending at the video end when there is no later end', () => {
    expect(setTrimStartAt([segment(0, 10)], 20, 30)).toEqual({
      segments: [segment(0, 10), segment(20, 30)],
      issue: null,
    })
  })

  it('uses the first ending after the playhead', () => {
    expect(setTrimStartAt([segment(0, 10), segment(20, 30)], 5, 30)).toEqual({
      segments: [segment(5, 10), segment(20, 30)],
      issue: null,
    })
  })

  it('rejects a too-short result and keeps the original segments', () => {
    const segments = [segment(0, 30)]
    const result = setTrimStartAt(segments, 29.95, 30)

    expect(result.issue?.code).toBe('too-short')
    expect(result.segments).toEqual(segments)
  })
})

describe('groupTrimBoundaries', () => {
  it('merges a coincident end and start into one draggable handle', () => {
    const handles = groupTrimBoundaries([segment(0, 10), segment(10, 20)])

    expect(handles).toEqual([
      { time: 0, hasStart: true, hasEnd: false, refs: [{ index: 0, edge: 'start' }] },
      {
        time: 10,
        hasStart: true,
        hasEnd: true,
        refs: [
          { index: 0, edge: 'end' },
          { index: 1, edge: 'start' },
        ],
      },
      { time: 20, hasStart: false, hasEnd: true, refs: [{ index: 1, edge: 'end' }] },
    ])
  })

  it('groups boundaries that are almost at the same time', () => {
    const handles = groupTrimBoundaries([segment(0, 10), segment(10.00005, 20)])

    expect(handles).toHaveLength(3)
    expect(handles[1]?.hasStart).toBe(true)
    expect(handles[1]?.hasEnd).toBe(true)
  })
})

describe('clampTrimBoundaryTime', () => {
  it('clamps to the video range and the minimum segment length', () => {
    expect(clampTrimBoundaryTime([segment(0, 10)], [{ index: 0, edge: 'end' }], 40, 30)).toBe(30)
    expect(clampTrimBoundaryTime([segment(0, 10)], [{ index: 0, edge: 'end' }], -1, 30)).toBe(0.1)
  })

  it('clamps to the neighboring segments for a shared boundary', () => {
    const refs = [
      { index: 0, edge: 'end' as const },
      { index: 1, edge: 'start' as const },
    ]

    expect(clampTrimBoundaryTime([segment(0, 10), segment(10, 20)], refs, -5, 30)).toBe(0.1)
    expect(clampTrimBoundaryTime([segment(0, 10), segment(10, 20)], refs, 25, 30)).toBe(19.9)
  })
})

describe('moveTrimBoundary', () => {
  it('moves a single start or end boundary', () => {
    expect(
      moveTrimBoundary([segment(0, 10)], [{ index: 0, edge: 'end' }], 8, 30),
    ).toEqual([segment(0, 8)])
    expect(
      moveTrimBoundary([segment(0, 10)], [{ index: 0, edge: 'start' }], 2, 30),
    ).toEqual([segment(2, 10)])
  })

  it('keeps at least the minimum duration', () => {
    expect(
      moveTrimBoundary([segment(0, 10)], [{ index: 0, edge: 'end' }], 0, 30),
    ).toEqual([segment(0, 0.1)])
  })

  it('does not let a start cross the previous segment', () => {
    expect(
      moveTrimBoundary(
        [segment(0, 10), segment(20, 30)],
        [{ index: 1, edge: 'start' }],
        5,
        30,
      ),
    ).toEqual([segment(0, 10), segment(10, 30)])
  })

  it('does not let an end cross the next segment', () => {
    expect(
      moveTrimBoundary(
        [segment(0, 10), segment(20, 30)],
        [{ index: 0, edge: 'end' }],
        25,
        30,
      ),
    ).toEqual([segment(0, 20), segment(20, 30)])
  })

  it('moves a shared boundary as one cut point', () => {
    expect(
      moveTrimBoundary(
        [segment(0, 10), segment(10, 20)],
        [
          { index: 0, edge: 'end' },
          { index: 1, edge: 'start' },
        ],
        12,
        30,
      ),
    ).toEqual([segment(0, 12), segment(12, 20)])
  })

  it('ignores unknown references', () => {
    const segments = [segment(0, 10)]
    expect(moveTrimBoundary(segments, [{ index: 5, edge: 'start' }], 2, 30)).toEqual(segments)
  })
})
