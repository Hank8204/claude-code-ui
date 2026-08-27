import type { SessionState } from '@shared/types.js'

/** context 佔用率超過此值 → isBurnout（spec_01 §3.4）。 */
export const BURNOUT_THRESHOLD = 0.8

/** hook_event_name → 目標狀態（spec_01 §3.4 / spec_03 §3）。未列出的事件不改變狀態。 */
const HOOK_TRANSITIONS: Record<string, SessionState> = {
  PreToolUse: 'working',
  PostToolUse: 'working',
  PermissionRequest: 'waiting_input',
  Stop: 'idle',
  SessionEnd: 'disconnected'
}

/** spec_04 §4：Bash 指令觸發 committing（小人搬箱子）的特徵。 */
const COMMIT_COMMAND = /\bgit\s+commit\b/

/** 一筆 hook 事件的附帶脈絡——僅 PreToolUse 帶得到工具與指令內容。 */
export interface HookEventContext {
  toolName?: string
  command?: string
}

/**
 * 單一 session 的狀態機。
 *
 * `state` 只由 hook 事件與 PTY exit 驅動，不做任何文字比對。
 * `isBurnout` 由 context 佔用率驅動，與 `state` 正交——分開存，不塞進同一個 enum。
 */
export class StateMachine {
  private _state: SessionState = 'idle'
  private _isBurnout = false

  constructor(
    private readonly onStateChange: (state: SessionState) => void,
    private readonly onBurnoutChange: (isBurnout: boolean) => void
  ) {}

  get state(): SessionState {
    return this._state
  }

  get isBurnout(): boolean {
    return this._isBurnout
  }

  /** 收到 hook 事件。未知事件靜默忽略。 */
  applyHookEvent(hookEventName: string, ctx: HookEventContext = {}): void {
    if (hookEventName === 'PreToolUse' && isCommitCommand(ctx)) {
      this.transition('committing')
      return
    }
    const next = HOOK_TRANSITIONS[hookEventName]
    if (next) this.transition(next)
  }

  /** PTY 非預期退出 → error。 */
  markPtyCrashed(): void {
    this.transition('error')
  }

  /** session 正常終止 → disconnected。 */
  markEnded(): void {
    this.transition('disconnected')
  }

  /** 由 transcript 佔用率更新 burnout。ratio 為 null（未知 model）時不觸發。 */
  updateContextRatio(ratio: number | null): void {
    const next = ratio !== null && ratio > BURNOUT_THRESHOLD
    if (next === this._isBurnout) return
    this._isBurnout = next
    this.onBurnoutChange(next)
  }

  private transition(next: SessionState): void {
    if (next === this._state) return
    this._state = next
    this.onStateChange(next)
  }
}

function isCommitCommand(ctx: HookEventContext): boolean {
  return ctx.toolName === 'Bash' && !!ctx.command && COMMIT_COMMAND.test(ctx.command)
}
