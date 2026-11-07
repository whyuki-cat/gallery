import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { listDirectory } from '../src/lib/fs-service.js'
import { isInside, isSymbolicLink, resolveUserPath } from '../src/lib/paths.js'

let root = ''
let symlinkCreated = false

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'gallery-paths-'))
  await mkdir(join(root, 'sub'), { recursive: true })
  await writeFile(join(root, 'note.txt'), 'hello')

  const outside = await mkdtemp(join(tmpdir(), 'gallery-outside-'))
  await writeFile(join(outside, 'secret.txt'), 'secret')

  try {
    await symlink(outside, join(root, 'link'), 'junction')
    symlinkCreated = true
  } catch {
    symlinkCreated = false
  }
})

afterAll(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('resolveUserPath', () => {
  it('rejects empty input', () => {
    expect(() => resolveUserPath('')).toThrowError(/路径不能为空/)
  })

  it('rejects relative paths', () => {
    expect(() => resolveUserPath('relative/dir')).toThrowError(/绝对路径/)
  })

  it('rejects NUL bytes', () => {
    expect(() => resolveUserPath(`${root}\0evil`)).toThrowError(/非法字符/)
  })

  it('accepts absolute paths', () => {
    expect(resolveUserPath(root)).toBe(resolve(root))
  })

  it('rejects paths outside the configured roots', () => {
    const outside = resolve(root, '..')
    expect(() => resolveUserPath(outside, { roots: [root] })).toThrowError(/超出允许范围/)
  })

  it('accepts paths inside the configured roots', () => {
    expect(() => resolveUserPath(join(root, 'sub'), { roots: [root] })).not.toThrow()
  })
})

describe('isInside', () => {
  it('distinguishes inside and outside paths', () => {
    expect(isInside(root, join(root, 'sub'))).toBe(true)
    expect(isInside(root, resolve(root, '..'))).toBe(false)
  })
})

describe('symlink handling', () => {
  it('detects symbolic links', async () => {
    if (!symlinkCreated) return
    expect(await isSymbolicLink(join(root, 'link'))).toBe(true)
    expect(await isSymbolicLink(join(root, 'note.txt'))).toBe(false)
  })

  it('does not list symbolic links', async () => {
    if (!symlinkCreated) return
    const listing = await listDirectory(root)
    expect(listing.entries.map((entry) => entry.name)).not.toContain('link')
  })

  it('refuses to enter a symbolic link', async () => {
    if (!symlinkCreated) return
    await expect(listDirectory(join(root, 'link'))).rejects.toThrowError(/符号链接/)
  })
})
