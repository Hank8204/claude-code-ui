import { useState } from 'react'
import type { UsageLimit, UsageReport } from '@shared/types.js'

interface Props {
  report: UsageReport | null
  onRefresh: () => Promise<UsageReport | null>
}

/**
 * Dashboard 的帳號用量表——`claude -p "/usage"` 的結果，由 UsagePoller 定期更新。
 * 兩條額度（5 小時 session / 本週）+ 可展開的完整明細。
 */
export function UsagePanel({ report, onRefresh }: Props): JSX.Element {
  const [busy, setBusy] = useState(false)

  const refresh = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    try {
      await onRefresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="usage-panel">
      <header className="usage-head">
        <h2>用量</h2>
        <span className="usage-time">
          {report ? `更新於 ${formatTime(report.fetchedAt)}` : '尚未取得'}
        </span>
        <button
          type="button"
          className="usage-refresh"
          disabled={busy}
          onClick={() => void refresh()}
        >
          {busy ? '更新中…' : '重新整理'}
        </button>
      </header>

      <div className="usage-bars">
        <UsageBar label="這個 session（5 小時）" limit={report?.session ?? null} />
        <UsageBar label="這週（所有模型）" limit={report?.week ?? null} />
      </div>

      {report?.raw && (
        <details className="usage-detail">
          <summary>完整明細</summary>
          <pre>{report.raw}</pre>
        </details>
      )}
    </section>
  )
}

function UsageBar({ label, limit }: { label: string; limit: UsageLimit | null }): JSX.Element {
  const pct = limit ? Math.min(Math.max(limit.percent, 0), 100) : 0
  const zone = pct >= 90 ? 'red' : pct >= 70 ? 'yellow' : 'green'

  return (
    <div className="usage-bar">
      <div className="usage-bar-top">
        <span className="usage-bar-label">{label}</span>
        <span className="usage-bar-pct">{limit ? `${limit.percent}%` : '—'}</span>
      </div>
      <div className="usage-track">
        <div className="usage-fill" data-zone={zone} style={{ width: `${pct}%` }} />
      </div>
      <span className="usage-reset">{limit ? `重置：${limit.resetsAt}` : '無資料'}</span>
    </div>
  )
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
