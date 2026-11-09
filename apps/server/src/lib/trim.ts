import { access, mkdir, mkdtemp, readdir, rm, stat, unlink, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'

import { planTrimOutputs, sortSegments, type TrimExportKind, type TrimSegment } from '@gallery/core'

import { TMP_DIR } from './data-dirs.js'
import { HttpError } from './errors.js'
import { FfmpegError, runFfmpeg } from './ffmpeg.js'

export interface TrimExportInput {
  path: string
  kind: TrimExportKind
  segments: TrimSegment[]
}

export interface TrimOutput {
  name: string
  path: string
  size: number
}

export interface TrimExportResult {
  outputs: TrimOutput[]
  failed: Array<{ index: number; message: string }>
}

function formatSeconds(value: number): string {
  return value.toFixed(3)
}

function segmentArgs(path: string, segment: TrimSegment, output: string): string[] {
  return [
    '-ss',
    formatSeconds(segment.start),
    '-i',
    path,
    '-t',
    formatSeconds(segment.end - segment.start),
    '-map',
    '0:v:0?',
    '-map',
    '0:a:0?',
    '-c',
    'copy',
    '-avoid_negative_ts',
    'make_zero',
    '-n',
    output,
  ]
}

function ffmpegDetail(error: unknown): string {
  if (error instanceof FfmpegError) {
    return error.detail ? `FFmpeg 导出失败：${error.detail}` : 'FFmpeg 导出失败'
  }
  return error instanceof Error ? `导出失败：${error.message}` : '导出失败'
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function removeIfExists(path: string): Promise<void> {
  try {
    await unlink(path)
  } catch {
    // 文件不存在或无法删除时忽略，避免覆盖原始导出错误。
  }
}

async function outputInfo(path: string): Promise<TrimOutput> {
  const info = await stat(path)
  return { name: basename(path), path, size: info.size }
}

function concatLine(path: string): string {
  // concat demuxer 使用单引号包裹路径，反斜杠统一转为正斜杠，路径内的单引号需要转义。
  const normalized = path.replace(/\\/g, '/').replace(/'/g, "'\\''")
  return `file '${normalized}'`
}

async function exportSeparate(
  input: TrimExportInput,
  sorted: TrimSegment[],
  names: string[],
): Promise<TrimExportResult> {
  const dir = dirname(input.path)
  const outputs: TrimOutput[] = []
  const failed: TrimExportResult['failed'] = []

  for (const [index, segment] of sorted.entries()) {
    const name = names[index]
    if (!name) continue

    const output = join(dir, name)
    const existed = await fileExists(output)

    try {
      await runFfmpeg(segmentArgs(input.path, segment, output))
      outputs.push(await outputInfo(output))
    } catch (error) {
      if (!existed) await removeIfExists(output)
      failed.push({ index: index + 1, message: ffmpegDetail(error) })
    }
  }

  return { outputs, failed }
}

async function exportMerged(
  input: TrimExportInput,
  sorted: TrimSegment[],
  name: string,
): Promise<TrimExportResult> {
  const dir = dirname(input.path)
  const output = join(dir, name)
  const extension = extname(input.path)
  const existed = await fileExists(output)
  let tempDir: string | null = null

  try {
    await mkdir(TMP_DIR, { recursive: true })
    tempDir = await mkdtemp(join(TMP_DIR, 'trim-'))

    const parts: string[] = []

    for (const [index, segment] of sorted.entries()) {
      const part = join(tempDir, `${String(index + 1).padStart(4, '0')}${extension}`)
      await runFfmpeg(segmentArgs(input.path, segment, part))
      parts.push(part)
    }

    if (parts.length === 0) {
      throw new HttpError(400, 'empty-selection', '请至少添加一个片段')
    }

    const listPath = join(tempDir, 'concat.txt')
    await writeFile(listPath, `${parts.map(concatLine).join('\n')}\n`, 'utf8')

    await runFfmpeg([
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      listPath,
      '-c',
      'copy',
      '-n',
      output,
    ])

    return { outputs: [await outputInfo(output)], failed: [] }
  } catch (error) {
    if (!existed) await removeIfExists(output)

    if (error instanceof HttpError) throw error
    throw new HttpError(422, 'trim-failed', ffmpegDetail(error))
  } finally {
    if (tempDir) {
      try {
        await rm(tempDir, { recursive: true, force: true })
      } catch {
        // 清理失败不影响已经返回的导出结果，残留目录可手动删除。
      }
    }
  }
}

/** 按片段起止时间导出到源文件目录；逐段模式允许部分失败，合并模式失败即中止。 */
export async function exportTrim(input: TrimExportInput): Promise<TrimExportResult> {
  const sorted = sortSegments(input.segments)
  const dir = dirname(input.path)
  const existingNames = await readdir(dir)
  const plan = planTrimOutputs({
    fileName: basename(input.path),
    kind: input.kind,
    segments: sorted,
    existingNames,
  })

  if (input.kind === 'merged') {
    const name = plan.names[0]
    if (!name) {
      throw new HttpError(400, 'empty-selection', '请至少添加一个片段')
    }
    return exportMerged(input, sorted, name)
  }

  return exportSeparate(input, sorted, plan.names)
}
