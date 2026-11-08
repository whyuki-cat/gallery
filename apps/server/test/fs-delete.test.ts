import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { buildApp } from '../src/app.js'

let dir = ''

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'gallery-delete-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

async function names(): Promise<string[]> {
  return (await readdir(dir)).sort()
}

describe('delete route', () => {
  it('deletes selected files and keeps the rest', async () => {
    process.env.LOG_LEVEL = 'silent'
    const app = await buildApp()

    await writeFile(join(dir, 'a.txt'), 'A')
    await writeFile(join(dir, 'b.txt'), 'B')

    const response = await app.inject({
      method: 'POST',
      url: '/api/fs/delete',
      headers: { 'x-gallery-client': '1' },
      payload: { dir, names: ['a.txt'] },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ deleted: ['a.txt'], failed: [] })
    expect(await names()).toEqual(['b.txt'])

    await app.close()
  })

  it('rejects a stale selection without deleting anything', async () => {
    process.env.LOG_LEVEL = 'silent'
    const app = await buildApp()

    await writeFile(join(dir, 'a.txt'), 'A')

    const response = await app.inject({
      method: 'POST',
      url: '/api/fs/delete',
      headers: { 'x-gallery-client': '1' },
      payload: { dir, names: ['a.txt', 'missing.txt'] },
    })

    expect(response.statusCode).toBe(409)
    expect(response.json().error).toBe('stale-selection')
    expect(await names()).toEqual(['a.txt'])

    await app.close()
  })

  it('deletes folders recursively and rejects path traversal', async () => {
    process.env.LOG_LEVEL = 'silent'
    const app = await buildApp()

    await mkdir(join(dir, 'sub', 'nested'), { recursive: true })
    await writeFile(join(dir, 'sub', 'nested', 'inside.txt'), 'inside')

    const folder = await app.inject({
      method: 'POST',
      url: '/api/fs/delete',
      headers: { 'x-gallery-client': '1' },
      payload: { dir, names: ['sub'] },
    })
    expect(folder.statusCode).toBe(200)
    expect(folder.json()).toEqual({ deleted: ['sub'], failed: [] })
    expect(await names()).toEqual([])

    const traversal = await app.inject({
      method: 'POST',
      url: '/api/fs/delete',
      headers: { 'x-gallery-client': '1' },
      payload: { dir, names: ['../outside.txt'] },
    })
    expect(traversal.statusCode).toBe(400)
    expect(traversal.json().error).toBe('invalid-name')

    await app.close()
  })

  it('deletes files and folders in one request', async () => {
    process.env.LOG_LEVEL = 'silent'
    const app = await buildApp()

    await writeFile(join(dir, 'a.txt'), 'A')
    await mkdir(join(dir, 'sub'))
    await writeFile(join(dir, 'b.txt'), 'B')

    const response = await app.inject({
      method: 'POST',
      url: '/api/fs/delete',
      headers: { 'x-gallery-client': '1' },
      payload: { dir, names: ['a.txt', 'sub'] },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ deleted: ['a.txt', 'sub'], failed: [] })
    expect(await names()).toEqual(['b.txt'])

    await app.close()
  })

  it('requires the client header and a non-empty selection', async () => {
    process.env.LOG_LEVEL = 'silent'
    const app = await buildApp()

    const forbidden = await app.inject({
      method: 'POST',
      url: '/api/fs/delete',
      payload: { dir, names: ['a.txt'] },
    })
    expect(forbidden.statusCode).toBe(403)

    const empty = await app.inject({
      method: 'POST',
      url: '/api/fs/delete',
      headers: { 'x-gallery-client': '1' },
      payload: { dir, names: [] },
    })
    expect(empty.statusCode).toBe(400)
    expect(empty.json().error).toBe('empty-selection')

    await app.close()
  })
})
