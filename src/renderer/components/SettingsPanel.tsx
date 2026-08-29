import { useState } from 'react'
import {
  TOOLBAR_CATALOG,
  TOOLBAR_MAX,
  CUSTOM_MAX,
  customToDef,
  makeCustomId,
  type CustomCommand,
  type ToolbarCommandDef
} from '@shared/toolbar.js'
import { USAGE_INTERVALS } from '@shared/usage.js'
import {
  settingsStore,
  useToolbar,
  useCustomCommands,
  useUsageInterval
} from '../store/settingsStore.js'

interface Props {
  onClose: () => void
}

/** app 內設定頁面：工位一鍵指令列、`/usage` 更新頻率。 */
export function SettingsPanel({ onClose }: Props): JSX.Element {
  const savedEnabled = useToolbar()
  const savedCustom = useCustomCommands()
  const savedInterval = useUsageInterval()

  const [selected, setSelected] = useState<string[]>(savedEnabled)
  const [custom, setCustom] = useState<CustomCommand[]>(savedCustom)
  const [intervalMs, setIntervalMs] = useState<number>(savedInterval)
  const [newLabel, setNewLabel] = useState('')
  const [newCommand, setNewCommand] = useState('')

  const rows: ToolbarCommandDef[] = [...TOOLBAR_CATALOG, ...custom.map(customToDef)]

  const toggle = (id: string): void => {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id)
      if (prev.length >= TOOLBAR_MAX) return prev
      return [...prev, id]
    })
  }

  const addCustom = (): void => {
    const label = newLabel.trim()
    const command = newCommand.trim()
    if (!label || !command || custom.length >= CUSTOM_MAX) return
    setCustom((prev) => [...prev, { id: makeCustomId(), label, command }])
    setNewLabel('')
    setNewCommand('')
  }

  const removeCustom = (id: string): void => {
    setCustom((prev) => prev.filter((c) => c.id !== id))
    setSelected((prev) => prev.filter((x) => x !== id))
  }

  const save = (): void => {
    settingsStore.setCustom(custom)
    settingsStore.setToolbar(selected)
    settingsStore.setUsageInterval(intervalMs)
    onClose()
  }

  return (
    <div className="settings-overlay" role="dialog" aria-label="設定" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <header className="settings-head">
          <h2>設定</h2>
          <button type="button" className="settings-x" onClick={onClose} aria-label="關閉設定">
            ✕
          </button>
        </header>

        <section className="settings-section">
          <h3>工位一鍵指令列</h3>
          <p className="settings-hint">
            勾選要放進每個工位底部快捷列的指令，最多 {TOOLBAR_MAX} 個。目前 {selected.length} /{' '}
            {TOOLBAR_MAX}。
          </p>

          <ul className="cmd-list">
            {rows.map((c) => {
              const on = selected.includes(c.id)
              const locked = !on && selected.length >= TOOLBAR_MAX
              return (
                <li key={c.id} className={locked ? 'is-locked' : undefined}>
                  <label>
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={locked}
                      onChange={() => toggle(c.id)}
                    />
                    <span className="cmd-id">{c.label}</span>
                    <span className="cmd-desc">
                      {c.custom ? `送出 ${c.command}` : c.title}
                    </span>
                  </label>
                  {c.custom && (
                    <button
                      type="button"
                      className="cmd-del"
                      title="刪除這條自訂指令"
                      aria-label={`刪除 ${c.label}`}
                      onClick={() => removeCustom(c.id)}
                    >
                      ✕
                    </button>
                  )}
                </li>
              )
            })}
          </ul>

          <div className="cmd-add">
            <span className="cmd-add-label">新增自訂指令</span>
            <div className="cmd-add-row">
              <input
                type="text"
                placeholder="按鈕文字（如：切 Sonnet）"
                value={newLabel}
                maxLength={24}
                onChange={(e) => setNewLabel(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addCustom()}
              />
              <input
                type="text"
                placeholder="送進終端機的指令（如：/model sonnet）"
                value={newCommand}
                maxLength={200}
                onChange={(e) => setNewCommand(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addCustom()}
              />
              <button
                type="button"
                className="cmd-add-btn"
                disabled={!newLabel.trim() || !newCommand.trim() || custom.length >= CUSTOM_MAX}
                onClick={addCustom}
              >
                新增
              </button>
            </div>
          </div>

          <div className="cmd-preview">
            <span className="cmd-preview-label">預覽</span>
            {selected.length === 0 ? (
              <em>不顯示快捷列</em>
            ) : (
              selected.map((id) => {
                const def = rows.find((r) => r.id === id)
                return (
                  <span key={id} className="cmd-chip">
                    {def?.label ?? id}
                  </span>
                )
              })
            )}
          </div>
        </section>

        <section className="settings-section">
          <h3>用量更新頻率</h3>
          <p className="settings-hint">
            開啟 App 會抓一次；之後每隔這個時間重抓 <code>/usage</code>。每次會算一個
            request，別設太密。
          </p>
          <select
            className="usage-interval-select"
            value={intervalMs}
            onChange={(e) => setIntervalMs(Number(e.target.value))}
          >
            {USAGE_INTERVALS.map((o) => (
              <option key={o.ms} value={o.ms}>
                {o.label}
              </option>
            ))}
          </select>
        </section>

        <footer className="settings-foot">
          <button type="button" className="settings-cancel" onClick={onClose}>
            取消
          </button>
          <button type="button" className="settings-save" onClick={save}>
            儲存
          </button>
        </footer>
      </div>
    </div>
  )
}
