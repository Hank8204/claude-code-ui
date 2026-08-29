import { useState } from 'react'
import type { SessionSnapshot, SessionState } from '@shared/types.js'
import { AgentAvatar } from './AgentAvatar.js'
import { StaminaBar } from './StaminaBar.js'
import { SessionControlsBar } from './SessionControlsBar.js'
import { RoomToolbar } from './RoomToolbar.js'

const LIVE_STATES = new Set(['idle', 'working', 'committing', 'waiting_input'])

const STATE_LABEL: Record<SessionState, string> = {
  idle: 'IDLE',
  working: 'WORKING',
  committing: 'COMMITTING',
  waiting_input: 'WAITING',
  error: 'ERROR',
  disconnected: 'DISCONNECTED'
}

interface Props {
  session: SessionSnapshot
  onOpenTerminal: (sessionId: string) => void
}

/**
 * 單一 session 的工位（spec_02 §3B）。
 * OfficeRoom 對應 session，不是專案——AgentAvatar / StaminaBar / TerminalView 全部 1:1。
 *
 * Claude Design 改版：預設以 compact 名牌卡片顯示，點擊展開為完整工位；
 * 展開後小人舞台改為 .status-row 狀態列（點擊仍開啟終端機）。
 */
export function OfficeRoom({ session, onOpenTerminal }: Props): JSX.Element {
  const [editing, setEditing] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const openTerminal = (): void => {
    if (session.readonly || session.state === 'disconnected') return
    onOpenTerminal(session.sessionId)
  }

  const isLive = LIVE_STATES.has(session.state)
  const statusLabel = session.isBurnout ? 'BURNOUT' : STATE_LABEL[session.state]

  const commitRename = (value: string): void => {
    setEditing(false)
    const next = value.trim()
    if (next && next !== session.displayName) {
      void window.ccui.renameSession(session.sessionId, next)
    }
  }

  if (!expanded) {
    return (
      <button
        type="button"
        className="compact-card"
        data-burnout={session.isBurnout}
        onClick={() => setExpanded(true)}
        aria-label={`展開 ${session.displayName}`}
      >
        <span className="expand-hint" aria-hidden="true">
          ⤢
        </span>
        <AgentAvatar
          state={session.state}
          isBurnout={session.isBurnout}
          displayName={session.displayName}
        />
      </button>
    )
  }

  return (
    <div
      className="office-room"
      data-state={session.state}
      data-burnout={session.isBurnout}
    >
      <div className="room-titlebar">
        {editing ? (
          <input
            autoFocus
            defaultValue={session.displayName}
            onBlur={(e) => commitRename(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && commitRename(e.currentTarget.value)}
          />
        ) : (
          <button type="button" className="room-name" onClick={() => setEditing(true)}>
            {session.displayName}
          </button>
        )}
        {session.readonly && <span className="readonly-badge">唯讀</span>}
        <button
          type="button"
          className="collapse-btn"
          title="收合工位"
          onClick={() => setExpanded(false)}
        >
          收合
        </button>
        {!session.readonly &&
          session.state !== 'disconnected' &&
          session.state !== 'error' && (
            <button
              type="button"
              className="stop-btn"
              title="關閉：連送兩次 Ctrl-C（執行中先中斷 turn，接著讓 claude 直接跳出）"
              onClick={() => void window.ccui.closeSession(session.sessionId)}
            >
              關閉 (Ctrl-C×2)
            </button>
          )}
      </div>

      {!session.readonly && session.state !== 'error' && (
        <SessionControlsBar
          sessionId={session.sessionId}
          controls={session.controls}
          disabled={session.state === 'disconnected'}
        />
      )}

      <button
        type="button"
        className="status-row"
        data-state={session.state}
        onClick={openTerminal}
        disabled={session.readonly}
        aria-label={session.readonly ? '唯讀 session' : '開啟終端機'}
      >
        <span className="status-dot" aria-hidden="true" />
        <span className="status-label">{statusLabel}</span>
      </button>

      {(session.state === 'error' || session.state === 'disconnected') && !session.readonly && (
        <div className="room-actions">
          <button
            type="button"
            className="restart-btn"
            onClick={() => void window.ccui.restartSession(session.sessionId)}
          >
            {session.state === 'error' ? '重啟' : '接回'}
          </button>
          {session.state === 'disconnected' && (
            <button
              type="button"
              className="forget-btn"
              onClick={() => void window.ccui.forgetSession(session.sessionId)}
            >
              移除
            </button>
          )}
        </div>
      )}

      {isLive && !session.readonly && (
        <RoomToolbar sessionId={session.sessionId} compactAlert={session.isBurnout} />
      )}

      <StaminaBar
        usage={session.usage}
        stale={session.usageStale}
        readonly={session.readonly}
        onCompact={() => void window.ccui.compact(session.sessionId)}
      />
    </div>
  )
}
