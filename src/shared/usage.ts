/**
 * `/usage` 輪詢間隔的可選值與正規化。設定存 renderer localStorage
 * （見 settingsStore），主進程的 UsagePoller 由 renderer 透過 IPC 推入。
 */

export interface UsageIntervalOption {
  /** 毫秒；0 = 不自動更新（只保留手動「重新整理」）。 */
  ms: number
  label: string
}

export const USAGE_INTERVALS: readonly UsageIntervalOption[] = [
  { ms: 30_000, label: '30 秒' },
  { ms: 60_000, label: '1 分鐘' },
  { ms: 180_000, label: '3 分鐘' },
  { ms: 300_000, label: '5 分鐘' },
  { ms: 600_000, label: '10 分鐘' },
  { ms: 0, label: '不自動更新' }
]

export const DEFAULT_USAGE_INTERVAL_MS = 60_000

const ALLOWED = new Set(USAGE_INTERVALS.map((o) => o.ms))

/** 不是允許值就回預設；`/usage` 會算一次 request，不接受任意短間隔。 */
export function sanitizeUsageInterval(ms: unknown): number {
  return typeof ms === 'number' && ALLOWED.has(ms) ? ms : DEFAULT_USAGE_INTERVAL_MS
}
