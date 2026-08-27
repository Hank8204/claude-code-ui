import { useState } from 'react'

/**
 * M1 簡化版的「新增專案」：輸入專案路徑（可選 session 名稱）並啟動第一個 session。
 * M3 會換成 Electron 原生資料夾選取器。
 */
export function AddProjectBar(): JSX.Element {
  const [path, setPath] = useState('')
  const [name, setName] = useState('')

  const submit = (): void => {
    const trimmed = path.trim()
    if (!trimmed) return
    void window.ccui.startSession(trimmed, name.trim() || undefined)
    setPath('')
    setName('')
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
      <input
        type="text"
        className="name-input"
        placeholder="session 名稱（可選）"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
      />
      <button type="button" onClick={submit}>
        新增專案 + session
      </button>
    </header>
  )
}
