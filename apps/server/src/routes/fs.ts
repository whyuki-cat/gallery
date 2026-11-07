import { createReadStream } from 'node:fs'
import { lstat } from 'node:fs/promises'

import type { FastifyPluginAsync } from 'fastify'

import { HttpError } from '../lib/errors.js'
import { listDirectory, listRoots, statPaths } from '../lib/fs-service.js'
import { mimeForPath } from '../lib/mime.js'
import { resolveUserPath } from '../lib/paths.js'
import { getThumbnail, hasFfmpeg } from '../lib/thumbs.js'

interface ListQuery {
  path?: string
  hidden?: string
}

interface StatsBody {
  paths?: unknown
}

interface RawQuery {
  path?: string
}

interface ThumbQuery {
  path?: string
  w?: string
}

export const fsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/roots', async () => {
    const roots = await listRoots()
    return { ...roots, capabilities: { thumbnail: true, videoThumbnail: await hasFfmpeg() } }
  })

  app.get('/list', async (request) => {
    const query = request.query as ListQuery
    const showHidden = query.hidden === '1' || query.hidden === 'true'
    return listDirectory(query.path ?? '', { showHidden })
  })

  app.post('/stats', async (request) => {
    const body = request.body as StatsBody | undefined
    const paths = Array.isArray(body?.paths)
      ? body.paths.filter((value): value is string => typeof value === 'string')
      : []

    return { items: await statPaths(paths) }
  })

  app.get('/raw', async (request, reply) => {
    const query = request.query as RawQuery
    const filePath = resolveUserPath(query.path)
    const info = await lstat(filePath)

    if (info.isSymbolicLink()) {
      throw new HttpError(403, 'symlink', '不允许访问符号链接')
    }

    if (!info.isFile()) {
      throw new HttpError(400, 'not-a-file', '目标不是文件')
    }

    reply.header('Accept-Ranges', 'bytes')
    reply.header('Content-Type', mimeForPath(filePath))

    const range = request.headers.range
    if (!range) {
      reply.header('Content-Length', info.size)
      return reply.send(createReadStream(filePath))
    }

    const match = /^bytes=(\d*)-(\d*)$/.exec(range)
    if (!match) {
      throw new HttpError(416, 'invalid-range', '无法解析 Range 请求头')
    }

    const start = match[1] ? Number(match[1]) : 0
    const end = match[2] ? Math.min(Number(match[2]), info.size - 1) : info.size - 1

    if (Number.isNaN(start) || Number.isNaN(end) || start >= info.size || start > end) {
      reply.header('Content-Range', `bytes */${info.size}`)
      throw new HttpError(416, 'range-not-satisfiable', '请求范围无效')
    }

    reply.code(206)
    reply.header('Content-Range', `bytes ${start}-${end}/${info.size}`)
    reply.header('Content-Length', end - start + 1)
    return reply.send(createReadStream(filePath, { start, end }))
  })

  app.get('/thumb', async (request, reply) => {
    const query = request.query as ThumbQuery
    const requested = Number(query.w ?? '320')
    const width = Math.min(1024, Math.max(32, Number.isFinite(requested) ? requested : 320))

    const thumb = await getThumbnail(query.path ?? '', width)

    reply.header('Content-Type', 'image/jpeg')
    reply.header('Cache-Control', 'public, max-age=86400')
    reply.header('X-Thumb-Cache', thumb.cached ? 'hit' : 'miss')
    return reply.send(createReadStream(thumb.filePath))
  })
}
