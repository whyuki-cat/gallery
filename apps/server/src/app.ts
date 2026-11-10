import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import cors from '@fastify/cors'
import fastifyStatic from '@fastify/static'
import Fastify from 'fastify'

import { HttpError } from './lib/errors.js'
import { DatabaseService } from './lib/db.js'
import { MigrationManager } from './lib/migration-service.js'
import { fsRoutes } from './routes/fs.js'
import { healthRoutes } from './routes/health.js'
import { libraryRoutes } from './routes/library.js'
import { renameRoutes } from './routes/rename.js'
import { trimRoutes } from './routes/trim.js'

/**
 * 生产模式下由后端直接托管前端构建产物，单进程即可运行。
 * 路径相对于本文件：apps/server/{src,dist}/app.ts -> apps/web/dist
 */
const webDist = fileURLToPath(new URL('../../web/dist', import.meta.url))

const CLIENT_HEADER = 'x-gallery-client'

function isLocalOrigin(origin: string): boolean {
  try {
    const url = new URL(origin)
    return (
      url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '::1'
    )
  } catch {
    return false
  }
}

export async function buildApp(
  options: { dbPath?: string; initializeDatabase?: boolean } = {},
) {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
    },
  })

  const database = new DatabaseService(options.dbPath)
  const migrations = new MigrationManager(database)

  if (options.initializeDatabase) {
    try {
      database.get()
    } catch (error) {
      app.log.error(error)
    }
  }

  app.addHook('onClose', async () => {
    database.close()
  })

  await app.register(cors, {
    origin: (origin, callback) => {
      if (!origin || isLocalOrigin(origin)) {
        callback(null, true)
        return
      }
      callback(null, false)
    },
  })

  // 变更类请求必须携带自定义头：浏览器无法在跨站请求中静默添加它，
  // 因此可以拦住来自其他站点的表单提交与简单请求。
  app.addHook('onRequest', async (request, reply) => {
    if (request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS') {
      return
    }
    if (request.headers[CLIENT_HEADER] === '1') {
      return
    }
    return reply.code(403).send({ error: 'forbidden', message: '缺少客户端标识' })
  })

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof HttpError) {
      return reply.code(error.statusCode).send({ error: error.code, message: error.message })
    }

    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') {
      return reply.code(404).send({ error: 'not-found', message: '路径或文件不存在' })
    }
    if (code === 'EACCES' || code === 'EPERM') {
      return reply.code(403).send({ error: 'forbidden', message: '没有访问权限' })
    }
    if (code === 'EBUSY') {
      return reply.code(409).send({ error: 'busy', message: '文件正被其他程序占用' })
    }

    const statusCode = (error as { statusCode?: number }).statusCode
    if (typeof statusCode === 'number' && statusCode >= 400 && statusCode < 500) {
      return reply
        .code(statusCode)
        .send({ error: 'bad-request', message: error instanceof Error ? error.message : '请求无效' })
    }

    request.log.error(error)
    return reply.code(500).send({ error: 'internal', message: '服务器内部错误' })
  })

  await app.register(healthRoutes, { prefix: '/api' })
  await app.register(fsRoutes, { prefix: '/api/fs' })
  await app.register(renameRoutes, { prefix: '/api/rename' })
  await app.register(trimRoutes, { prefix: '/api/trim' })
  await app.register(libraryRoutes, {
    prefix: '/api/library',
    database,
    migrations,
  })

  if (existsSync(webDist)) {
    await app.register(fastifyStatic, { root: webDist })

    app.setNotFoundHandler((request, reply) => {
      if (request.method === 'GET' && !request.url.startsWith('/api')) {
        // SPA history fallback
        return reply.sendFile('index.html')
      }
      return reply.code(404).send({ error: 'Not Found' })
    })
  }

  return app
}
