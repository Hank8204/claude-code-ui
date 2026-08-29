import { describe, it, expect } from 'vitest'
import { parseUsageReport, extractResult } from './usageReport.js'

const SAMPLE = `You are currently using your subscription to power your Claude Code usage

Current session: 91% used · resets Aug 29 at 8pm (Asia/Taipei)
Current week (all models): 8% used · resets Sep 5 at 4am (Asia/Taipei)

What's contributing to your limits usage?

Last 24h · 282 requests · 4 sessions
  92% of your usage was at >150k context
Last 7d · 1910 requests · 28 sessions`

describe('parseUsageReport', () => {
  it('擷取 session 與 week 額度', () => {
    const r = parseUsageReport(SAMPLE, 1000)
    expect(r.fetchedAt).toBe(1000)
    expect(r.session).toEqual({ percent: 91, resetsAt: 'Aug 29 at 8pm (Asia/Taipei)' })
    expect(r.week).toEqual({ percent: 8, resetsAt: 'Sep 5 at 4am (Asia/Taipei)' })
    expect(r.raw).toContain('Last 7d')
  })

  it('欄位缺失時回 null，不丟錯', () => {
    const r = parseUsageReport('沒有任何額度資訊', 5)
    expect(r.session).toBeNull()
    expect(r.week).toBeNull()
    expect(r.raw).toBe('沒有任何額度資訊')
  })

  it('空字串安全處理', () => {
    const r = parseUsageReport('', 0)
    expect(r).toEqual({ fetchedAt: 0, session: null, week: null, raw: '' })
  })

  it('百分比為 0 也算有效', () => {
    const r = parseUsageReport('Current session: 0% used · resets tomorrow', 1)
    expect(r.session).toEqual({ percent: 0, resetsAt: 'tomorrow' })
  })
})

describe('extractResult（stdout 可能夾雜額外行）', () => {
  it('單行 JSON', () => {
    expect(extractResult('{"result":"hello","x":1}')).toBe('hello')
  })

  it('JSON 後面多一行雜訊 → 仍取得 result', () => {
    expect(extractResult('{"result":"ok"}\nsome trailing warning\n')).toBe('ok')
  })

  it('前面有警告行、後面才是 JSON', () => {
    expect(extractResult('WARN: something\n{"result":"ok"}')).toBe('ok')
  })

  it('沒有可用 JSON → 空字串', () => {
    expect(extractResult('not json at all')).toBe('')
  })
})
