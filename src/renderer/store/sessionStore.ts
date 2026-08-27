import { useSyncExternalStore } from 'react'
import type {
  AppStateSnapshot,
  ProjectSnapshot,
  SessionSnapshot,
  UsageSnapshot,
  SessionState
} from '@shared/types.js'

/**
 * Renderer 端的狀態容器。
 *
 * 只存低頻的 session:state / session:usage / session:burnout 與專案清單。
 * 終端機內容「絕對不要進這裡」（spec_02 §4）——TerminalView 直接 write() 到 xterm。
 */
class SessionStore {
  private projects: ProjectSnapshot[] = []
  private sessions = new Map<string, SessionSnapshot>()
  private listeners = new Set<() => void>()
  private cache: AppStateSnapshot = { projects: [], sessions: [] }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  getSnapshot = (): AppStateSnapshot => this.cache

  hydrate(state: AppStateSnapshot): void {
    this.projects = state.projects
    this.sessions = new Map(state.sessions.map((s) => [s.sessionId, s]))
    this.commit()
  }

  patchState(sessionId: string, state: SessionState): void {
    this.mutate(sessionId, (s) => ({ ...s, state }))
  }

  patchBurnout(sessionId: string, isBurnout: boolean): void {
    this.mutate(sessionId, (s) => ({ ...s, isBurnout }))
  }

  patchUsage(sessionId: string, usage: UsageSnapshot): void {
    this.mutate(sessionId, (s) => ({ ...s, usage }))
  }

  private mutate(
    sessionId: string,
    fn: (prev: SessionSnapshot) => SessionSnapshot
  ): void {
    const prev = this.sessions.get(sessionId)
    if (!prev) return
    this.sessions.set(sessionId, fn(prev))
    this.commit()
  }

  private commit(): void {
    this.cache = {
      projects: this.projects,
      sessions: [...this.sessions.values()]
    }
    this.listeners.forEach((fn) => fn())
  }
}

export const sessionStore = new SessionStore()

export function useAppState(): AppStateSnapshot {
  return useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot)
}

/** 把一個專案底下的 session 撈出來（spec_02 §3A）。 */
export function selectSessionsByProject(
  state: AppStateSnapshot,
  projectId: string
): SessionSnapshot[] {
  return state.sessions.filter((s) => s.projectId === projectId)
}
