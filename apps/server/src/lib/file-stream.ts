import { createReadStream } from 'node:fs'
import { lstat } from 'node:fs/promises'

import type { FastifyReply, FastifyRequest } from 'fastify'

import { HttpError } from './errors.js'
import { mimeForPath } from './mime.js'

export async function sendFile(
  request: FastifyRequest,
  reply: FastifyReply,
  filePath: string,
) {
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
}
