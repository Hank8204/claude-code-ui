import Store from 'electron-store'

/** 視窗位置與大小（spec_01 §5）。不綁 Electron 型別，方便測試。 */
export interface WindowBounds {
  width: number
  height: number
  x?: number
  y?: number
}

/** 持久化的專案記錄。與 SessionManager 的 ProjectRecord 同形。 */
export interface PersistedProject {
  projectId: string
  projectPath: string
  displayName: string
  serial: number
}

/** 持久化的 session 中繼資料。重新啟動後以此重建可 `--resume` 的工位。 */
export interface PersistedSession {
  sessionId: string
  projectId: string
  displayName: string
}

export interface WorkspaceSnapshot {
  projects: PersistedProject[]
  sessions: PersistedSession[]
}

/**
 * SessionManager 依賴的持久化 port（依賴注入，方便以 in-memory fake 測試）。
 */
export interface WorkspacePort {
  load(): WorkspaceSnapshot
  save(snapshot: WorkspaceSnapshot): void
}

interface PersistedShape {
  hookConsent?: 'granted' | 'declined'
  cliPath?: string
  windowBounds?: WindowBounds
  workspace?: WorkspaceSnapshot
}

const store = new Store<PersistedShape>({ name: 'claude-code-ui', defaults: {} })

const EMPTY_WORKSPACE: WorkspaceSnapshot = { projects: [], sessions: [] }

export function getHookConsent(): PersistedShape['hookConsent'] {
  return store.get('hookConsent')
}

export function setHookConsent(value: NonNullable<PersistedShape['hookConsent']>): void {
  store.set('hookConsent', value)
}

export function clearHookConsent(): void {
  store.delete('hookConsent')
}

export function getUserCliPath(): string | undefined {
  return store.get('cliPath')
}

export function setUserCliPath(path: string): void {
  store.set('cliPath', path)
}

export function getWindowBounds(): WindowBounds | undefined {
  return store.get('windowBounds')
}

export function setWindowBounds(bounds: WindowBounds): void {
  store.set('windowBounds', bounds)
}

/** electron-store 版的 WorkspacePort。 */
export const electronStoreWorkspace: WorkspacePort = {
  load: () => store.get('workspace') ?? EMPTY_WORKSPACE,
  save: (snapshot) => store.set('workspace', snapshot)
}
