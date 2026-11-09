import { createHash } from 'node:crypto'
import { access, lstat, mkdir } from 'node:fs/promises'
import { join } from 'node:path'

import sharp from 'sharp'

import { THUMB_DIR } from './data-dirs.js'
import { HttpError } from './errors.js'
import { hasFfmpeg, runFfmpeg } from './ffmpeg.js'
import { isImagePath, isVideoPath } from './mime.js'
import { resolveUserPath } from './paths.js'

export interface ThumbResult {
  filePath: string
  cached: boolean
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

/** 生成或复用缩略图。缓存键包含路径、修改时间、大小与宽度。 */
export async function getThumbnail(input: string, width: number): Promise<ThumbResult> {
  const path = resolveUserPath(input)
  const info = await lstat(path)

  if (info.isSymbolicLink()) {
    throw new HttpError(403, 'symlink', '不允许访问符号链接')
  }

  if (!info.isFile()) {
    throw new HttpError(400, 'not-a-file', '目标不是文件')
  }

  const key = createHash('sha1')
    .update(`${path}|${info.mtimeMs}|${info.size}|${width}`)
    .digest('hex')
  const target = join(THUMB_DIR, `${key}.jpg`)

  if (await fileExists(target)) {
    return { filePath: target, cached: true }
  }

  await mkdir(THUMB_DIR, { recursive: true })

  if (isImagePath(path)) {
    await sharp(path)
      .rotate()
      .resize({ width, withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toFile(target)
    return { filePath: target, cached: false }
  }

  if (isVideoPath(path)) {
    if (!(await hasFfmpeg())) {
      throw new HttpError(503, 'thumb-unavailable', '缺少 ffmpeg，无法生成视频缩略图')
    }
    await runFfmpeg(
      ['-y', '-ss', '00:00:01', '-i', path, '-frames:v', '1', '-vf', `scale=${width}:-2`, target],
      { timeout: 20000 },
    )
    return { filePath: target, cached: false }
  }

  throw new HttpError(415, 'thumb-unsupported', '该文件类型不支持缩略图')
}
