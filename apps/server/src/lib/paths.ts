import { lstat } from 'node:fs/promises'
import { isAbsolute, relative, resolve } from 'node:path'

import { HttpError } from './errors.js'

export interface ResolveOptions {
  /** 可选的访问白名单；省略时允许任意绝对路径。 */
  roots?: string[]
}

export function isInside(root: string, target: string): boolean {
  const rel = relative(root, target)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

/** 校验并规范化用户提交的路径。 */
export function resolveUserPath(input: unknown, options: ResolveOptions = {}): string {
  if (typeof input !== 'string' || input.trim() === '') {
    throw new HttpError(400, 'invalid-path', '路径不能为空')
  }
  if (input.includes('\0')) {
    throw new HttpError(400, 'invalid-path', '路径包含非法字符')
  }
  if (!isAbsolute(input)) {
    throw new HttpError(400, 'invalid-path', '必须使用绝对路径')
  }

  const resolved = resolve(input)

  if (options.roots && options.roots.length > 0) {
    const allowed = options.roots.some((root) => isInside(resolve(root), resolved))
    if (!allowed) {
      throw new HttpError(403, 'outside-root', '路径超出允许范围')
    }
  }

  return resolved
}

export async function isSymbolicLink(path: string): Promise<boolean> {
  try {
    return (await lstat(path)).isSymbolicLink()
  } catch {
    return false
  }
}

export async function assertNotSymbolicLink(path: string): Promise<void> {
  if (await isSymbolicLink(path)) {
    throw new HttpError(403, 'symlink', '不允许访问符号链接')
  }
}
