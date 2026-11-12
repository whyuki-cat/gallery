import { createReadStream } from 'node:fs'

import type { FastifyPluginAsync } from 'fastify'

import { hasFfmpeg } from '../lib/ffmpeg.js'
import { deleteFiles, listDirectory, listRoots, statPaths } from '../lib/fs-service.js'
import { sendFile } from '../lib/file-stream.js'
import { resolveUserPath } from '../lib/paths.js'
import { getThumbnail } from '../lib/thumbs.js'

interface ListQuery {
  path?: string
  hidden?: string
}

interface StatsBody {
  paths?: unknown
}

interface DeleteBody {
  dir?: unknown
  names?: unknown
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
    const ffmpeg = await hasFfmpeg()
    return { ...roots, capabilities: { thumbnail: true, videoThumbnail: ffmpeg, ffmpeg } }
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

  app.post('/delete', async (request) => {
    const body = (request.body ?? {}) as DeleteBody
    const names = Array.isArray(body.names)
      ? body.names.filter((value): value is string => typeof value === 'string')
      : []

    return deleteFiles(body.dir, names)
  })

  app.get('/raw', async (request, reply) => {
    const query = request.query as RawQuery
    return sendFile(request, reply, resolveUserPath(query.path))
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
