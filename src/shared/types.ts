/**
 * 主進程與渲染進程共用的型別定義。
 * 這是唯一的真相來源——IPC 兩端都 import 這裡，不各自複製一份。
 */

/** 小人的活動狀態（spec_02 §3D）。與 `isBurnout` 正交，不要合併成單一 enum。 */
export type SessionState =
  | 'idle'
  | 'working'
  | 'waiting_input'
  | 'error'
  | 'disconnected'

/** 一次 assistant message 的 token usage（transcript 取得，spec_01 §3.3）。 */
export interface TokenUsage {
  inputTokens: number
  cacheCreationInputTokens: number
  cacheReadInputTokens: number
  outputTokens: number
}

/** StaminaBar 需要的量化資料（spec_02 §3C）。 */
export interface UsageSnapshot {
  /** 對照 model 名稱，未知時為 null。 */
  model: string | null
  usage: TokenUsage
  /** context window 佔用率 0–1；model 未知時為 null（顯示「未知」狀態）。 */
  contextRatio: number | null
  /** 累計花費，純資訊，不驅動狀態。 */
  totalCostUsd: number
}

/** 渲染進程看到的單一 session 快照。 */
export interface SessionSnapshot {
  sessionId: string
  projectId: string
  projectPath: string
  displayName: string
  /** 未來的外部監看 session 沒有 PTY，此時為 true → 隱藏終端機入口與咖啡按鈕。 */
  readonly: boolean
  state: SessionState
  isBurnout: boolean
  usage: UsageSnapshot | null
}

export interface ProjectSnapshot {
  projectId: string
  projectPath: string
  displayName: string
}

/** Renderer → Main（ipcRenderer.invoke）。preload 逐一白名單暴露。 */
export interface RendererToMain {
  'session:start': (projectPath: string) => Promise<{ sessionId: string }>
  'session:rename': (sessionId: string, displayName: string) => Promise<void>
  'session:stop': (sessionId: string) => Promise<void>
  'session:restart': (sessionId: string) => Promise<{ sessionId: string }>
  'session:input': (sessionId: string, data: string) => Promise<void>
  'session:resize': (sessionId: string, cols: number, rows: number) => Promise<void>
  'session:compact': (sessionId: string) => Promise<void>
  'session:setForeground': (sessionId: string | null) => Promise<void>
  'app:getState': () => Promise<AppStateSnapshot>
}

export interface AppStateSnapshot {
  projects: ProjectSnapshot[]
  sessions: SessionSnapshot[]
}

/** Main → Renderer（webContents.send）。 */
export interface MainToRenderer {
  'session:output': { sessionId: string; data: string }
  'session:state': { sessionId: string; state: SessionState }
  'session:usage': { sessionId: string; usage: UsageSnapshot }
  'session:burnout': { sessionId: string; isBurnout: boolean }
  'session:ended': { sessionId: string; reason: string }
  'project:sessions': { projectId: string; sessionIds: string[] }
  'app:state': AppStateSnapshot
}

export type MainToRendererChannel = keyof MainToRenderer
