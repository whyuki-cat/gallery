import { access, mkdtemp, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { buildApp } from '../src/app.js'
import { runFfmpeg, hasFfmpeg } from '../src/lib/ffmpeg.js'
import { exportTrim } from '../src/lib/trim.js'

let dir = ''
let video = ''
let ffmpegAvailable = false

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'gallery-trim-'))
  ffmpegAvailable = await hasFfmpeg()

  if (ffmpegAvailable) {
    video = join(dir, 'demo.mp4')
    await runFfmpeg([
      '-y',
      '-f',
      'lavfi',
      '-i',
      'testsrc=size=160x120:rate=10',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440',
      '-t',
      '3',
      '-c:v',
      'libx264',
      '-g',
      '10',
      '-keyint_min',
      '10',
      '-sc_threshold',
      '0',
      '-c:a',
      'aac',
      '-pix_fmt',
      'yuv420p',
      video,
    ])
  }
})

afterAll(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('exportTrim', () => {
  it('exports each segment to the source directory', async () => {
    if (!ffmpegAvailable) return

    const result = await exportTrim({
      path: video,
      kind: 'separate',
      segments: [
        { start: 0.5, end: 1.5 },
        { start: 2, end: 2.8 },
      ],
    })

    expect(result.failed).toEqual([])
    expect(result.outputs.map((output) => output.name)).toEqual([
      'demo-00.00.00.500-00.00.01.500.mp4',
      'demo-00.00.02.000-00.00.02.800.mp4',
    ])

    for (const output of result.outputs) {
      expect(output.size).toBeGreaterThan(0)
      expect(await exists(output.path)).toBe(true)
    }
  })

  it('merges segments into one file', async () => {
    if (!ffmpegAvailable) return

    const result = await exportTrim({
      path: video,
      kind: 'merged',
      segments: [
        { start: 0.2, end: 1 },
        { start: 1.5, end: 2.4 },
      ],
    })

    expect(result.failed).toEqual([])
    expect(result.outputs.map((output) => output.name)).toEqual(['demo.trimmed.mp4'])
    expect(result.outputs[0]?.size).toBeGreaterThan(0)
    expect(await exists(result.outputs[0]?.path ?? '')).toBe(true)
  })

  it('does not overwrite existing outputs', async () => {
    if (!ffmpegAvailable) return

    const first = await exportTrim({
      path: video,
      kind: 'separate',
      segments: [{ start: 0.2, end: 1 }],
    })
    const second = await exportTrim({
      path: video,
      kind: 'separate',
      segments: [{ start: 0.2, end: 1 }],
    })

    expect(first.outputs[0]?.name).toBe('demo-00.00.00.200-00.00.01.000.mp4')
    expect(second.outputs[0]?.name).toBe('demo-00.00.00.200-00.00.01.000 (1).mp4')
    expect(await readdir(dir)).toEqual(
      expect.arrayContaining([first.outputs[0]?.name, second.outputs[0]?.name]),
    )
  })
})

describe('trim export route', () => {
  it('reports the ffmpeg capability', async () => {
    process.env.LOG_LEVEL = 'silent'
    const app = await buildApp()

    const response = await app.inject({ method: 'GET', url: '/api/fs/roots' })

    expect(response.statusCode).toBe(200)
    const capabilities = response.json().capabilities
    expect(capabilities.thumbnail).toBe(true)
    expect(typeof capabilities.videoThumbnail).toBe('boolean')
    expect(typeof capabilities.ffmpeg).toBe('boolean')

    await app.close()
  })

  it('exports a valid request', async () => {
    if (!ffmpegAvailable) return

    process.env.LOG_LEVEL = 'silent'
    const app = await buildApp()

    const response = await app.inject({
      method: 'POST',
      url: '/api/trim/export',
      headers: { 'x-gallery-client': '1' },
      payload: {
        path: video,
        output: 'separate',
        segments: [{ start: 0.2, end: 1 }],
      },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().failed).toEqual([])
    expect(response.json().outputs).toHaveLength(1)

    await app.close()
  })

  it('requires the client header', async () => {
    process.env.LOG_LEVEL = 'silent'
    const app = await buildApp()

    const response = await app.inject({
      method: 'POST',
      url: '/api/trim/export',
      payload: { path: video, output: 'separate', segments: [{ start: 0, end: 1 }] },
    })

    expect(response.statusCode).toBe(403)

    await app.close()
  })

  it('rejects a non-video file', async () => {
    process.env.LOG_LEVEL = 'silent'
    const app = await buildApp()
    const text = join(dir, 'note.txt')
    await writeFile(text, 'hello')

    const response = await app.inject({
      method: 'POST',
      url: '/api/trim/export',
      headers: { 'x-gallery-client': '1' },
      payload: { path: text, output: 'separate', segments: [{ start: 0, end: 1 }] },
    })

    expect(response.statusCode).toBe(415)
    expect(response.json().error).toBe('not-a-video')

    await app.close()
  })

  it('rejects invalid segment lists', async () => {
    process.env.LOG_LEVEL = 'silent'
    const app = await buildApp()

    const cases = [
      { segments: [], output: 'separate' },
      { segments: [{ start: 1, end: 1 }], output: 'separate' },
      { segments: [{ start: 0, end: 0.05 }], output: 'separate' },
      {
        segments: Array.from({ length: 101 }, (_, index) => ({ start: index, end: index + 1 })),
        output: 'separate',
      },
      { segments: [{ start: 0, end: 1 }], output: 'bad' },
    ]

    for (const item of cases) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/trim/export',
        headers: { 'x-gallery-client': '1' },
        payload: { path: video, ...item },
      })

      expect(response.statusCode).toBe(400)
    }

    await app.close()
  })

  it('rejects a relative or missing path', async () => {
    process.env.LOG_LEVEL = 'silent'
    const app = await buildApp()

    for (const path of ['relative/video.mp4', undefined]) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/trim/export',
        headers: { 'x-gallery-client': '1' },
        payload: { path, output: 'separate', segments: [{ start: 0, end: 1 }] },
      })

      expect(response.statusCode).toBe(400)
    }

    await app.close()
  })

  it('rejects symbolic links', async () => {
    process.env.LOG_LEVEL = 'silent'
    const app = await buildApp()
    const link = join(dir, 'linked-video.mp4')

    try {
      await symlink(video, link, 'file')
    } catch {
      await app.close()
      return
    }

    const response = await app.inject({
      method: 'POST',
      url: '/api/trim/export',
      headers: { 'x-gallery-client': '1' },
      payload: { path: link, output: 'separate', segments: [{ start: 0, end: 1 }] },
    })

    expect(response.statusCode).toBe(403)
    expect(response.json().error).toBe('symlink')

    await app.close()
  })

  it('ignores client-provided output names', async () => {
    if (!ffmpegAvailable) return

    process.env.LOG_LEVEL = 'silent'
    const app = await buildApp()

    const response = await app.inject({
      method: 'POST',
      url: '/api/trim/export',
      headers: { 'x-gallery-client': '1' },
      payload: {
        path: video,
        output: 'separate',
        segments: [{ start: 0.2, end: 1 }],
        outputName: 'evil.mp4',
        outputPath: join(dir, 'evil.mp4'),
      },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().outputs[0].name).not.toBe('evil.mp4')
    expect(await exists(join(dir, 'evil.mp4'))).toBe(false)

    await app.close()
  })
})
