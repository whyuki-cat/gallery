import { constants } from 'node:fs'
import { access, cp, lstat, mkdir, rm, rmdir } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

import type Database from 'better-sqlite3'
import type { MigrationState, MigrationView } from '@gallery/core'

import { HttpError } from './errors.js'
import { withTransaction } from './db.js'
import type { DatabaseService } from './db.js'
import { resolveUserPath } from './paths.js'
import { assertDeletePassword } from './security-service.js'
import {
  findLibrary,
  findMigration,
  getLatestMigration,
  getMediaRoot,
  insertMigration,
  insertMigrationItem,
  listActiveMigrations,
  listCollectionFolders,
  listMigrationItems,
  listSourcesForLibraries,
  setMediaRoot,
  updateMigrationItem,
  updateMigrationState,
} from './library-repository.js'
import {
  containsPath,
  probeRoot,
  sameNormalizedPath,
} from './library-service.js'

interface MigrationJob {
  current: number
  total: number
  currentLibraryName: string | null
}

async function lstatSafe(path: string) {
  try {
    return await lstat(path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '未知错误'
}

export class MigrationManager {
  private readonly jobs = new Map<string, MigrationJob>()
  private recoveryPromise: Promise<void> | null = null
  private starting = false

  constructor(private readonly database: DatabaseService) {}

  async latest(): Promise<MigrationView | null> {
    await this.ensureRecovered()
    const row = getLatestMigration(this.database.get())
    return row ? this.toView(this.database.get(), row.id) : null
  }

  async get(id: string): Promise<MigrationView> {
    await this.ensureRecovered()
    const view = this.toView(this.database.get(), id)
    if (!view) {
      throw new HttpError(404, 'migration-not-found', '迁移任务不存在')
    }
    return view
  }

  async start(input: { mediaRoot?: unknown; password?: unknown }): Promise<{ id: string }> {
    if (this.starting) {
      throw new HttpError(409, 'migration-in-progress', '已有迁移任务正在准备')
    }

    this.starting = true
    try {
      return await this.startInternal(input)
    } finally {
      this.starting = false
    }
  }

  private async startInternal(input: {
    mediaRoot?: unknown
    password?: unknown
  }): Promise<{ id: string }> {
    await this.ensureRecovered()
    const db = this.database.get()

    const oldRoot = getMediaRoot(db)
    if (!oldRoot) {
      throw new HttpError(400, 'root-not-configured', '请先在设置中配置媒体根路径')
    }

    const oldStatus = await probeRoot(oldRoot)
    if (oldStatus !== 'ok') {
      throw new HttpError(400, 'root-unavailable', '旧媒体根路径当前不可用，无法迁移')
    }

    if (listActiveMigrations(db).length > 0) {
      throw new HttpError(409, 'migration-in-progress', '已有迁移任务正在进行')
    }

    const folders = listCollectionFolders(db)
    if (folders.length === 0) {
      throw new HttpError(400, 'migration-conflict', '没有需要迁移的作品集媒体库')
    }

    assertDeletePassword(db, input.password)

    const newRoot = await this.validateNewRoot(input.mediaRoot, oldRoot)
    const createdRoot = newRoot.created

    try {
      await this.preflight(db, oldRoot, newRoot.path, folders)
    } catch (error) {
      if (createdRoot) {
        await rmdir(newRoot.path).catch(() => undefined)
      }
      throw error
    }

    const id = randomUUID()
    const now = new Date().toISOString()

    withTransaction(db, () => {
      insertMigration(db, {
        id,
        from_root: oldRoot,
        to_root: newRoot.path,
        state: 'pending',
        error: null,
        created_at: now,
        updated_at: now,
      })
      for (const folder of folders) {
        insertMigrationItem(db, {
          migration_id: id,
          library_id: folder.id,
          folder: folder.folder,
          state: 'pending',
          error: null,
        })
      }
    })

    this.jobs.set(id, {
      current: 0,
      total: folders.length,
      currentLibraryName: null,
    })

    void this.run(id).catch((error) => {
      this.failRun(id, error)
    })

    return { id }
  }

  private async validateNewRoot(
    input: unknown,
    oldRoot: string,
  ): Promise<{ path: string; created: boolean }> {
    const root = resolveUserPath(input)

    if (sameNormalizedPath(root, oldRoot)) {
      throw new HttpError(400, 'migration-conflict', '新媒体根路径不能与旧路径相同')
    }

    if (containsPath(root, oldRoot) || containsPath(oldRoot, root)) {
      throw new HttpError(409, 'migration-conflict', '新旧媒体根路径不能互相包含')
    }

    const info = await lstatSafe(root)
    if (info?.isSymbolicLink()) {
      throw new HttpError(403, 'symlink', '新媒体根路径不能是符号链接')
    }
    if (info && !info.isDirectory()) {
      throw new HttpError(409, 'migration-conflict', '新媒体根路径不是目录')
    }

    let created = false
    if (!info) {
      await mkdir(root, { recursive: true })
      created = true
    }

    try {
      await access(root, constants.R_OK | constants.W_OK)
    } catch {
      if (created) await rmdir(root).catch(() => undefined)
      throw new HttpError(409, 'migration-conflict', '新媒体根路径不可读写')
    }

    return { path: root, created }
  }

  private async preflight(
    db: Database.Database,
    oldRoot: string,
    newRoot: string,
    folders: Array<{ id: string; folder: string }>,
  ): Promise<void> {
    if (sameNormalizedPath(oldRoot, newRoot)) {
      throw new HttpError(409, 'migration-conflict', '新旧媒体根路径相同')
    }

    for (const folder of folders) {
      const oldPath = join(oldRoot, folder.folder)
      const info = await lstatSafe(oldPath)
      if (!info) {
        throw new HttpError(409, 'migration-conflict', `作品集目录不存在：${oldPath}`)
      }
      if (info.isSymbolicLink()) {
        throw new HttpError(403, 'symlink', `作品集目录不能是符号链接：${oldPath}`)
      }
      if (!info.isDirectory()) {
        throw new HttpError(409, 'migration-conflict', `作品集路径不是目录：${oldPath}`)
      }

      const target = join(newRoot, folder.folder)
      if (await lstatSafe(target)) {
        throw new HttpError(409, 'migration-conflict', `目标目录已存在：${target}`)
      }
    }

    const collectionPaths = new Set(folders.map((folder) => join(oldRoot, folder.folder)))
    for (const source of listSourcesForLibraries(db)) {
      for (const collectionPath of collectionPaths) {
        if (containsPath(source.path, collectionPath) || containsPath(collectionPath, source.path)) {
          throw new HttpError(
            409,
            'source-overlap',
            `文件规范来源与作品集目录重叠，无法迁移：${source.path}`,
          )
        }
      }
    }
  }

  private async run(id: string): Promise<void> {
    const db = this.database.get()
    const migration = findMigration(db, id)
    if (!migration) return

    try {
      updateMigrationState(db, id, 'copying')
      const items = listMigrationItems(db, id)
      const job = this.jobs.get(id)

      for (let index = 0; index < items.length; index += 1) {
        const item = items[index]!
        const library = findLibrary(db, item.library_id)
        if (job) {
          job.currentLibraryName = library?.name ?? item.folder
        }

        const source = join(migration.from_root, item.folder)
        const target = join(migration.to_root, item.folder)

        await cp(source, target, {
          recursive: true,
          force: false,
          errorOnExist: true,
          preserveTimestamps: true,
          dereference: false,
        })

        updateMigrationItem(db, id, item.library_id, 'copied')
        if (job) job.current = index + 1
      }

      updateMigrationState(db, id, 'switching')
      withTransaction(db, () => {
        setMediaRoot(db, migration.to_root)
        updateMigrationState(db, id, 'cleanup')
      })

      await this.cleanup(id)
    } catch (error) {
      await this.handleRunFailure(id, error)
    }
  }

  private async cleanup(id: string): Promise<void> {
    const db = this.database.get()
    const migration = findMigration(db, id)
    if (!migration) return

    const warnings: string[] = []
    const items = listMigrationItems(db, id)
    const job = this.jobs.get(id)

    for (let index = 0; index < items.length; index += 1) {
      const item = items[index]!
      const oldPath = join(migration.from_root, item.folder)
      const info = await lstatSafe(oldPath)

      if (info) {
        try {
          await rm(oldPath, { recursive: true, force: false })
        } catch (error) {
          const message = errorMessage(error)
          warnings.push(`${item.folder}: ${message}`)
          updateMigrationItem(db, id, item.library_id, 'failed', message)
          continue
        }
      }

      updateMigrationItem(db, id, item.library_id, 'cleaned')
      if (job) job.current = index + 1
    }

    updateMigrationState(
      db,
      id,
      warnings.length > 0 ? 'cleanup_failed' : 'succeeded',
      warnings.length > 0 ? warnings.join('；') : null,
    )
    this.jobs.delete(id)
  }

  private async handleRunFailure(id: string, error: unknown): Promise<void> {
    const db = this.database.get()
    const migration = findMigration(db, id)
    if (!migration) return

    if (
      migration.state === 'pending' ||
      migration.state === 'copying' ||
      migration.state === 'switching'
    ) {
      await this.rollbackTargets(db, id, migration.to_root)
      updateMigrationState(db, id, 'failed', errorMessage(error))
    } else {
      updateMigrationState(db, id, 'cleanup_failed', errorMessage(error))
    }

    this.jobs.delete(id)
  }

  private failRun(id: string, error: unknown): void {
    try {
      const db = this.database.get()
      updateMigrationState(db, id, 'failed', errorMessage(error))
    } catch {
      // 数据库本身不可用时无法记录失败，保留原始错误给日志
    }
    this.jobs.delete(id)
  }

  private async rollbackTargets(
    db: Database.Database,
    id: string,
    toRoot: string,
  ): Promise<void> {
    for (const item of listMigrationItems(db, id)) {
      await rm(join(toRoot, item.folder), { recursive: true, force: true }).catch(() => undefined)
    }
  }

  private async ensureRecovered(): Promise<void> {
    if (!this.recoveryPromise) {
      this.recoveryPromise = this.recover().catch((error) => {
        // 恢复失败不应阻止服务启动；后续请求仍可通过 overview 查看迁移记录
        console.error('[gallery] 迁移恢复失败', error)
      })
    }
    return this.recoveryPromise
  }

  private async recover(): Promise<void> {
    const db = this.database.get()

    for (const migration of listActiveMigrations(db)) {
      if (migration.state === 'pending' || migration.state === 'copying') {
        await this.rollbackTargets(db, migration.id, migration.to_root)
        updateMigrationState(db, migration.id, 'interrupted', '服务重启，已回滚复制阶段')
        continue
      }

      if (migration.state === 'switching') {
        const currentRoot = getMediaRoot(db)
        if (currentRoot && sameNormalizedPath(currentRoot, migration.to_root)) {
          await this.cleanup(migration.id)
        } else {
          await this.rollbackTargets(db, migration.id, migration.to_root)
          updateMigrationState(db, migration.id, 'interrupted', '服务重启，已回滚切换阶段')
        }
        continue
      }

      if (migration.state === 'cleanup') {
        await this.cleanup(migration.id)
      }
    }
  }

  private toView(db: Database.Database, id: string): MigrationView | null {
    const row = findMigration(db, id)
    if (!row) return null

    const items = listMigrationItems(db, id)
    const cleaned = items.filter((item) => item.state === 'cleaned').length
    const copied = items.filter(
      (item) => item.state === 'copied' || item.state === 'cleaned',
    ).length

    const current =
      row.state === 'succeeded'
        ? items.length
        : row.state === 'cleanup' || row.state === 'cleanup_failed'
          ? cleaned
          : copied

    return {
      id: row.id,
      state: row.state as MigrationState,
      fromRoot: row.from_root,
      toRoot: row.to_root,
      current,
      total: items.length,
      currentLibraryName: this.jobs.get(id)?.currentLibraryName ?? null,
      error: row.error,
      warnings: items
        .filter((item) => item.error)
        .map((item) => `${item.folder}: ${item.error}`),
    }
  }
}
