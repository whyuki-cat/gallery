export interface RenamePair {
  from: string
  to: string
}

/**
 * 判断改名集合是否需要借助中间名。
 *
 * 只要某个目标名同时也是某个源文件名（大小写不敏感），直接改名就可能覆盖尚未处理的文件：
 * 交换（a<->b）、链式依赖（a->b, b->c）以及仅大小写变更（a.mp4 -> A.mp4）都属于这种情况。
 */
export function needsIntermediateNames(
  pairs: RenamePair[],
  caseInsensitive = true,
): boolean {
  if (pairs.length === 0) return false

  const normalize = (value: string) => (caseInsensitive ? value.toLowerCase() : value)
  const sources = new Set(pairs.map((pair) => normalize(pair.from)))

  return pairs.some((pair) => sources.has(normalize(pair.to)))
}
