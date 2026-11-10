import type { FastifyPluginAsync } from 'fastify'
import type { LibraryOrganization, LibraryType } from '@gallery/core'

import type { DatabaseService } from '../lib/db.js'
import {
  buildOverview,
  createLibrary,
  deleteLibrary,
  getLibraryView,
  setMediaRootConfig,
  updateLibrary,
} from '../lib/library-service.js'
import type { MigrationManager } from '../lib/migration-service.js'
import { setDeletePassword } from '../lib/security-service.js'

export interface LibraryRoutesOptions {
  database: DatabaseService
  migrations: MigrationManager
}

interface IdParams {
  id: string
}

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  return value.filter((item): item is string => typeof item === 'string')
}

export const libraryRoutes: FastifyPluginAsync<LibraryRoutesOptions> = async (app, options) => {
  const db = () => options.database.get()

  app.get('/overview', async () => {
    const database = db()
    const migration = await options.migrations.latest()
    return buildOverview(database, options.database.path, migration)
  })

  app.put('/config', async (request) => {
    const body = (request.body ?? {}) as { mediaRoot?: unknown; create?: unknown }
    await setMediaRootConfig(db(), body)
    return { ok: true }
  })

  app.put('/security', async (request) => {
    const body = (request.body ?? {}) as {
      currentPassword?: unknown
      newPassword?: unknown
    }
    setDeletePassword(db(), body)
    return { configured: true }
  })

  app.post('/libraries', async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, unknown>
    const library = await createLibrary(db(), {
      name: typeof body.name === 'string' ? body.name : '',
      organization: body.organization as LibraryOrganization,
      type: (body.type as LibraryType | null | undefined) ?? null,
      sources: stringArray(body.sources),
    })
    reply.code(201)
    return getLibraryView(db(), library)
  })

  app.patch<{ Params: IdParams }>('/libraries/:id', async (request) => {
    const body = (request.body ?? {}) as Record<string, unknown>
    const library = await updateLibrary(db(), request.params.id, {
      name: typeof body.name === 'string' ? body.name : undefined,
      type: 'type' in body ? (body.type as LibraryType | null) : undefined,
      sources: stringArray(body.sources),
      ...body,
    })
    return getLibraryView(db(), library)
  })

  app.post<{ Params: IdParams }>('/libraries/:id/delete', async (request) => {
    const body = (request.body ?? {}) as { password?: unknown }
    return deleteLibrary(db(), request.params.id, body.password)
  })

  app.post('/config/migrate', async (request, reply) => {
    const body = (request.body ?? {}) as { mediaRoot?: unknown; password?: unknown }
    const result = await options.migrations.start(body)
    reply.code(202)
    return { migrationId: result.id }
  })

  app.get<{ Params: IdParams }>('/config/migrate/:id', async (request) => {
    return options.migrations.get(request.params.id)
  })
}
