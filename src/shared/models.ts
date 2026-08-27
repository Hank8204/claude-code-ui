/**
 * Context window 對照表（spec_02 §5）。
 * 單一常數模組，不散落在元件裡。未知 model 一律走 fallback：不猜、不當 0。
 */

interface ModelSpec {
  contextWindow: number
}

/** key 以「前綴比對」處理：transcript 的 model 名稱可能帶日期後綴。 */
const MODEL_TABLE: Record<string, ModelSpec> = {
  'claude-opus-4': { contextWindow: 200_000 },
  'claude-opus-5': { contextWindow: 200_000 },
  'claude-sonnet-4': { contextWindow: 200_000 },
  'claude-sonnet-5': { contextWindow: 200_000 },
  'claude-haiku-4': { contextWindow: 200_000 },
  'claude-3-5-sonnet': { contextWindow: 200_000 },
  'claude-3-5-haiku': { contextWindow: 200_000 },
  'claude-3-opus': { contextWindow: 200_000 }
}

/**
 * 依 model 名稱查 context window 大小。
 *
 * @returns 命中對照表時回傳 token 數；未知 model 回傳 null，
 *   呼叫端據此把體力條顯示為「未知」狀態而非猜測。
 */
export function resolveContextWindow(model: string | null | undefined): number | null {
  if (!model) return null
  const hit = Object.keys(MODEL_TABLE).find((prefix) => model.startsWith(prefix))
  return hit ? MODEL_TABLE[hit].contextWindow : null
}
