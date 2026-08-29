import { describe, it, expect } from 'vitest'
import { sanitizeUsageInterval, DEFAULT_USAGE_INTERVAL_MS, USAGE_INTERVALS } from './usage.js'

describe('sanitizeUsageInterval', () => {
  it('允許值原樣回傳', () => {
    expect(sanitizeUsageInterval(30_000)).toBe(30_000)
    expect(sanitizeUsageInterval(0)).toBe(0)
  })

  it('不在清單內 → 預設', () => {
    expect(sanitizeUsageInterval(5_000)).toBe(DEFAULT_USAGE_INTERVAL_MS)
    expect(sanitizeUsageInterval(-1)).toBe(DEFAULT_USAGE_INTERVAL_MS)
  })

  it('非數字 → 預設', () => {
    expect(sanitizeUsageInterval('60000')).toBe(DEFAULT_USAGE_INTERVAL_MS)
    expect(sanitizeUsageInterval(null)).toBe(DEFAULT_USAGE_INTERVAL_MS)
    expect(sanitizeUsageInterval(undefined)).toBe(DEFAULT_USAGE_INTERVAL_MS)
  })

  it('預設值本身在允許清單內', () => {
    expect(USAGE_INTERVALS.some((o) => o.ms === DEFAULT_USAGE_INTERVAL_MS)).toBe(true)
  })
})
