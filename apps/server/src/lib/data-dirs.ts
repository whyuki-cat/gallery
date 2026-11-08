import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

/**
 * 运行时数据目录，固定在仓库根目录下的 data/（已在 .gitignore 中忽略）。
 * 本文件位于 apps/server/{src,dist}/lib/，向上四级即仓库根目录。
 */
export const DATA_DIR = fileURLToPath(new URL('../../../../data', import.meta.url))
export const THUMB_DIR = join(DATA_DIR, 'thumbs')
