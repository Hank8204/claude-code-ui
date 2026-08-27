import type { EffortLevel, ModelChoice, SessionControls } from '@shared/types.js'

interface Props {
  sessionId: string
  controls: SessionControls
  disabled: boolean
}

const MODELS: ModelChoice[] = ['default', 'opus', 'sonnet', 'haiku']
const MODEL_LABEL: Record<ModelChoice, string> = {
  default: '預設',
  opus: 'Opus',
  sonnet: 'Sonnet',
  haiku: 'Haiku'
}
const EFFORTS: EffortLevel[] = ['low', 'medium', 'high', 'xhigh', 'max']

/**
 * spec_04 §3：session 常駐開關列。
 *
 * 值為「使用者意圖」的樂觀顯示——執行中改動會送 slash command / 按鍵進 PTY，
 * 但 CLI 不回報實際狀態，兩者可能不同步。
 */
export function SessionControlsBar({ sessionId, controls, disabled }: Props): JSX.Element {
  const patch = (p: Partial<SessionControls>): void => {
    void window.ccui.setControls(sessionId, p)
  }
  const fastAvailable = controls.model === 'opus' || controls.model === 'default'

  return (
    <div className="controls-bar" data-disabled={disabled}>
      <label className="ctrl" title="思考模型（/model）">
        <span className="ctrl-key" data-model={controls.model}>
          模型
        </span>
        <select
          value={controls.model}
          disabled={disabled}
          onChange={(e) => patch({ model: e.target.value as ModelChoice })}
        >
          {MODELS.map((m) => (
            <option key={m} value={m}>
              {MODEL_LABEL[m]}
            </option>
          ))}
        </select>
      </label>

      <button
        type="button"
        className="ctrl-toggle"
        data-on={controls.autoApprove}
        disabled={disabled}
        title="自動批准模式（bypassPermissions）。執行中僅送 Shift-Tab 最佳努力切換。"
        onClick={() => patch({ autoApprove: !controls.autoApprove })}
      >
        {controls.autoApprove ? '🟢 自動批准' : '⚪ 需確認'}
      </button>

      <label className="ctrl" title="思考深度（/effort）">
        <span className="ctrl-key">深度</span>
        <select
          value={controls.effort ?? ''}
          disabled={disabled}
          onChange={(e) =>
            patch({ effort: e.target.value ? (e.target.value as EffortLevel) : null })
          }
        >
          <option value="">預設</option>
          {EFFORTS.map((lvl) => (
            <option key={lvl} value={lvl}>
              {lvl}
            </option>
          ))}
        </select>
      </label>

      {fastAvailable && (
        <button
          type="button"
          className="ctrl-toggle"
          data-on={controls.fast}
          disabled={disabled}
          title="極速模式（/fast，Opus 專屬）"
          onClick={() => patch({ fast: !controls.fast })}
        >
          ⚡ {controls.fast ? '極速' : '一般'}
        </button>
      )}
    </div>
  )
}
