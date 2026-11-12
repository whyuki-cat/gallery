import { createReadStream } from 'node:fs'

import type { FastifyPluginAsync, FastifyReply } from 'fastify'
import {
  isWorkAssetRole,
  isWorkKind,
  type AddWorkAssetInput,
  type CreateMovieWorkInput,
  type WorkKind,
} from '@gallery/core'

import type { DatabaseService } from '../lib/db.js'
import { HttpError } from '../lib/errors.js'
import { sendFile } from '../lib/file-stream.js'
import { getThumbnail } from '../lib/thumbs.js'
import type { WorkImportManager } from '../lib/work-import-service.js'
import {
  addWorkAsset,
  deleteWork,
  getWorkAssetByRole,
  getWorkAssetFile,
  getWorkDetail,
  getWorkNfoText,
  getWorkSubtitleVtt,
  listWorks,
  removeWorkAsset,
  renameWork,
} from '../lib/work-service.js'

export interface WorksRoutesOptions {
  database: DatabaseService
  imports: WorkImportManager
}

interface LibraryIdParams {
  libraryId: string
}

interface WorkIdParams {
  workId: string
}

interface AssetParams extends WorkIdParams {
  assetId: string
}

interface ImportParams {
  importId: string
}

interface WorkListQuery {
  kind?: string
  q?: string
  search?: string
  sort?: string
}

interface AssetBody {
  role?: unknown
  sourcePath?: unknown
  language?: unknown
}

function imageWidth(value: unknown, fallback: number, max: number): number {
  const requested = Number(value ?? fallback)
  return Math.min(max, Math.max(32, Number.isFinite(requested) ? requested : fallback))
}

async function sendImage(
  reply: FastifyReply,
  sourcePath: string,
  width: number,
) {
  const thumb = await getThumbnail(sourcePath, width)
  reply.header('Content-Type', 'image/jpeg')
  reply.header('Cache-Control', 'private, max-age=0, must-revalidate')
  reply.header('X-Thumb-Cache', thumb.cached ? 'hit' : 'miss')
  return reply.send(createReadStream(thumb.filePath))
}

export const worksRoutes: FastifyPluginAsync<WorksRoutesOptions> = async (app, options) => {
  const db = () => options.database.get()

  app.get<{ Params: LibraryIdParams; Querystring: WorkListQuery }>(
    '/library/:libraryId/works',
    async (request) => {
      const query = request.query
      let kind: WorkKind | undefined
      if (query.kind !== undefined && query.kind !== '') {
        if (!isWorkKind(query.kind)) {
          throw new HttpError(400, 'invalid-work-kind', '作品类别无效')
        }
        kind = query.kind
      }
      const sort =
        query.sort === 'name' || query.sort === 'year' || query.sort === 'created'
          ? query.sort
          : 'created'
      return listWorks(db(), request.params.libraryId, {
        kind,
        search: query.q ?? query.search,
        sort,
      })
    },
  )

  app.post<{ Params: LibraryIdParams }>(
    '/library/:libraryId/works/imports',
    async (request, reply) => {
      const body = (request.body ?? {}) as Record<string, unknown>
      const name = typeof body.name === 'string' ? body.name : ''
      const videoPath = typeof body.videoPath === 'string' ? body.videoPath : ''
      const kind = body.kind === 'movie' ? 'movie' : ''
      if (kind !== 'movie') {
        throw new HttpError(400, 'unsupported-work-kind', '本期只支持电影作品')
      }
      const input: CreateMovieWorkInput = { name, kind, videoPath }
      const view = await options.imports.start(request.params.libraryId, input)
      reply.code(202)
      return view
    },
  )

  app.get<{ Params: ImportParams }>('/works/imports/:importId', async (request) => {
    return options.imports.get(request.params.importId)
  })

  app.get<{ Params: WorkIdParams }>('/works/:workId', async (request) => {
    return getWorkDetail(db(), request.params.workId)
  })

  app.patch<{ Params: WorkIdParams }>('/works/:workId', async (request) => {
    const body = (request.body ?? {}) as { name?: unknown }
    return renameWork(db(), request.params.workId, {
      name: typeof body.name === 'string' ? body.name : '',
    })
  })

  app.post<{ Params: WorkIdParams }>('/works/:workId/delete', async (request) => {
    return deleteWork(db(), request.params.workId)
  })

  app.post<{ Params: WorkIdParams }>('/works/:workId/assets', async (request, reply) => {
    const body = (request.body ?? {}) as AssetBody
    if (typeof body.role !== 'string' || !isWorkAssetRole(body.role) || body.role === 'video') {
      throw new HttpError(400, 'invalid-asset-role', '资源类型无效')
    }
    if (typeof body.sourcePath !== 'string') {
      throw new HttpError(400, 'invalid-source', '请选择要添加的文件')
    }
    const input: AddWorkAssetInput = {
      role: body.role,
      sourcePath: body.sourcePath,
      language: typeof body.language === 'string' ? body.language : undefined,
    }
    const asset = await addWorkAsset(db(), request.params.workId, input)
    reply.code(201)
    return { asset }
  })

  app.delete<{ Params: AssetParams }>(
    '/works/:workId/assets/:assetId',
    async (request) => {
      await removeWorkAsset(db(), request.params.workId, request.params.assetId)
      return { ok: true }
    },
  )

  app.get<{ Params: WorkIdParams }>('/works/:workId/video', async (request, reply) => {
    const file = await getWorkAssetByRole(db(), request.params.workId, 'video')
    return sendFile(request, reply, file.filePath)
  })

  app.get<{ Params: WorkIdParams; Querystring: { w?: string } }>(
    '/works/:workId/thumbnail',
    async (request, reply) => {
      const file = await getWorkAssetByRole(db(), request.params.workId, 'video')
      return sendImage(reply, file.filePath, imageWidth(request.query.w, 480, 1024))
    },
  )

  app.get<{ Params: WorkIdParams; Querystring: { w?: string } }>(
    '/works/:workId/poster',
    async (request, reply) => {
      const file = await getWorkAssetByRole(db(), request.params.workId, 'poster')
      return sendImage(reply, file.filePath, imageWidth(request.query.w, 600, 1600))
    },
  )

  app.get<{ Params: WorkIdParams; Querystring: { w?: string } }>(
    '/works/:workId/backdrop',
    async (request, reply) => {
      const file = await getWorkAssetByRole(db(), request.params.workId, 'backdrop')
      return sendImage(reply, file.filePath, imageWidth(request.query.w, 1600, 2560))
    },
  )

  app.get<{ Params: WorkIdParams }>('/works/:workId/nfo', async (request, reply) => {
    const text = await getWorkNfoText(db(), request.params.workId)
    reply.header('Content-Type', 'text/plain; charset=utf-8')
    return text
  })

  app.get<{ Params: AssetParams }>(
    '/works/:workId/subtitles/:assetId',
    async (request, reply) => {
      const vtt = await getWorkSubtitleVtt(
        db(),
        request.params.workId,
        request.params.assetId,
      )
      reply.header('Content-Type', 'text/vtt; charset=utf-8')
      return vtt
    },
  )

  app.get<{ Params: AssetParams; Querystring: { w?: string } }>(
    '/works/:workId/assets/:assetId/thumb',
    async (request, reply) => {
      const file = await getWorkAssetFile(db(), request.params.workId, request.params.assetId)
      return sendImage(reply, file.filePath, imageWidth(request.query.w, 320, 1024))
    },
  )

  app.get<{ Params: AssetParams }>(
    '/works/:workId/assets/:assetId',
    async (request, reply) => {
      const file = await getWorkAssetFile(db(), request.params.workId, request.params.assetId)
      return sendFile(request, reply, file.filePath)
    },
  )
}
