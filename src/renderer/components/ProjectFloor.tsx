import { useState } from 'react'
import type { ProjectSnapshot, SessionSnapshot } from '@shared/types.js'
import { OfficeRoom } from './OfficeRoom.js'
import { summarizeFloor, Severity } from '../store/floorSeverity.js'

interface Props {
  project: ProjectSnapshot
  sessions: SessionSnapshot[]
  onOpenTerminal: (sessionId: string) => void
}

const SEVERITY_CLASS: Record<Severity, string> = {
  [Severity.WaitingInput]: 'sev-waiting',
  [Severity.Error]: 'sev-error',
  [Severity.Burnout]: 'sev-burnout',
  [Severity.Working]: 'sev-working',
  [Severity.Idle]: 'sev-idle'
}

/** 專案樓層（spec_02 §3A）。彙總狀態即時由子 session 計算，不快取。 */
export function ProjectFloor({ project, sessions, onOpenTerminal }: Props): JSX.Element {
  const [collapsed, setCollapsed] = useState(false)
  const summary = summarizeFloor(sessions)

  return (
    <section className={`project-floor ${SEVERITY_CLASS[summary.severity]}`}>
      <header className="floor-header">
        <button
          type="button"
          className="collapse-toggle"
          onClick={() => setCollapsed((v) => !v)}
          aria-expanded={!collapsed}
        >
          {collapsed ? '▸' : '▾'}
        </button>
        <div className="floor-title">
          <strong>{project.displayName}</strong>
          <span className="floor-path">{project.projectPath}</span>
        </div>
        <span className="floor-summary">{summary.label}</span>
        <button
          type="button"
          className="add-session"
          onClick={() => void window.ccui.startSession(project.projectPath)}
        >
          ＋ 新增 session
        </button>
      </header>

      {!collapsed && (
        <div className="floor-rooms">
          {sessions.map((session) => (
            <OfficeRoom
              key={session.sessionId}
              session={session}
              onOpenTerminal={onOpenTerminal}
            />
          ))}
        </div>
      )}
    </section>
  )
}
