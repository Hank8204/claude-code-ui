interface Props {
  sessionId: string
}

/** spec_04 §2：一鍵指令快捷列。全部走 PTY，樂觀執行。 */
export function RoomToolbar({ sessionId }: Props): JSX.Element {
  const send = (command: string) => () => void window.ccui.sendCommand(sessionId, command)

  return (
    <div className="room-toolbar">
      <button type="button" title="壓縮記憶" onClick={() => void window.ccui.compact(sessionId)}>
        /compact
      </button>
      <button type="button" title="清空重置" onClick={send('/clear\r')}>
        /clear
      </button>
      <button type="button" title="時光倒流（回退檢查點）" onClick={send('/rewind\r')}>
        /rewind
      </button>
      <button type="button" title="程式碼審查" onClick={send('/review\r')}>
        /review
      </button>
      <button
        type="button"
        className="danger"
        title="緊急中斷（送 Ctrl-C）"
        onClick={() => void window.ccui.interrupt(sessionId)}
      >
        Ctrl-C
      </button>
    </div>
  )
}
