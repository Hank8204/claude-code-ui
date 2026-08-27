import type { SessionState } from '@shared/types.js'

interface Props {
  state: SessionState
  isBurnout: boolean
}

/**
 * 小人狀態元件（spec_02 §3D / §6）。
 *
 * 分層 DOM 是唯一的實作陷阱解法（§6.3）：外層 .avatar-burnout 只做 rotate，
 * 內層 .avatar-state 只做 state 變換，transform 自然相乘、互不覆蓋。
 * 狀態切換一律用 data attribute，CSS 以屬性選擇器掛 @keyframes。
 */
export function AgentAvatar({ state, isBurnout }: Props): JSX.Element {
  return (
    <div className="avatar-anchor">
      <div className="avatar-burnout" data-burnout={isBurnout}>
        <div className="avatar-state" data-state={state}>
          <div className="avatar-parts">
            <div className="head" />
            <div className="body" />
            <div className="arm left" />
            <div className="arm right" />
          </div>
        </div>
      </div>
      <div className="ground-shadow" data-state={state} />
    </div>
  )
}
