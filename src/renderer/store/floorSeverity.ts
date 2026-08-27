import type { SessionSnapshot } from '@shared/types.js'

/** 樓層彙總嚴重度，數字越小越該醒目提示（spec_02 §3A）。 */
export enum Severity {
  WaitingInput = 1,
  Error = 2,
  Burnout = 3,
  Working = 4,
  Idle = 5
}

function severityOf(session: SessionSnapshot): Severity {
  if (session.state === 'waiting_input') return Severity.WaitingInput
  if (session.state === 'error') return Severity.Error
  if (session.isBurnout) return Severity.Burnout
  if (session.state === 'working' || session.state === 'committing') return Severity.Working
  return Severity.Idle
}

export interface FloorSummary {
  severity: Severity
  waitingCount: number
  total: number
  label: string
}

/**
 * 即時把每個 session 化約成一個嚴重度，取樓層內最高者（spec_02 §3A）。
 * 不得快取成獨立欄位——每次 render 由子 session 重新計算。
 */
export function summarizeFloor(sessions: SessionSnapshot[]): FloorSummary {
  const live = sessions.filter((s) => s.state !== 'disconnected')
  const severity = live.reduce<Severity>(
    (acc, s) => Math.min(acc, severityOf(s)) as Severity,
    Severity.Idle
  )
  const waitingCount = live.filter((s) => s.state === 'waiting_input').length

  return {
    severity,
    waitingCount,
    total: sessions.length,
    label: buildLabel(sessions.length, waitingCount)
  }
}

function buildLabel(total: number, waiting: number): string {
  if (total === 0) return '無 session'
  const base = `${total} 個 session`
  return waiting > 0 ? `${base} · ${waiting} 個等待確認` : base
}
