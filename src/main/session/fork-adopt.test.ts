import { describe, it, expect } from 'vitest'
import { pickForkParent, FORK_ADOPT_WINDOW_MS, type ForkCandidate } from './fork-adopt.js'

const NOW = 1_000_000

function candidate(over: Partial<ForkCandidate> = {}): ForkCandidate {
  return {
    sessionId: 'parent',
    projectPath: '/Users/x/proj',
    endedAt: NOW - 1000,
    hasLivePty: true,
    ...over
  }
}

describe('pickForkParent（/clear fork adopt 判斷）', () => {
  it('source=clear + 剛斷線 + PTY 活著 + cwd 相符 → 接手', () => {
    const got = pickForkParent({ cwd: '/Users/x/proj', source: 'clear' }, [candidate()], NOW)
    expect(got).toBe('parent')
  })

  it('source 沒帶（舊版 claude）→ 靠啟發式仍接手', () => {
    const got = pickForkParent({ cwd: '/Users/x/proj', source: undefined }, [candidate()], NOW)
    expect(got).toBe('parent')
  })

  it('source=startup / resume / compact → 一律不接', () => {
    for (const source of ['startup', 'resume', 'compact']) {
      expect(pickForkParent({ cwd: '/Users/x/proj', source }, [candidate()], NOW)).toBeNull()
    }
  })

  it('PTY 已死的工位不接（接了也不能用）', () => {
    const got = pickForkParent(
      { cwd: '/Users/x/proj', source: 'clear' },
      [candidate({ hasLivePty: false })],
      NOW
    )
    expect(got).toBeNull()
  })

  it('沒斷線（endedAt undefined）的工位不接', () => {
    const got = pickForkParent(
      { cwd: '/Users/x/proj', source: 'clear' },
      [candidate({ endedAt: undefined })],
      NOW
    )
    expect(got).toBeNull()
  })

  it('斷線超過時間窗 → 不接', () => {
    const got = pickForkParent(
      { cwd: '/Users/x/proj', source: 'clear' },
      [candidate({ endedAt: NOW - FORK_ADOPT_WINDOW_MS - 1 })],
      NOW
    )
    expect(got).toBeNull()
  })

  it('cwd 對不上 → 不接', () => {
    const got = pickForkParent(
      { cwd: '/Users/x/other', source: 'clear' },
      [candidate()],
      NOW
    )
    expect(got).toBeNull()
  })

  it('event 沒帶 cwd 時不以 cwd 篩選', () => {
    const got = pickForkParent({ cwd: '', source: 'clear' }, [candidate()], NOW)
    expect(got).toBe('parent')
  })

  it('多個候選取最近才斷線的那個', () => {
    const got = pickForkParent({ cwd: '/Users/x/proj', source: 'clear' }, [
      candidate({ sessionId: 'old', endedAt: NOW - 9000 }),
      candidate({ sessionId: 'recent', endedAt: NOW - 500 })
    ], NOW)
    expect(got).toBe('recent')
  })
})
