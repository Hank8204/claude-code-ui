import type { SessionState } from '@shared/types.js'

interface Props {
  state: SessionState
  isBurnout: boolean
  displayName: string
}

const STATE_LABEL: Record<SessionState, string> = {
  idle: 'IDLE',
  working: 'WORKING',
  committing: 'COMMITTING',
  waiting_input: 'WAITING',
  error: 'ERROR',
  disconnected: 'DISCONNECTED'
}

/**
 * Session 名牌（Claude Design 改版）。原本是「桌前白色小人」，改為顯示
 * session 名稱 + 狀態文字的名牌，狀態以框線顏色 + 整塊震動 / 浮動表達。
 *
 * 分層 DOM 仍是實作重點（原 spec_02 §6.3）：外層 .avatar-burnout 只做 burnout
 * 搖晃，內層 .avatar-state 只做 state 變換，兩層 transform 自然相乘、互不覆蓋。
 * 狀態切換一律用 data attribute，CSS 以屬性選擇器掛 @keyframes。
 */
export function AgentAvatar({ state, isBurnout, displayName }: Props): JSX.Element {
  return (
    <div className="avatar-anchor">
      <div className="avatar-burnout" data-burnout={isBurnout}>
        <div className="avatar-state session-plate" data-state={state}>
          <div className="session-name">{displayName}</div>
          <div className="session-state">{isBurnout ? 'BURNOUT' : STATE_LABEL[state]}</div>
        </div>
      </div>
    </div>
  )
}
