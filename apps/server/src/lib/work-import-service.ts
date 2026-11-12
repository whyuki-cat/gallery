import { createReadStream, createWriteStream } from 'node:fs'
import { lstat, mkdir, readdir, rename, rm } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'

import {
  generateWorkFolderName,
  normalizeWorkName,
  validateWorkName,
  type CreateMovieWorkInput,
  type WorkImportState,
  type WorkImportView,
} from '@gallery/core'

import type { DatabaseService } from './db.js'
import { withTransaction } from './db.js'
import { HttpError } from './errors.js'
import { getMediaRoot, listCollectionFolders } from './library-repository.js'
import { mimeForPath } from './mime.js'
import {
  insertWork,
  insertWorkAsset,
  listWorkFolderKeys,
} from './work-repository.js'
import {
  WORK_IMPORT_PREFIX,
  getCollectionLibraryContext,
  listWorkDirectoryKeys,
  relativeVideoName,
  resolveWorkPath,
  validateSourceFile,
  type CollectionLibraryContext,
  type SourceFile,
} from './work-storage.js'

interface ImportJob {
  id: string
  libraryId: string
  name: string
  folder: string
  context: CollectionLibraryContext
  source: SourceFile
  state: WorkImportState
  bytesCopied: number
  totalBytes: number
  workId: string | null
  error: string | null
}

function toView(job: ImportJob): WorkImportView {
  return {
    id: job.id,
    state: job.state,
    bytesCopied: job.bytesCopied,
    totalBytes: job.totalBytes,
    workId: job.workId,
    error: job.error,
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof HttpError) return error.message
  if (error instanceof Error && error.message.trim() !== '') return error.message
  return '视频复制失败'
}

export class WorkImportManager {
  private readonly database: DatabaseService
  private readonly jobs = new Map<string, ImportJob>()
  private readonly reserved = new Set<string>()

  constructor(database: DatabaseService) {
    this.database = database
  }

  async start(libraryId: string, input: CreateMovieWorkInput): Promise<WorkImportView> {
    const db = this.database.get()
    const name = normalizeWorkName(input.name)
    const issue = validateWorkName(name)[0]
    if (issue) {
      throw new HttpError(400, issue.code, issue.message)
    }
    if (input.kind !== 'movie') {
      throw new HttpError(400, 'unsupported-work-kind', '本期只支持电影作品')
    }

    const context = await getCollectionLibraryContext(db, libraryId)
    const source = await validateSourceFile(input.videoPath, 'video')
    const reservedKeys = Array.from(this.reserved)
      .filter((key) => key.startsWith(`${libraryId}\0`))
      .map((key) => key.slice(libraryId.length + 1))
    const existingKeys = [
      ...listWorkFolderKeys(db, libraryId),
      ...(await listWorkDirectoryKeys(context.libraryPath)),
      ...reservedKeys,
    ]
    const folder = generateWorkFolderName(name, existingKeys)
    this.reserved.add(`${libraryId}\0${folder.toLocaleLowerCase()}`)

    const job: ImportJob = {
      id: randomUUID(),
      libraryId,
      name,
      folder,
      context,
      source,
      state: 'pending',
      bytesCopied: 0,
      totalBytes: source.size,
      workId: null,
      error: null,
    }
    this.jobs.set(job.id, job)
    void this.run(job)
    return toView(job)
  }

  get(id: string): WorkImportView {
    const job = this.jobs.get(id)
    if (!job) {
      throw new HttpError(404, 'import-not-found', '导入任务不存在')
    }
    return toView(job)
  }

  private async run(job: ImportJob): Promise<void> {
    const tempDir = join(job.context.libraryPath, `${WORK_IMPORT_PREFIX}${job.id}`)
    const finalDir = resolveWorkPath(job.context, job.folder)
    let moved = false

    try {
      await mkdir(tempDir)
      job.state = 'copying'
      const videoName = relativeVideoName(job.folder, job.source.extension)
      const target = join(tempDir, videoName)

      const read = createReadStream(job.source.path)
      read.on('data', (chunk: string | Buffer) => {
        job.bytesCopied += typeof chunk === 'string' ? Buffer.byteLength(chunk) : chunk.length
      })
      await pipeline(read, createWriteStream(target, { flags: 'wx' }))

      const copied = await lstat(target)
      if (copied.size !== job.source.size) {
        throw new HttpError(500, 'copy-size-mismatch', '复制后的视频大小与源文件不一致')
      }

      job.state = 'finalizing'
      await rename(tempDir, finalDir)
      moved = true

      const db = this.database.get()
      const workId = randomUUID()
      const assetId = randomUUID()
      const now = new Date().toISOString()
      withTransaction(db, () => {
        insertWork(db, {
          id: workId,
          libraryId: job.libraryId,
          kind: 'movie',
          name: job.name,
          folder: job.folder,
          folderKey: job.folder.toLocaleLowerCase(),
          year: null,
          metadataJson: null,
          metadataError: null,
          createdAt: now,
          updatedAt: now,
        })
        insertWorkAsset(db, {
          id: assetId,
          workId,
          role: 'video',
          kind: 'video',
          relativePath: videoName,
          originalName: job.source.name,
          mime: mimeForPath(target),
          size: job.source.size,
          language: null,
          label: null,
          position: 0,
          createdAt: now,
        })
      })

      job.workId = workId
      job.state = 'succeeded'
      job.bytesCopied = job.totalBytes
    } catch (error) {
      job.state = 'failed'
      job.error = errorMessage(error)
      await rm(tempDir, { recursive: true, force: true }).catch(() => undefined)
      if (moved) {
        await rm(finalDir, { recursive: true, force: true }).catch(() => undefined)
      }
    } finally {
      this.reserved.delete(`${job.libraryId}\0${job.folder.toLocaleLowerCase()}`)
    }
  }

  async cleanupStale(): Promise<void> {
    const db = this.database.get()
    const libraries = listCollectionFolders(db)
    if (libraries.length === 0) return

    const root = getMediaRoot(db)
    if (!root) return

    for (const library of libraries) {
      const libraryPath = library.folder ? join(root, library.folder) : ''
      if (!libraryPath) continue
      try {
        const entries = await readdir(libraryPath, { withFileTypes: true })
        await Promise.all(
          entries
            .filter((entry) => entry.isDirectory() && entry.name.startsWith(WORK_IMPORT_PREFIX))
            .map((entry) => rm(join(libraryPath, entry.name), { recursive: true, force: true })),
        )
      } catch {
        // 某个媒体库不可读时跳过，启动流程不因清理失败中断
      }
    }
  }
}
