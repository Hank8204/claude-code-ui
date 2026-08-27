import { useEffect, useState } from 'react'
import type {
  AppStateSnapshot,
  SessionState,
  UsageSnapshot
} from '@shared/types.js'
import { ProjectFloor } from './components/ProjectFloor.js'
import { TerminalView } from './components/TerminalView.js'
import { sessionStore, useAppState, selectSessionsByProject } from './store/sessionStore.js'
import { AddProjectBar } from './components/AddProjectBar.js'

/** 根元件：掛載時訂閱 Main → Renderer 事件並 hydrate store。 */
export function App(): JSX.Element {
  const state = useAppState()
  const [openSessionId, setOpenSessionId] = useState<string | null>(null)

  useEffect(() => {
    void window.ccui.getState().then((s) => sessionStore.hydrate(s))

    const offs = [
      window.ccui.on('app:state', (p) => sessionStore.hydrate(p as AppStateSnapshot)),
      window.ccui.on('session:state', (p) => {
        const e = p as { sessionId: string; state: SessionState }
        sessionStore.patchState(e.sessionId, e.state)
      }),
      window.ccui.on('session:burnout', (p) => {
        const e = p as { sessionId: string; isBurnout: boolean }
        sessionStore.patchBurnout(e.sessionId, e.isBurnout)
      }),
      window.ccui.on('session:usage', (p) => {
        const e = p as { sessionId: string; usage: UsageSnapshot }
        sessionStore.patchUsage(e.sessionId, e.usage)
      })
    ]
    return () => offs.forEach((off) => off())
  }, [])

  const openSession = openSessionId
    ? state.sessions.find((s) => s.sessionId === openSessionId) ?? null
    : null

  return (
    <div className="app-shell">
      <AddProjectBar />

      <main className="floor-stack">
        {state.projects.length === 0 && (
          <p className="empty-hint">尚無專案。在上方輸入專案路徑並新增。</p>
        )}
        {state.projects.map((project) => (
          <ProjectFloor
            key={project.projectId}
            project={project}
            sessions={selectSessionsByProject(state, project.projectId)}
            onOpenTerminal={setOpenSessionId}
          />
        ))}
      </main>

      {openSession && (
        <TerminalView
          key={openSession.sessionId}
          sessionId={openSession.sessionId}
          displayName={openSession.displayName}
          onClose={() => setOpenSessionId(null)}
        />
      )}
    </div>
  )
}
