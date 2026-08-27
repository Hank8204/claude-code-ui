import { resolveContextWindow } from '@shared/models.js'
import type { TokenUsage, UsageSnapshot } from '@shared/types.js'

const EMPTY_USAGE: TokenUsage = {
  inputTokens: 0,
  cacheCreationInputTokens: 0,
  cacheReadInputTokens: 0,
  outputTokens: 0
}

/** 從一行已解析的 transcript JSON 物件擷取 usage。非 assistant 行回傳 null。 */
export function extractUsage(row: unknown): { model: string | null; usage: TokenUsage } | null {
  if (!isRecord(row) || row.type !== 'assistant') return null
  const message = isRecord(row.message) ? row.message : {}
  const raw = isRecord(message.usage) ? message.usage : {}

  return {
    model: typeof message.model === 'string' ? message.model : null,
    usage: {
      inputTokens: num(raw.input_tokens),
      cacheCreationInputTokens: num(raw.cache_creation_input_tokens),
      cacheReadInputTokens: num(raw.cache_read_input_tokens),
      outputTokens: num(raw.output_tokens)
    }
  }
}

/**
 * 依 spec_02 §3C 公式計算 context 佔用率。
 * 佔用率 = (input + cache_read + cache_creation) ÷ context_window
 */
export function buildSnapshot(
  model: string | null,
  usage: TokenUsage,
  totalCostUsd: number
): UsageSnapshot {
  const contextWindow = resolveContextWindow(model)
  const consumed =
    usage.inputTokens + usage.cacheReadInputTokens + usage.cacheCreationInputTokens
  const contextRatio =
    contextWindow && contextWindow > 0
      ? Math.min(consumed / contextWindow, 1)
      : null

  return { model, usage, contextRatio, totalCostUsd }
}

export function emptyUsage(): TokenUsage {
  return { ...EMPTY_USAGE }
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
