interface Props {
  sessionId: string
}

/** spec_04 §2：一鍵指令快捷列。全部走 PTY，樂觀執行。 */
export function RoomToolbar({ sessionId }: Props): JSX.Element {
  const send = (command: string) => () => void window.ccui.sendCommand(sessionId, command)

  return (
    <div className="room-toolbar">
      <button type="button" title="壓縮記憶（/compact）" onClick={() => void window.ccui.compact(sessionId)}>
        ☕
      </button>
      <button type="button" title="清空重置（/clear）" onClick={send('/clear\r')}>
        🧹
      </button>
      <button type="button" title="時光倒流（/rewind）" onClick={send('/rewind\r')}>
        ⏪
      </button>
      <button type="button" title="程式碼審查（/review）" onClick={send('/review\r')}>
        🔍
      </button>
      <button
        type="button"
        className="danger"
        title="緊急中斷（Ctrl-C）"
        onClick={() => void window.ccui.interrupt(sessionId)}
      >
        🛑
      </button>
    </div>
  )
}
