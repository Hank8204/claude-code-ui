import { describe, it, expect } from 'vitest'
import { extractUsage, buildSnapshot } from './usage.js'

describe('extractUsage', () => {
  it('擷取 assistant 行的 usage 與 model', () => {
    const row = {
      type: 'assistant',
      message: {
        model: 'claude-sonnet-5-20260101',
        usage: {
          input_tokens: 2,
          cache_creation_input_tokens: 43386,
          cache_read_input_tokens: 0,
          output_tokens: 328
        }
      }
    }
    expect(extractUsage(row)).toEqual({
      model: 'claude-sonnet-5-20260101',
      usage: {
        inputTokens: 2,
        cacheCreationInputTokens: 43386,
        cacheReadInputTokens: 0,
        outputTokens: 328
      }
    })
  })

  it('非 assistant 行回傳 null', () => {
    expect(extractUsage({ type: 'user', message: {} })).toBeNull()
  })

  it('缺欄位時以 0 補齊，不拋錯', () => {
    const result = extractUsage({ type: 'assistant', message: { usage: {} } })
    expect(result?.usage).toEqual({
      inputTokens: 0,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
      outputTokens: 0
    })
    expect(result?.model).toBeNull()
  })

  it('壞型別的 usage 物件不會炸', () => {
    expect(() => extractUsage({ type: 'assistant', message: { usage: 'nope' } })).not.toThrow()
  })
})

describe('buildSnapshot', () => {
  it('已知 model：佔用率 = (input + cache_read + cache_creation) / context_window', () => {
    const snap = buildSnapshot(
      'claude-sonnet-5',
      {
        inputTokens: 10_000,
        cacheReadInputTokens: 50_000,
        cacheCreationInputTokens: 40_000,
        outputTokens: 999
      },
      0.12
    )
    expect(snap.contextRatio).toBeCloseTo(100_000 / 200_000)
    expect(snap.totalCostUsd).toBe(0.12)
  })

  it('未知 model：contextRatio 為 null（走「未知」降級，不觸發 burnout）', () => {
    const snap = buildSnapshot('some-future-model', {
      inputTokens: 1,
      cacheReadInputTokens: 1,
      cacheCreationInputTokens: 1,
      outputTokens: 1
    }, 0)
    expect(snap.contextRatio).toBeNull()
  })

  it('佔用率上限夾在 1', () => {
    const snap = buildSnapshot('claude-sonnet-5', {
      inputTokens: 500_000,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
      outputTokens: 0
    }, 0)
    expect(snap.contextRatio).toBe(1)
  })
})
