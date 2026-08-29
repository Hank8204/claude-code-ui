import { describe, it, expect } from 'vitest'
import {
  sanitizeToolbar,
  sanitizeCustom,
  resolveToolbar,
  CATALOG_IDS,
  TOOLBAR_MAX,
  DEFAULT_TOOLBAR,
  type CustomCommand
} from './toolbar.js'

const known = new Set([...CATALOG_IDS, 'custom-abc'])

describe('sanitizeToolbar', () => {
  it('保留合法 id 的順序', () => {
    expect(sanitizeToolbar(['/review', '/compact'], known)).toEqual(['/review', '/compact'])
  })

  it('丟掉未知 id 與非字串', () => {
    expect(sanitizeToolbar(['/compact', '/nope', 42, null, '/clear'], known)).toEqual([
      '/compact',
      '/clear'
    ])
  })

  it('自訂 id 只要在 known 內就保留', () => {
    expect(sanitizeToolbar(['custom-abc', 'custom-xyz'], known)).toEqual(['custom-abc'])
  })

  it('去重、截到上限', () => {
    const many = ['/compact', '/compact', '/clear', '/rewind', '/review', '/context']
    expect(sanitizeToolbar(many, known)).toEqual(['/compact', '/clear', '/rewind', '/review'])
  })

  it('預設值本身是乾淨的', () => {
    expect(sanitizeToolbar([...DEFAULT_TOOLBAR], CATALOG_IDS)).toEqual([...DEFAULT_TOOLBAR])
  })
})

describe('sanitizeCustom', () => {
  it('保留完整的自訂項、去空白', () => {
    const raw = [{ id: 'c1', label: '  切 Sonnet ', command: ' /model sonnet ' }]
    expect(sanitizeCustom(raw)).toEqual([{ id: 'c1', label: '切 Sonnet', command: '/model sonnet' }])
  })

  it('丟掉缺欄位 / 空字串 / 撞到內建 id 的項', () => {
    const raw = [
      { id: 'c1', label: 'ok', command: '/x' },
      { id: 'c2', label: '', command: '/y' },
      { id: 'c3', label: 'z' },
      { id: '/compact', label: 'dup', command: '/compact' }
    ]
    expect(sanitizeCustom(raw)).toEqual([{ id: 'c1', label: 'ok', command: '/x' }])
  })

  it('非陣列 → 空', () => {
    expect(sanitizeCustom(null)).toEqual([])
    expect(sanitizeCustom('nope')).toEqual([])
  })
})

describe('resolveToolbar', () => {
  const custom: CustomCommand[] = [{ id: 'c1', label: 'ctx', command: '/context' }]

  it('內建 + 自訂混合解析，保順序', () => {
    const defs = resolveToolbar(['/clear', 'c1', '/compact'], custom)
    expect(defs.map((d) => d.id)).toEqual(['/clear', 'c1', '/compact'])
    expect(defs[1]).toMatchObject({ label: 'ctx', command: '/context', custom: true })
  })

  it('丟掉不存在的 id，截到上限', () => {
    const defs = resolveToolbar(['/compact', 'gone', '/clear', '/rewind', '/review', '/cost'], custom)
    expect(defs).toHaveLength(TOOLBAR_MAX)
    expect(defs.map((d) => d.id)).toEqual(['/compact', '/clear', '/rewind', '/review'])
  })
})
