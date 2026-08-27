import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

interface Props {
  sessionId: string
  displayName: string
  onClose: () => void
}

type Dock = 'right' | 'bottom'

const DOCK_KEY = 'ccui.terminal.dock'
const SIZE_KEY = 'ccui.terminal.size'
const MIN_PX = 240

/**
 * 終端機彈窗（spec_02 §3E）。
 *
 * 同時只存在一個 xterm 實例；終端機內容不進 React state，直接 write()。
 * 可停靠右側或下方、可拖曳邊界調整大小（存 localStorage）。
 * FitAddon 在尺寸變動時重新 fit() 並把 cols/rows 回傳給 PTY。
 */
export function TerminalView({ sessionId, displayName, onClose }: Props): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const [dock, setDock] = useState<Dock>(() => readDock())
  const [size, setSize] = useState<number>(() => readSize(readDock()))
  const sizeRef = useRef(size)
  sizeRef.current = size

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

  const startDrag = (e: React.MouseEvent): void => {
    e.preventDefault()
    const axisStart = dock === 'right' ? e.clientX : e.clientY
    const base = size
    const onMove = (ev: MouseEvent): void => {
      const delta = dock === 'right' ? axisStart - ev.clientX : axisStart - ev.clientY
      const limit = dock === 'right' ? window.innerWidth : window.innerHeight
      setSize(clamp(base + delta, MIN_PX, limit - 120))
    }
    const onUp = (): void => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      persistSize(dock, sizeRef.current)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  const toggleDock = (): void => {
    const next: Dock = dock === 'right' ? 'bottom' : 'right'
    setDock(next)
    setSize(readSize(next))
    try {
      localStorage.setItem(DOCK_KEY, next)
    } catch {
      /* localStorage 可能不可用 */
    }
  }

  const style = dock === 'right' ? { width: `${size}px` } : { height: `${size}px` }

  return (
    <div className="terminal-overlay" data-dock={dock} style={style} role="dialog" aria-label={`${displayName} 終端機`}>
      <div className="terminal-resizer" data-dock={dock} onMouseDown={startDrag} />
      <div className="terminal-titlebar">
        <span>{displayName}</span>
        <div className="terminal-actions">
          <button type="button" onClick={toggleDock} title="切換停靠位置（右側 / 下方）">
            {dock === 'right' ? '⇥ 下方' : '⇤ 右側'}
          </button>
          <button type="button" onClick={onClose} aria-label="關閉終端機">
            ✕
          </button>
        </div>
      </div>
      <div className="terminal-host" ref={hostRef} />
    </div>
  )
}

function readDock(): Dock {
  try {
    return localStorage.getItem(DOCK_KEY) === 'bottom' ? 'bottom' : 'right'
  } catch {
    return 'right'
  }
}

function readSize(dock: Dock): number {
  const fallback = dock === 'right' ? 760 : 380
  try {
    const raw = Number(localStorage.getItem(`${SIZE_KEY}.${dock}`))
    return Number.isFinite(raw) && raw >= MIN_PX ? raw : fallback
  } catch {
    return fallback
  }
}

function persistSize(dock: Dock, size: number): void {
  try {
    localStorage.setItem(`${SIZE_KEY}.${dock}`, String(Math.round(size)))
  } catch {
    /* localStorage 可能不可用 */
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max))
}
