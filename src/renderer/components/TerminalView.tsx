import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

interface Props {
  sessionId: string
  displayName: string
  onClose: () => void
}

/**
 * 終端機彈窗（spec_02 §3E）。
 *
 * 同時只存在一個 xterm 實例：切換 session 時 dispose 舊的再建新的。
 * 終端機內容不進 React state，直接 write()。FitAddon 在尺寸變動時重新 fit()
 * 並把新的 cols/rows 回傳給 PTY，否則 TUI 排版會錯亂。
 */
export function TerminalView({ sessionId, displayName, onClose }: Props): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const term = new Terminal({ fontSize: 13, cursorBlink: true, convertEol: false })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(host)
    fit.fit()

    void window.ccui.setForeground(sessionId)
    void window.ccui.resize(sessionId, term.cols, term.rows)

    const offOutput = window.ccui.on('session:output', (payload) => {
      const p = payload as { sessionId: string; data: string }
      if (p.sessionId === sessionId) term.write(p.data)
    })
    const inputSub = term.onData((data) => void window.ccui.sendInput(sessionId, data))

    const observer = new ResizeObserver(() => {
      fit.fit()
      void window.ccui.resize(sessionId, term.cols, term.rows)
    })
    observer.observe(host)

    return () => {
      observer.disconnect()
      offOutput()
      inputSub.dispose()
      term.dispose()
      void window.ccui.setForeground(null)
    }
  }, [sessionId])

  return (
    <div className="terminal-overlay" role="dialog" aria-label={`${displayName} 終端機`}>
      <div className="terminal-titlebar">
        <span>{displayName}</span>
        <button type="button" onClick={onClose} aria-label="關閉終端機">
          ✕
        </button>
      </div>
      <div className="terminal-host" ref={hostRef} />
    </div>
  )
}
