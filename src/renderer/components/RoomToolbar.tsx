import { resolveToolbar } from '@shared/toolbar.js'
import { useToolbar, useCustomCommands } from '../store/settingsStore.js'

interface Props {
  sessionId: string
  /** Context 逼近上限：把 /compact 轉為紅色脈動的警示按鈕（取代原「喝咖啡」）。 */
  compactAlert?: boolean
}

/**
 * spec_04 §2：工位一鍵指令快捷列。要放哪些指令由設定頁面決定（內建 + 自訂，最多 4 個）。
 * 全部走 PTY、樂觀執行；`/compact` 走專屬管道（會觸發 PostCompact 重新取樣）。
 */
export function RoomToolbar({ sessionId, compactAlert = false }: Props): JSX.Element | null {
  const enabled = useToolbar()
  const custom = useCustomCommands()
  const defs = resolveToolbar(enabled, custom)
  if (defs.length === 0) return null

  const run = (id: string, command: string) => (): void => {
    if (id === '/compact') void window.ccui.compact(sessionId)
    else void window.ccui.sendCommand(sessionId, command.endsWith('\r') ? command : `${command}\r`)
  }

  return (
    <div className="room-toolbar">
      {defs.map((def) => (
        <button
          key={def.id}
          type="button"
          className={def.id === '/compact' && compactAlert ? 'compact-alert' : undefined}
          title={def.title}
          onClick={run(def.id, def.command ?? def.id)}
        >
          {def.label}
        </button>
      ))}
    </div>
  )
}
