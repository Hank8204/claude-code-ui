import { describe, it, expect, vi } from 'vitest'
import { StateMachine } from './StateMachine.js'
import type { SessionState } from '@shared/types.js'

function make() {
  const states: SessionState[] = []
  const burnouts: boolean[] = []
  const sm = new StateMachine(
    (s) => states.push(s),
    (b) => burnouts.push(b)
  )
  return { sm, states, burnouts }
}

describe('StateMachine — hook 事件序列', () => {
  it('PreToolUse → working、PermissionRequest → waiting_input、Stop → idle', () => {
    const { sm, states } = make()
    sm.applyHookEvent('PreToolUse')
    sm.applyHookEvent('PermissionRequest')
    sm.applyHookEvent('Stop')
    expect(states).toEqual(['working', 'waiting_input', 'idle'])
  })

  it('相同狀態不重複發事件', () => {
    const { sm, states } = make()
    sm.applyHookEvent('PreToolUse')
    sm.applyHookEvent('PostToolUse')
    expect(states).toEqual(['working'])
  })

  it('未知 hook 事件靜默忽略', () => {
    const { sm, states } = make()
    sm.applyHookEvent('SomethingNew')
    expect(states).toEqual([])
    expect(sm.state).toBe('idle')
  })

  it('PTY 非預期退出 → error', () => {
    const { sm, states } = make()
    sm.markPtyCrashed()
    expect(states).toEqual(['error'])
  })
})

describe('StateMachine — burnout 與 state 正交', () => {
  it('佔用率 > 0.8 觸發 burnout，且不影響 state', () => {
    const { sm, burnouts } = make()
    sm.applyHookEvent('PreToolUse')
    sm.updateContextRatio(0.85)
    expect(sm.state).toBe('working')
    expect(sm.isBurnout).toBe(true)
    expect(burnouts).toEqual([true])
  })

  it('佔用率回落 → burnout 解除（模擬 /compact 回血）', () => {
    const { sm, burnouts } = make()
    sm.updateContextRatio(0.9)
    sm.updateContextRatio(0.3)
    expect(burnouts).toEqual([true, false])
  })

  it('未知 model（ratio = null）不觸發 burnout', () => {
    const { sm } = make()
    sm.updateContextRatio(null)
    expect(sm.isBurnout).toBe(false)
  })

  it('burnout 狀態不變時不重複發事件', () => {
    const onBurnout = vi.fn()
    const sm = new StateMachine(() => {}, onBurnout)
    sm.updateContextRatio(0.85)
    sm.updateContextRatio(0.9)
    expect(onBurnout).toHaveBeenCalledTimes(1)
  })
})
