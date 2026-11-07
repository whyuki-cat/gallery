import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { access, lstat, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'

import ffmpegStatic from 'ffmpeg-static'
import sharp from 'sharp'

import { THUMB_DIR } from './data-dirs.js'
import { HttpError } from './errors.js'
import { isImagePath, isVideoPath } from './mime.js'
import { resolveUserPath } from './paths.js'

const execFileAsync = promisify(execFile)

// ffmpeg-static 的声明文件是 CJS + default 导出，NodeNext 下类型推断会拿到模块命名空间，
// 运行时 default 导入实际就是二进制路径，因此这里收窄为字符串。
const bundledFfmpeg = ffmpegStatic as unknown as string | null

/**
 * 默认使用 ffmpeg-static 随包分发的二进制，避免依赖系统安装。
 * FFMPEG_PATH 可用于覆盖为系统 ffmpeg，便于调试或精简安装包。
 */
const ffmpegBinary = process.env.FFMPEG_PATH?.trim() || bundledFfmpeg || 'ffmpeg'

let ffmpegAvailable: boolean | null = null

export async function hasFfmpeg(): Promise<boolean> {
  if (ffmpegAvailable !== null) return ffmpegAvailable
  try {
    await execFileAsync(ffmpegBinary, ['-version'], { timeout: 10000 })
    ffmpegAvailable = true
  } catch {
    ffmpegAvailable = false
  }
  return ffmpegAvailable
}

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
    await execFileAsync(
      ffmpegBinary,
      ['-y', '-ss', '00:00:01', '-i', path, '-frames:v', '1', '-vf', `scale=${width}:-2`, target],
      { timeout: 20000 },
    )
    return { filePath: target, cached: false }
  }

  throw new HttpError(415, 'thumb-unsupported', '该文件类型不支持缩略图')
}
