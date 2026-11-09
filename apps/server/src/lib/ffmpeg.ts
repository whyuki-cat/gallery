import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import ffmpegStatic from 'ffmpeg-static'

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

export class FfmpegError extends Error {
  readonly stderr: string
  readonly detail: string

  constructor(detail: string, stderr: string) {
    super(detail || 'FFmpeg 执行失败')
    this.name = 'FfmpegError'
    this.detail = detail
    this.stderr = stderr
  }
}

function lastMeaningfulLine(stderr: string): string {
  const lines = stderr
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  return lines.at(-1) ?? ''
}

const MAX_OUTPUT_BYTES = 10 * 1024 * 1024

/** 以参数数组执行 FFmpeg，避免 shell 拼接；失败时保留 stderr 供调用方记录。 */
export async function runFfmpeg(
  args: string[],
  options: { timeout?: number } = {},
): Promise<{ stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execFileAsync(ffmpegBinary, args, {
      timeout: options.timeout,
      maxBuffer: MAX_OUTPUT_BYTES,
      windowsHide: true,
    })

    return { stdout: String(stdout), stderr: String(stderr) }
  } catch (error) {
    const stderr = (error as { stderr?: unknown }).stderr
    const text = typeof stderr === 'string' ? stderr : ''
    throw new FfmpegError(lastMeaningfulLine(text), text)
  }
}
