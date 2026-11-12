import { XMLParser, XMLValidator } from 'fast-xml-parser'
import type { WorkMetadata, WorkPerson } from '@gallery/core'

import { MAX_NFO_BYTES } from './work-storage.js'

export interface NfoParseResult {
  metadata: WorkMetadata | null
  error: string | null
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  trimValues: true,
  parseTagValue: false,
  parseAttributeValue: false,
  processEntities: false,
})

type XmlValue = string | number | boolean | Record<string, unknown> | XmlValue[] | null | undefined

function asArray(value: XmlValue): XmlValue[] {
  if (value === undefined || value === null) return []
  return Array.isArray(value) ? value : [value]
}

function asRecord(value: XmlValue): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return null
}

function text(value: XmlValue): string | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed === '' ? null : trimmed
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const textValue = record['#text']
  if (typeof textValue === 'string' || typeof textValue === 'number') {
    const trimmed = String(textValue).trim()
    return trimmed === '' ? null : trimmed
  }
  return null
}

function numberValue(value: XmlValue): number | null {
  const raw = text(value)
  if (raw === null) return null
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : null
}

function strings(value: XmlValue): string[] {
  return asArray(value)
    .map((item) => text(item))
    .filter((item): item is string => item !== null)
}

function people(value: XmlValue): WorkPerson[] {
  const result: WorkPerson[] = []
  for (const item of asArray(value)) {
    const record = asRecord(item)
    if (!record) {
      const name = text(item)
      if (name) result.push({ name, role: null })
      continue
    }
    const name = text(record.name as XmlValue)
    if (!name) continue
    result.push({ name, role: text(record.role as XmlValue) })
  }
  return result
}

function uniqueIds(value: XmlValue): Array<{ type: string; value: string }> {
  const result: Array<{ type: string; value: string }> = []
  for (const item of asArray(value)) {
    const record = asRecord(item)
    if (record) {
      const rawValue = text(record['#text'] as XmlValue) ?? text(record.value as XmlValue)
      const type = text(record['@_type'] as XmlValue) ?? 'unknown'
      if (rawValue) result.push({ type, value: rawValue })
    } else {
      const rawValue = text(item)
      if (rawValue) result.push({ type: 'unknown', value: rawValue })
    }
  }
  return result
}

function directRating(value: XmlValue): number | null {
  const direct = numberValue(value)
  if (direct !== null) return direct

  const record = asRecord(value)
  if (!record) return null

  const fromAttribute = record['@_value']
  if (typeof fromAttribute === 'string' || typeof fromAttribute === 'number') {
    const parsed = Number(fromAttribute)
    if (Number.isFinite(parsed)) return parsed
  }

  return numberValue(record.rating as XmlValue)
}

function parseYear(record: Record<string, unknown>): number | null {
  const year = numberValue(record.year as XmlValue)
  if (year !== null) return year

  const premiered = text(record.premiered as XmlValue) ?? text(record.releasedate as XmlValue)
  const match = premiered?.match(/^(\d{4})/)
  return match ? Number(match[1]) : null
}

export function parseNfo(input: string): NfoParseResult {
  if (Buffer.byteLength(input, 'utf8') > MAX_NFO_BYTES) {
    return { metadata: null, error: 'NFO 文件不能超过 2 MB' }
  }
  if (input.trim() === '') {
    return { metadata: null, error: 'NFO 内容为空' }
  }

  const validation = XMLValidator.validate(input)
  if (validation !== true) {
    return { metadata: null, error: 'NFO 不是有效的 XML 文件' }
  }

  let parsed: unknown
  try {
    parsed = parser.parse(input)
  } catch {
    return { metadata: null, error: '无法解析 NFO 文件' }
  }

  const root = asRecord(parsed as XmlValue)
  const movie = root ? asRecord(root.movie as XmlValue) : null
  const record = movie ?? root
  if (!record) {
    return { metadata: null, error: 'NFO 缺少有效的电影节点' }
  }

  const metadata: WorkMetadata = {
    title: text(record.title as XmlValue),
    originalTitle: text(record.originaltitle as XmlValue),
    sortTitle: text(record.sorttitle as XmlValue),
    year: parseYear(record),
    premiered:
      text(record.premiered as XmlValue) ?? text(record.releasedate as XmlValue),
    plot: text(record.plot as XmlValue),
    outline: text(record.outline as XmlValue),
    tagline: text(record.tagline as XmlValue),
    runtimeMinutes: numberValue(record.runtime as XmlValue),
    rating: directRating(record.rating as XmlValue),
    genres: strings(record.genre as XmlValue),
    directors: strings(record.director as XmlValue),
    writers: strings(record.writer as XmlValue),
    actors: people(record.actor as XmlValue),
    studios: strings(record.studio as XmlValue),
    mpaa: text(record.mpaa as XmlValue),
    uniqueIds: uniqueIds(record.uniqueid as XmlValue),
  }

  return { metadata, error: null }
}
