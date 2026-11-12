import { access, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { HttpError } from '../src/lib/errors.js'
import {
  copyFileAtomic,
  resolveWorkAssetPath,
  resolveWorkPath,
  sanitizeFileName,
  uniqueFileName,
  validateSourceFile,
  type CollectionLibraryContext,
} from '../src/lib/work-storage.js'

let dir = ''

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'gallery-work-storage-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

function context(libraryPath: string): CollectionLibraryContext {
  return {
    root: dir,
    libraryPath,
    library: {
      id: 'library',
      name: '作品集',
      organization: 'collection',
      type: 'movie',
      convention: null,
      folder: '作品集',
      sources: [],
      createdAt: 'now',
      updatedAt: 'now',
    },
  }
}

describe('work storage', () => {
  it('validates source files and rejects missing, directory, symlink and wrong types', async () => {
    const video = join(dir, 'movie.mkv')
    await writeFile(video, 'video')
    expect((await validateSourceFile(video, 'video')).name).toBe('movie.mkv')

    await expect(validateSourceFile(join(dir, 'missing.mkv'), 'video')).rejects.toMatchObject({
      code: 'source-missing',
    })
    await expect(validateSourceFile(dir, 'video')).rejects.toMatchObject({
      code: 'source-not-file',
    })
    await expect(validateSourceFile(video, 'image')).rejects.toMatchObject({
      code: 'unsupported-source',
    })

    const link = join(dir, 'link.mkv')
    try {
      await symlink(video, link, 'file')
      await expect(validateSourceFile(link, 'video')).rejects.toMatchObject({
        code: 'symlink',
      })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EPERM') throw error
    }
  })

  it('resolves work paths and rejects traversal', () => {
    const libraryPath = join(dir, 'library')
    const workPath = resolveWorkPath(context(libraryPath), '电影')
    expect(workPath).toBe(join(libraryPath, '电影'))

    expect(() => resolveWorkAssetPath(workPath, '../outside.txt')).toThrow(HttpError)
    expect(() => resolveWorkAssetPath(workPath, '/absolute.txt')).toThrow(HttpError)
    expect(resolveWorkAssetPath(workPath, 'extras/clip.mp4')).toBe(
      join(workPath, 'extras', 'clip.mp4'),
    )
  })

  it('copies atomically and can replace an existing file', async () => {
    const source = join(dir, 'source.txt')
    const target = join(dir, 'target.txt')
    await writeFile(source, 'new')
    await writeFile(target, 'old')

    await expect(copyFileAtomic(source, target)).rejects.toMatchObject({ code: 'asset-exists' })
    expect(await readFile(target, 'utf8')).toBe('old')

    await copyFileAtomic(source, target, { replace: true })
    expect(await readFile(target, 'utf8')).toBe('new')
  })

  it('sanitizes names and appends suffixes for conflicts', async () => {
    expect(sanitizeFileName('a<b>c.mp4')).toBe('a-b-c.mp4')

    const targetDir = join(dir, 'extras')
    await mkdir(targetDir)
    await writeFile(join(targetDir, 'clip.mp4'), 'a')
    expect(await uniqueFileName(targetDir, 'clip.mp4')).toBe('clip-2.mp4')
    expect(await exists(join(targetDir, 'clip-2.mp4'))).toBe(false)
  })
})
