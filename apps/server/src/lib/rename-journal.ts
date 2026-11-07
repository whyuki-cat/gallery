import { randomUUID } from 'node:crypto'
import { mkdir, readdir, readFile, appendFile } from 'node:fs/promises'
import { join } from 'node:path'

import { RENAME_LOG_DIR } from './data-dirs.js'

export interface RenameRecord {
  id: string
  at: string
  dir: string
  pairs: Array<{ from: string; to: string }>
  status: 'applied' | 'undone'
  undoOf?: string
}

export function createRecord(
  dir: string,
  pairs: RenameRecord['pairs'],
  status: RenameRecord['status'] = 'applied',
  undoOf?: string,
): RenameRecord {
  return {
    id: randomUUID(),
    at: new Date().toISOString(),
    dir,
    pairs,
    status,
    ...(undoOf === undefined ? {} : { undoOf }),
  }
}

function logFileFor(date: string): string {
  return `${date.slice(0, 10)}.jsonl`
}

export async function appendRecord(record: RenameRecord, logDir = RENAME_LOG_DIR): Promise<void> {
  await mkdir(logDir, { recursive: true })
  await appendFile(join(logDir, logFileFor(record.at)), `${JSON.stringify(record)}\n`, 'utf8')
}

async function listLogFiles(logDir: string): Promise<string[]> {
  try {
    const names = await readdir(logDir)
    return names.filter((name) => name.endsWith('.jsonl')).sort().reverse()
  } catch {
    return []
  }
}

/** 按从新到旧返回记录。 */
export async function readRecords(limit = 50, logDir = RENAME_LOG_DIR): Promise<RenameRecord[]> {
  const files = await listLogFiles(logDir)
  const records: RenameRecord[] = []

  for (const file of files) {
    let content = ''
    try {
      content = await readFile(join(logDir, file), 'utf8')
    } catch {
      continue
    }

    const lines = content.split('\n').filter((line) => line.trim() !== '')

    for (let index = lines.length - 1; index >= 0; index -= 1) {
      try {
        records.push(JSON.parse(lines[index] as string) as RenameRecord)
      } catch {
        // 跳过损坏的行，不影响其他记录
      }
      if (records.length >= limit) return records
    }
  }

  return records
}

/** 找到最近一条尚未被撤销的成功记录。 */
export async function findLatestUndoable(
  logDir = RENAME_LOG_DIR,
): Promise<RenameRecord | null> {
  const records = await readRecords(1000, logDir)
  const undone = new Set(
    records
      .filter((record) => record.status === 'undone' && record.undoOf)
      .map((record) => record.undoOf as string),
  )

  return (
    records.find((record) => record.status === 'applied' && !undone.has(record.id)) ?? null
  )
}
