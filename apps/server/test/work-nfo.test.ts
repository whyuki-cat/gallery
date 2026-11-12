import { describe, expect, it } from 'vitest'

import { MAX_NFO_BYTES } from '../src/lib/work-storage.js'
import { parseNfo } from '../src/lib/work-nfo.js'

describe('parseNfo', () => {
  it('maps common movie fields', () => {
    const result = parseNfo(`<?xml version="1.0" encoding="utf-8"?>
<movie>
  <title>星际穿越</title>
  <originaltitle>Interstellar</originaltitle>
  <year>2014</year>
  <premiered>2014-11-07</premiered>
  <plot>一支探险队穿越虫洞。</plot>
  <runtime>169</runtime>
  <rating>8.7</rating>
  <genre>科幻</genre>
  <genre>冒险</genre>
  <director>克里斯托弗·诺兰</director>
  <writer>乔纳森·诺兰</writer>
  <actor><name>马修·麦康纳</name><role>库珀</role></actor>
  <studio>Paramount</studio>
  <mpaa>PG-13</mpaa>
  <uniqueid type="tmdb">157336</uniqueid>
</movie>`)

    expect(result.error).toBeNull()
    expect(result.metadata?.title).toBe('星际穿越')
    expect(result.metadata?.originalTitle).toBe('Interstellar')
    expect(result.metadata?.year).toBe(2014)
    expect(result.metadata?.runtimeMinutes).toBe(169)
    expect(result.metadata?.rating).toBe(8.7)
    expect(result.metadata?.genres).toEqual(['科幻', '冒险'])
    expect(result.metadata?.actors).toEqual([{ name: '马修·麦康纳', role: '库珀' }])
    expect(result.metadata?.uniqueIds).toEqual([{ type: 'tmdb', value: '157336' }])
  })

  it('returns an error for empty, invalid and oversized NFO', () => {
    expect(parseNfo('   ').error).toContain('为空')
    expect(parseNfo('<movie><title>缺少闭合').error).toContain('XML')
    expect(parseNfo(`<movie><title>${'a'.repeat(MAX_NFO_BYTES)}</title></movie>`).error).toContain(
      '2 MB',
    )
  })
})
