import { describe, it, expect, vi } from 'vitest'
import { SessionManager } from './SessionManager.js'
import type { WorkspacePort, WorkspaceSnapshot } from '../config/store.js'

/** In-memory WorkspacePort，load 永遠回傳最近一次 save 的內容。 */
function fakeWorkspace(initial: WorkspaceSnapshot): WorkspacePort {
  let current = initial
  return {
    load: () => current,
    save: (snapshot) => {
      current = snapshot
    }
  }
}

const PROJECT = { projectId: 'p1', projectPath: '/Users/x/proj', displayName: 'proj', serial: 2 }
const SESSION = { sessionId: 's1', projectId: 'p1', displayName: 'proj #1' }

describe('SessionManager 持久化（spec_01 §5）', () => {
  it('restore 後 getState 帶回專案，休眠 session 顯示為 disconnected 工位', () => {
    const mgr = new SessionManager(vi.fn(), fakeWorkspace({ projects: [PROJECT], sessions: [SESSION] }))
    mgr.restore()

    const state = mgr.getState()
    expect(state.projects).toEqual([
      { projectId: 'p1', projectPath: '/Users/x/proj', displayName: 'proj' }
    ])
    expect(state.sessions[0]).toMatchObject({
      sessionId: 's1',
      state: 'disconnected',
      readonly: false,
      isBurnout: false,
      projectPath: '/Users/x/proj'
    })
  })

  it('丟棄 projectId 對不到任何專案的孤兒 session', () => {
    const ws = fakeWorkspace({
      projects: [PROJECT],
      sessions: [{ sessionId: 'orphan', projectId: 'ghost', displayName: 'x' }]
    })
    const mgr = new SessionManager(vi.fn(), ws)
    mgr.restore()
    expect(mgr.getState().sessions).toHaveLength(0)
  })

  it('改休眠 session 的名字會寫回持久化並廣播 app:state', () => {
    const ws = fakeWorkspace({ projects: [PROJECT], sessions: [SESSION] })
    const emit = vi.fn()
    const mgr = new SessionManager(emit, ws)
    mgr.restore()

    mgr.rename('s1', '重要的那個')

    expect(ws.load().sessions[0].displayName).toBe('重要的那個')
    expect(ws.load().projects).toHaveLength(1)
    expect(emit).toHaveBeenCalledWith('app:state', expect.anything())
  })

  it('rename 不存在的 session 丟 SessionNotFoundError', () => {
    const mgr = new SessionManager(vi.fn(), fakeWorkspace({ projects: [], sessions: [] }))
    mgr.restore()
    expect(() => mgr.rename('nope', 'x')).toThrow(/找不到 session/)
  })

  it('setForeground 對休眠 session 會拒絕（休眠 session 沒有 PTY 可轉發輸出）', () => {
    const mgr = new SessionManager(vi.fn(), fakeWorkspace({ projects: [PROJECT], sessions: [SESSION] }))
    mgr.restore()
    expect(() => mgr.setForeground('s1')).toThrow(/找不到 session/)
    expect(() => mgr.setForeground(null)).not.toThrow()
  })
})
