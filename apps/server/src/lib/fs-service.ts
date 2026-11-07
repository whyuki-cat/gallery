import { access, lstat, readdir } from 'node:fs/promises'
import { homedir, platform } from 'node:os'
import { basename, dirname, extname, join } from 'node:path'

import { HttpError } from './errors.js'
import { assertNotSymbolicLink, resolveUserPath } from './paths.js'

export const MAX_STAT_BATCH = 200

export interface Location {
  name: string
  path: string
}

export interface RootsResponse {
  platform: string
  roots: Location[]
  common: Location[]
}

export interface FsEntry {
  name: string
  type: 'file' | 'directory'
  extension: string
}

export interface DirectoryListing {
  path: string
  parent: string | null
  entries: FsEntry[]
}

export interface StatResult {
  path: string
  name: string
  size: number | null
  mtimeMs: number | null
  birthtimeMs: number | null
  directory: boolean
  error: string | null
}

const HIDDEN_NAMES = new Set([
  '$RECYCLE.BIN',
  'SYSTEM VOLUME INFORMATION',
  '$WINREAGENT',
  'RECOVERY',
  'PAGEFILE.SYS',
  'HIBERFIL.SYS',
  'SWAPFILE.SYS',
  'DESKTOP.INI',
])

function isHidden(name: string): boolean {
  if (name.startsWith('.')) return true
  return HIDDEN_NAMES.has(name.toUpperCase())
}

export async function listRoots(): Promise<RootsResponse> {
  const roots: Location[] = []

  if (platform() === 'win32') {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
    const detected = await Promise.all(
      letters.map(async (letter) => {
        const path = `${letter}:\\`
        try {
          await access(path)
          return { name: `${letter}:`, path }
        } catch {
          return null
        }
      }),
    )
    for (const item of detected) {
      if (item) roots.push(item)
    }
  } else {
    roots.push({ name: '/', path: '/' })
  }

  const home = homedir()
  const candidates: Array<[string, string]> = [
    ['主目录', home],
    ['桌面', join(home, 'Desktop')],
    ['下载', join(home, 'Downloads')],
    ['视频', join(home, 'Videos')],
    ['图片', join(home, 'Pictures')],
    ['文档', join(home, 'Documents')],
  ]

  const common: Location[] = []
  for (const [name, path] of candidates) {
    try {
      await access(path)
      common.push({ name, path })
    } catch {
      // 目录不存在时跳过
    }
  }

  return { platform: platform(), roots, common }
}

export async function listDirectory(
  input: string,
  options: { showHidden?: boolean } = {},
): Promise<DirectoryListing> {
  const dir = resolveUserPath(input)
  await assertNotSymbolicLink(dir)
  const dirents = await readdir(dir, { withFileTypes: true })
  const showHidden = options.showHidden ?? false

  const entries: FsEntry[] = []

  for (const dirent of dirents) {
    if (dirent.isSymbolicLink()) continue
    if (!showHidden && isHidden(dirent.name)) continue

    let type: FsEntry['type'] | null = null
    if (dirent.isDirectory()) type = 'directory'
    else if (dirent.isFile()) type = 'file'
    if (!type) continue

    entries.push({
      name: dirent.name,
      type,
      extension: type === 'file' ? extname(dirent.name).slice(1).toLowerCase() : '',
    })
  }

  entries.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
    return a.name.localeCompare(b.name, 'zh-CN', { numeric: true })
  })

  const parent = dirname(dir)

  return {
    path: dir,
    parent: parent === dir ? null : parent,
    entries,
  }
}

export async function statPaths(paths: string[]): Promise<StatResult[]> {
  if (paths.length > MAX_STAT_BATCH) {
    throw new HttpError(400, 'batch-too-large', `单次最多查询 ${MAX_STAT_BATCH} 个路径`)
  }

  return Promise.all(
    paths.map(async (input): Promise<StatResult> => {
      const path = resolveUserPath(input)
      const name = basename(path)

      try {
        const info = await lstat(path)
        if (info.isSymbolicLink()) {
          return {
            path,
            name,
            size: null,
            mtimeMs: null,
            birthtimeMs: null,
            directory: false,
            error: 'symlink',
          }
        }
        return {
          path,
          name,
          size: info.size,
          mtimeMs: info.mtimeMs,
          birthtimeMs: info.birthtimeMs,
          directory: info.isDirectory(),
          error: null,
        }
      } catch {
        return {
          path,
          name,
          size: null,
          mtimeMs: null,
          birthtimeMs: null,
          directory: false,
          error: 'unreadable',
        }
      }
    }),
  )
}
