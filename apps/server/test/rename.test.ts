import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { buildApp } from '../src/app.js'
import { executeRename } from '../src/lib/rename-executor.js'

let dir = ''

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'gallery-rename-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

async function names(): Promise<string[]> {
  return (await readdir(dir)).sort()
}

describe('executeRename', () => {
  it('renames a normal batch', async () => {
    await writeFile(join(dir, 'a.txt'), 'A')
    await writeFile(join(dir, 'b.txt'), 'B')

    const result = await executeRename({
      dir,
      pairs: [
        { from: 'a.txt', to: 'x.txt' },
        { from: 'b.txt', to: 'y.txt' },
      ],
    })

    expect(result.failed).toEqual([])
    expect(await names()).toEqual(['x.txt', 'y.txt'])
    expect(await readFile(join(dir, 'x.txt'), 'utf8')).toBe('A')
    expect(await readFile(join(dir, 'y.txt'), 'utf8')).toBe('B')
  })

  it('swaps names without losing content', async () => {
    await writeFile(join(dir, 'a.txt'), 'A')
    await writeFile(join(dir, 'b.txt'), 'B')

    const result = await executeRename({
      dir,
      pairs: [
        { from: 'a.txt', to: 'b.txt' },
        { from: 'b.txt', to: 'a.txt' },
      ],
    })

    expect(result.failed).toEqual([])
    expect(await readFile(join(dir, 'a.txt'), 'utf8')).toBe('B')
    expect(await readFile(join(dir, 'b.txt'), 'utf8')).toBe('A')
  })

  it('handles case-only changes', async () => {
    await writeFile(join(dir, 'movie.mkv'), 'content')

    const result = await executeRename({
      dir,
      pairs: [{ from: 'movie.mkv', to: 'Movie.mkv' }],
    })

    expect(result.failed).toEqual([])
    expect(await names()).toEqual(['Movie.mkv'])
    expect(await readFile(join(dir, 'Movie.mkv'), 'utf8')).toBe('content')
  })

  it('rolls back completed renames when one item fails', async () => {
    await writeFile(join(dir, 'a.txt'), 'A')
    await writeFile(join(dir, 'b.txt'), 'B')
    await mkdir(join(dir, 'blocked'))

    const result = await executeRename({
      dir,
      pairs: [
        { from: 'a.txt', to: 'x.txt' },
        { from: 'b.txt', to: 'blocked' },
      ],
    })

    expect(result.failed.length).toBeGreaterThan(0)
    expect(result.rolledBack).toBe(true)
    expect(await names()).toEqual(['a.txt', 'b.txt', 'blocked'])
  })
})

describe('single rename route', () => {
  it('rejects a file that no longer exists', async () => {
    process.env.LOG_LEVEL = 'silent'
    const app = await buildApp()

    const response = await app.inject({
      method: 'POST',
      url: '/api/rename/single',
      headers: { 'x-gallery-client': '1' },
      payload: { dir, from: 'missing.txt', to: 'next.txt' },
    })

    expect(response.statusCode).toBe(409)
    expect(response.json().error).toBe('stale-selection')

    await app.close()
  })

  it('rejects a target name that already exists', async () => {
    process.env.LOG_LEVEL = 'silent'
    const app = await buildApp()

    await writeFile(join(dir, 'a.txt'), 'A')
    await writeFile(join(dir, 'b.txt'), 'B')

    const response = await app.inject({
      method: 'POST',
      url: '/api/rename/single',
      headers: { 'x-gallery-client': '1' },
      payload: { dir, from: 'a.txt', to: 'b.txt' },
    })

    expect(response.statusCode).toBe(409)
    expect(response.json().error).toBe('conflicts')
    expect(await names()).toEqual(['a.txt', 'b.txt'])

    await app.close()
  })
})

describe('folder rename', () => {
  it('renames a folder through the single route', async () => {
    process.env.LOG_LEVEL = 'silent'
    const app = await buildApp()

    await mkdir(join(dir, 'old'))
    await writeFile(join(dir, 'old', 'keep.txt'), 'K')

    const response = await app.inject({
      method: 'POST',
      url: '/api/rename/single',
      headers: { 'x-gallery-client': '1' },
      payload: { dir, from: 'old', to: 'new' },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().renamed).toEqual([{ from: 'old', to: 'new' }])
    expect(await names()).toEqual(['new'])
    expect(await readFile(join(dir, 'new', 'keep.txt'), 'utf8')).toBe('K')

    await app.close()
  })

  it('renames folders in a batch through the apply route', async () => {
    process.env.LOG_LEVEL = 'silent'
    const app = await buildApp()

    await mkdir(join(dir, 'one'))
    await mkdir(join(dir, 'two'))

    const response = await app.inject({
      method: 'POST',
      url: '/api/rename/apply',
      headers: { 'x-gallery-client': '1' },
      payload: {
        dir,
        names: ['one', 'two'],
        operations: [{ id: '1', type: 'affix', side: 'prefix', text: 'v-' }],
        strategy: 'block',
      },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().renamed).toEqual([
      { from: 'one', to: 'v-one' },
      { from: 'two', to: 'v-two' },
    ])
    expect(await names()).toEqual(['v-one', 'v-two'])

    await app.close()
  })
})

describe('apply route', () => {
  it('rejects a stale selection', async () => {
    process.env.LOG_LEVEL = 'silent'
    const app = await buildApp()

    await writeFile(join(dir, 'a.txt'), 'A')

    const response = await app.inject({
      method: 'POST',
      url: '/api/rename/apply',
      headers: { 'x-gallery-client': '1' },
      payload: {
        dir,
        names: ['missing.txt'],
        operations: [],
        strategy: 'block',
      },
    })

    expect(response.statusCode).toBe(409)
    expect(response.json().error).toBe('stale-selection')

    await app.close()
  })

  it('returns conflicts instead of renaming', async () => {
    process.env.LOG_LEVEL = 'silent'
    const app = await buildApp()

    await writeFile(join(dir, 'a.txt'), 'A')

    const response = await app.inject({
      method: 'POST',
      url: '/api/rename/apply',
      headers: { 'x-gallery-client': '1' },
      payload: {
        dir,
        names: ['a.txt'],
        operations: [{ id: '1', type: 'affix', side: 'prefix', text: '' }],
        strategy: 'block',
      },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().renamed).toEqual([])

    await app.close()
  })

  it('requires the client header for mutations', async () => {
    process.env.LOG_LEVEL = 'silent'
    const app = await buildApp()

    const response = await app.inject({
      method: 'POST',
      url: '/api/rename/apply',
      payload: { dir, names: [], operations: [] },
    })

    expect(response.statusCode).toBe(403)

    await app.close()
  })
})
