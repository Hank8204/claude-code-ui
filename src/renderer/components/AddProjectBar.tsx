import { useState } from 'react'
import { type EffortLevel, type ModelChoice, type SessionControls } from '@shared/types.js'
import { readSessionDefaults, writeSessionDefaults } from '../store/sessionDefaults.js'

const MODELS: ModelChoice[] = ['default', 'opus', 'sonnet', 'haiku']
const MODEL_LABEL: Record<ModelChoice, string> = {
  default: '預設模型',
  opus: 'Opus',
  sonnet: 'Sonnet',
  haiku: 'Haiku'
}
const EFFORTS: EffortLevel[] = ['low', 'medium', 'high', 'xhigh', 'max']

/** 「新增專案」：原生資料夾選取器（ISSUE-003）＋ spec_04 §3 建立時的開關預設值。 */
export function AddProjectBar(): JSX.Element {
  const [path, setPath] = useState('')
  const [name, setName] = useState('')
  const [controls, setControls] = useState<SessionControls>(readSessionDefaults)

  const patchControls = (p: Partial<SessionControls>): void => {
    const next = { ...controls, ...p }
    setControls(next)
    writeSessionDefaults(next)
  }

  const submit = (): void => {
    const trimmed = path.trim()
    if (!trimmed) return
    void window.ccui.startSession(trimmed, name.trim() || undefined, controls)
    setPath('')
    setName('')
  }

  const browse = async (): Promise<void> => {
    const picked = await window.ccui.pickProjectDir()
    if (picked) setPath(picked)
  }

  return (
    <header className="add-project-bar">
      <h1>Claude Code UI</h1>
      <input
        type="text"
        className="path-input"
        placeholder="/Users/you/IdeaProjects/YourProject"
        value={path}
        onChange={(e) => setPath(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
      />
      <button type="button" className="browse-btn" onClick={() => void browse()}>
        瀏覽…
      </button>
      <input
        type="text"
        className="name-input"
        placeholder="session 名稱（可選）"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
      />

      <select
        className="new-model"
        value={controls.model}
        title="新 session 的思考模型"
        onChange={(e) => patchControls({ model: e.target.value as ModelChoice })}
      >
        {MODELS.map((m) => (
          <option key={m} value={m}>
            {MODEL_LABEL[m]}
          </option>
        ))}
      </select>
      <select
        className="new-effort"
        value={controls.effort ?? ''}
        title="新 session 的思考深度"
        onChange={(e) =>
          patchControls({ effort: e.target.value ? (e.target.value as EffortLevel) : null })
        }
      >
        <option value="">預設深度</option>
        {EFFORTS.map((lvl) => (
          <option key={lvl} value={lvl}>
            {lvl}
          </option>
        ))}
      </select>
      <label className="new-auto" title="自動批准（bypassPermissions）">
        <input
          type="checkbox"
          checked={controls.autoApprove}
          onChange={(e) => patchControls({ autoApprove: e.target.checked })}
        />
        自動批准
      </label>

      <button type="button" onClick={submit}>
        新增專案 + session
      </button>
    </header>
  )
}
