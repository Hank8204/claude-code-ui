import type { UsageSnapshot } from '@shared/types.js'

interface Props {
  usage: UsageSnapshot | null
  readonly: boolean
  onCompact: () => void
}

type Zone = 'green' | 'yellow' | 'red' | 'unknown'

/**
 * 體力條（spec_02 §3C）。反映 context window 佔用率，不是累計 token 消耗——
 * /compact 之後這個值會真的下降，體力條隨之回血。
 */
export function StaminaBar({ usage, readonly, onCompact }: Props): JSX.Element {
  const ratio = usage?.contextRatio ?? null
  const zone = classifyZone(ratio)
  const width = zone === 'unknown' ? 100 : Math.round((ratio ?? 0) * 100)

  return (
    <div className="stamina">
      <div className="stamina-track">
        <div className="stamina-fill" data-zone={zone} style={{ width: `${width}%` }} />
      </div>
      <div className="stamina-meta">
        <span>{describeRatio(zone, ratio)}</span>
        <span title={usage?.model ?? '未知 model'}>{formatCost(usage)}</span>
      </div>
      {zone === 'red' && !readonly && (
        <button type="button" className="coffee-btn" onClick={onCompact}>
          ☕ 喝咖啡（清理 Context）
        </button>
      )}
    </div>
  )
}

function classifyZone(ratio: number | null): Zone {
  if (ratio === null) return 'unknown'
  if (ratio > 0.8) return 'red'
  if (ratio >= 0.6) return 'yellow'
  return 'green'
}

function describeRatio(zone: Zone, ratio: number | null): string {
  if (zone === 'unknown') return 'Context 未知（model 無對照）'
  return `Context ${Math.round((ratio ?? 0) * 100)}%`
}

function formatCost(usage: UsageSnapshot | null): string {
  if (!usage) return '—'
  return `$${usage.totalCostUsd.toFixed(4)}`
}
