import { randomUUID } from 'node:crypto'
import { rename } from 'node:fs/promises'
import { join } from 'node:path'

import { needsIntermediateNames } from '@gallery/core'

export interface RenamePair {
  from: string
  to: string
}

export interface ExecuteResult {
  renamed: RenamePair[]
  failed: Array<RenamePair & { message: string }>
  rolledBack: boolean
}

export interface ExecuteOptions {
  dir: string
  pairs: RenamePair[]
  operationId?: string
  caseInsensitive?: boolean
}

type PairState = 'pending' | 'temp' | 'final'

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * 执行改名。当目标名与源集合相交时先改临时名再改终名；
 * 任一步失败则尽力把已完成的改名回滚，并报告失败项。
 */
export async function executeRename(options: ExecuteOptions): Promise<ExecuteResult> {
  const { dir, pairs } = options

  if (pairs.length === 0) {
    return { renamed: [], failed: [], rolledBack: false }
  }

  const useTemp = needsIntermediateNames(pairs, options.caseInsensitive ?? true)
  const operationId = options.operationId ?? randomUUID().slice(0, 8)
  const tempOf = (index: number) => join(dir, `.gallery-tmp-${operationId}-${index}`)

  const state: PairState[] = pairs.map(() => 'pending')
  let current = -1
  let failure: unknown = null

  try {
    if (useTemp) {
      for (let index = 0; index < pairs.length; index += 1) {
        current = index
        const pair = pairs[index] as RenamePair
        await rename(join(dir, pair.from), tempOf(index))
        state[index] = 'temp'
      }

      for (let index = 0; index < pairs.length; index += 1) {
        current = index
        const pair = pairs[index] as RenamePair
        await rename(tempOf(index), join(dir, pair.to))
        state[index] = 'final'
      }
    } else {
      for (let index = 0; index < pairs.length; index += 1) {
        current = index
        const pair = pairs[index] as RenamePair
        await rename(join(dir, pair.from), join(dir, pair.to))
        state[index] = 'final'
      }
    }
  } catch (error) {
    failure = error
  }

  if (failure === null) {
    return {
      renamed: pairs.map((pair) => ({ from: pair.from, to: pair.to })),
      failed: [],
      rolledBack: false,
    }
  }

  const failures: ExecuteResult['failed'] = []
  const failedPair = pairs[current] ?? { from: '', to: '' }
  failures.push({ ...failedPair, message: messageOf(failure) })

  let rolledBack = true

  // 第一阶段：把已经改成终名的项目退回临时名。
  if (useTemp) {
    for (let index = 0; index < pairs.length; index += 1) {
      if (state[index] !== 'final') continue
      const pair = pairs[index] as RenamePair
      try {
        await rename(join(dir, pair.to), tempOf(index))
        state[index] = 'temp'
      } catch (error) {
        rolledBack = false
        failures.push({
          from: pair.to,
          to: pair.from,
          message: `回滚失败：${messageOf(error)}`,
        })
      }
    }
  }

  // 第二阶段：把临时名或终名恢复为原名。
  for (let index = 0; index < pairs.length; index += 1) {
    const pair = pairs[index] as RenamePair
    const currentState = state[index]
    if (currentState === 'pending') continue

    const source = currentState === 'final' ? join(dir, pair.to) : tempOf(index)

    try {
      await rename(source, join(dir, pair.from))
      state[index] = 'pending'
    } catch (error) {
      rolledBack = false
      failures.push({
        from: currentState === 'final' ? pair.to : pair.from,
        to: pair.from,
        message: `回滚失败：${messageOf(error)}`,
      })
    }
  }

  return { renamed: [], failed: failures, rolledBack }
}
