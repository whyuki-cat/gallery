import { readdir, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'

import {
  applyRules,
  resolveConflicts,
  type ConflictStrategy,
  type RenameIssue,
  type RenameOp,
} from '@gallery/core'
import type { FastifyPluginAsync } from 'fastify'

import { HttpError } from '../lib/errors.js'
import { assertNotSymbolicLink, resolveUserPath } from '../lib/paths.js'
import { executeRename } from '../lib/rename-executor.js'

interface ApplyBody {
  dir?: unknown
  names?: unknown
  operations?: unknown
  strategy?: unknown
}

interface SingleBody {
  dir?: unknown
  from?: unknown
  to?: unknown
}

const STRATEGIES: ConflictStrategy[] = ['block', 'skip', 'auto-index']

function readStrategy(value: unknown): ConflictStrategy {
  return STRATEGIES.includes(value as ConflictStrategy)
    ? (value as ConflictStrategy)
    : 'block'
}

export const renameRoutes: FastifyPluginAsync = async (app) => {
  app.post('/apply', async (request, reply) => {
    const body = (request.body ?? {}) as ApplyBody
    const dir = resolveUserPath(body.dir)
    await assertNotSymbolicLink(dir)

    const names = Array.isArray(body.names)
      ? body.names.filter((value): value is string => typeof value === 'string')
      : []
    const operations = Array.isArray(body.operations) ? (body.operations as RenameOp[]) : []

    if (names.length === 0) {
      throw new HttpError(400, 'empty-selection', '请先选择需要重命名的文件')
    }

    for (const name of names) {
      if (name.includes('/') || name.includes('\\') || name === '.' || name === '..') {
        throw new HttpError(400, 'invalid-name', `非法的文件名：${name}`)
      }
    }

    const dirents = await readdir(dir, { withFileTypes: true })
    const availableNames = new Set(
      dirents
        .filter((dirent) => !dirent.isSymbolicLink() && (dirent.isFile() || dirent.isDirectory()))
        .map((dirent) => dirent.name),
    )

    const missing = names.filter((name) => !availableNames.has(name))
    if (missing.length > 0) {
      throw new HttpError(409, 'stale-selection', `以下文件或文件夹已不存在：${missing.join('、')}`)
    }

    const stats = await Promise.all(
      names.map((name) => stat(join(dir, name)).catch(() => null)),
    )
    const parentName = basename(dir)
    const engineIssues: RenameIssue[] = []

    const entries = names.map((name, index) => {
      const info = stats[index]
      const result = applyRules(
        name,
        index,
        {
          parentName,
          size: info?.isFile() ? info.size : undefined,
          date: info?.mtime,
        },
        operations,
      )
      engineIssues.push(...result.issues)
      return { source: name, target: result.name }
    })

    if (engineIssues.some((issue) => issue.code === 'invalid-regex')) {
      return reply
        .code(400)
        .send({ error: 'invalid-rule', message: '规则中存在无效的正则表达式' })
    }

    const selected = new Set(names)
    const existingNames = dirents
      .filter((dirent) => !dirent.isSymbolicLink())
      .map((dirent) => dirent.name)
      .filter((name) => !selected.has(name))

    const plan = resolveConflicts(entries, {
      strategy: readStrategy(body.strategy),
      existingNames,
      caseInsensitive: true,
    })

    if (plan.blocking) {
      return reply.code(409).send({
        error: 'conflicts',
        message: '存在无法自动解决的命名冲突',
        items: plan.items.filter((item) => !item.skipped && item.issues.length > 0),
      })
    }

    const pairs = plan.items
      .filter((item) => !item.skipped && item.source !== item.target)
      .map((item) => ({ from: item.source, to: item.target }))
    const skipped = plan.items.filter((item) => item.skipped).map((item) => item.source)

    if (pairs.length === 0) {
      return {
        renamed: [],
        skipped,
        failed: [],
        rolledBack: false,
        warnings: engineIssues,
        message: '没有需要改名的文件',
      }
    }

    const result = await executeRename({ dir, pairs })

    return { ...result, skipped, warnings: engineIssues }
  })

  app.post('/single', async (request, reply) => {
    const body = (request.body ?? {}) as SingleBody
    const dir = resolveUserPath(body.dir)
    await assertNotSymbolicLink(dir)

    const from = typeof body.from === 'string' ? body.from : ''
    const to = typeof body.to === 'string' ? body.to : ''

    if (from.trim() === '' || to.trim() === '') {
      throw new HttpError(400, 'invalid-name', '请填写新的文件名')
    }

    for (const name of [from, to]) {
      if (name.includes('/') || name.includes('\\') || name === '.' || name === '..') {
        throw new HttpError(400, 'invalid-name', `非法的文件名：${name}`)
      }
    }

    if (from === to) {
      return { renamed: [], skipped: [], failed: [], rolledBack: false, message: '名称未变化' }
    }

    const dirents = await readdir(dir, { withFileTypes: true })
    const availableNames = new Set(
      dirents
        .filter((dirent) => !dirent.isSymbolicLink() && (dirent.isFile() || dirent.isDirectory()))
        .map((dirent) => dirent.name),
    )

    if (!availableNames.has(from)) {
      throw new HttpError(409, 'stale-selection', '文件或文件夹已不存在，请刷新后重试')
    }

    const existingNames = dirents
      .filter((dirent) => !dirent.isSymbolicLink())
      .map((dirent) => dirent.name)
      .filter((name) => name !== from)

    const plan = resolveConflicts([{ source: from, target: to }], {
      strategy: 'block',
      existingNames,
      caseInsensitive: true,
    })

    if (plan.blocking) {
      return reply.code(409).send({
        error: 'conflicts',
        message: plan.items[0]?.issues[0]?.message ?? '目标名称不可用',
        items: plan.items,
      })
    }

    const result = await executeRename({ dir, pairs: [{ from, to }] })

    return { ...result, skipped: [] }
  })
}
