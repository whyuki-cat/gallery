import { lstat } from 'node:fs/promises'

import { validateSegments, type TrimSegment } from '@gallery/core'
import type { FastifyPluginAsync } from 'fastify'

import { HttpError } from '../lib/errors.js'
import { hasFfmpeg } from '../lib/ffmpeg.js'
import { isVideoPath } from '../lib/mime.js'
import { resolveUserPath } from '../lib/paths.js'
import { exportTrim } from '../lib/trim.js'

type TrimExportKind = 'separate' | 'merged'

interface ExportBody {
  path?: unknown
  output?: unknown
  segments?: unknown
}

function readKind(value: unknown): TrimExportKind {
  if (value === 'separate' || value === 'merged') return value
  throw new HttpError(400, 'invalid-output', '导出方式必须是逐段导出或合并导出')
}

export const trimRoutes: FastifyPluginAsync = async (app) => {
  app.post('/export', async (request, reply) => {
    const body = (request.body ?? {}) as ExportBody
    const path = resolveUserPath(body.path)
    const info = await lstat(path)

    if (info.isSymbolicLink()) {
      throw new HttpError(403, 'symlink', '不允许访问符号链接')
    }
    if (!info.isFile()) {
      throw new HttpError(400, 'not-a-file', '目标不是普通文件')
    }
    if (!isVideoPath(path)) {
      throw new HttpError(415, 'not-a-video', '该文件不是受支持的视频格式')
    }

    const issues = validateSegments(body.segments)
    if (issues.length > 0) {
      return reply.code(400).send({
        error: 'invalid-segments',
        message: issues[0]?.message ?? '片段无效',
        issues,
      })
    }

    const kind = readKind(body.output)

    if (!(await hasFfmpeg())) {
      throw new HttpError(503, 'ffmpeg-unavailable', '当前环境缺少 FFmpeg，无法导出')
    }

    const result = await exportTrim({
      path,
      kind,
      segments: body.segments as TrimSegment[],
    })

    return result
  })
}
