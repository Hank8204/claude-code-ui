/**
 * 主進程與渲染進程共用的型別定義。
 * 這是唯一的真相來源——IPC 兩端都 import 這裡，不各自複製一份。
 */

/** 小人的活動狀態（spec_02 §3D / spec_04 §4）。與 `isBurnout` 正交，不要合併成單一 enum。 */
export type SessionState =
  | 'idle'
  | 'working'
  | 'committing'
  | 'waiting_input'
  | 'error'
  | 'disconnected'

/** spec_04 §3：思考模型選擇。`default` = 不帶 --model，用 CLI 預設。 */
export type ModelChoice = 'default' | 'opus' | 'sonnet' | 'haiku'

/** spec_04 §3：思考深度，對應 `claude --effort`。 */
export type EffortLevel = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

/**
 * spec_04 §3：session 的常駐開關。
 *
 * 這些值是「使用者的意圖」——執行中透過往 PTY 送 slash command 套用，
 * 但我們收不到 CLI 的確認回饋，所以 UI 為樂觀顯示，可能與 CLI 實際狀態不同步。
 * 建立 / resume session 時則以啟動參數精準帶入。
 */
export interface SessionControls {
  model: ModelChoice
  /** 自動批准模式：true → 啟動帶 `--permission-mode bypassPermissions`。 */
  autoApprove: boolean
  effort: EffortLevel | null
  /** 極速模式（Opus 專屬），只能執行中以 `/fast` 切換。 */
  fast: boolean
}

export const DEFAULT_CONTROLS: SessionControls = {
  model: 'default',
  autoApprove: false,
  effort: null,
  fast: false
}

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
  /** usage 是「接回前的舊值」，尚未被新 transcript 更新（StaminaBar 標示「上次」）。 */
  usageStale: boolean
  /** spec_04 §3：常駐開關的目前意圖值。 */
  controls: SessionControls
}

export interface ProjectSnapshot {
  projectId: string
  projectPath: string
  displayName: string
}

/** Renderer → Main（ipcRenderer.invoke）。preload 逐一白名單暴露。 */
export interface RendererToMain {
  'session:start': (
    projectPath: string,
    displayName?: string,
    controls?: Partial<SessionControls>
  ) => Promise<{ sessionId: string }>
  'session:rename': (sessionId: string, displayName: string) => Promise<void>
  'session:stop': (sessionId: string) => Promise<void>
  'session:forget': (sessionId: string) => Promise<void>
  'session:restart': (sessionId: string) => Promise<{ sessionId: string }>
  'session:input': (sessionId: string, data: string) => Promise<void>
  'session:resize': (sessionId: string, cols: number, rows: number) => Promise<void>
  'session:compact': (sessionId: string) => Promise<void>
  /** spec_04 §2：把一鍵指令（含結尾 `\r`）送進 PTY。 */
  'session:sendCommand': (sessionId: string, command: string) => Promise<void>
  /** spec_04 §2：送出 Ctrl-C（`\x03`）中斷當前執行。 */
  'session:interrupt': (sessionId: string) => Promise<void>
  /** 工位標題列「關閉」：連送兩次 Ctrl-C 讓 claude 直接跳出。 */
  'session:close': (sessionId: string) => Promise<void>
  /** spec_04 §3：更新常駐開關，執行中會即時套用到 PTY。 */
  'session:setControls': (
    sessionId: string,
    patch: Partial<SessionControls>
  ) => Promise<void>
  'session:setForeground': (sessionId: string | null) => Promise<void>
  /** spec_04：原生資料夾選取器（ISSUE-003）。回傳選定路徑或 null。 */
  'project:pick': () => Promise<string | null>
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
  'session:controls': { sessionId: string; controls: SessionControls }
  'session:ended': { sessionId: string; reason: string }
  /** `/clear` 讓同一個 PTY 換了 session id——renderer 需把開啟中的終端機 key 換過去。 */
  'session:reattached': { oldSessionId: string; newSessionId: string }
  'project:sessions': { projectId: string; sessionIds: string[] }
  'app:state': AppStateSnapshot
  /** 使用者操作失敗（如找不到 claude CLI）——renderer 顯示可讀訊息。 */
  'app:error': { message: string; canSetCliPath: boolean }
}

export type MainToRendererChannel = keyof MainToRenderer
