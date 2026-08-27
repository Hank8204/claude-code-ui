import { useState } from 'react'
import type { SessionSnapshot } from '@shared/types.js'
import { AgentAvatar } from './AgentAvatar.js'
import { StaminaBar } from './StaminaBar.js'

interface Props {
  session: SessionSnapshot
  onOpenTerminal: (sessionId: string) => void
}

/**
 * 單一 session 的工位（spec_02 §3B）。
 * OfficeRoom 對應 session，不是專案——AgentAvatar / StaminaBar / TerminalView 全部 1:1。
 */
export function OfficeRoom({ session, onOpenTerminal }: Props): JSX.Element {
  const [editing, setEditing] = useState(false)

  const openTerminal = (): void => {
    if (session.readonly) return
    onOpenTerminal(session.sessionId)
  }

  const commitRename = (value: string): void => {
    setEditing(false)
    const next = value.trim()
    if (next && next !== session.displayName) {
      void window.ccui.renameSession(session.sessionId, next)
    }
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
      </div>

      <button
        type="button"
        className="room-stage"
        onClick={openTerminal}
        disabled={session.readonly}
        aria-label={session.readonly ? '唯讀 session' : '開啟終端機'}
      >
        <div className="desk" />
        <AgentAvatar state={session.state} isBurnout={session.isBurnout} />
      </button>

      {session.state === 'error' && !session.readonly && (
        <button
          type="button"
          className="restart-btn"
          onClick={() => void window.ccui.restartSession(session.sessionId)}
        >
          重啟
        </button>
      )}

      <StaminaBar
        usage={session.usage}
        readonly={session.readonly}
        onCompact={() => void window.ccui.compact(session.sessionId)}
      />
    </div>
  )
}
