/** 自訂 Exception class——禁用 bare try/except，錯誤要能被分類處理。 */

export class CliNotFoundError extends Error {
  constructor(message = '找不到 claude CLI，請於設定中指定絕對路徑') {
    super(message)
    this.name = 'CliNotFoundError'
  }
}

export class SessionNotFoundError extends Error {
  constructor(sessionId: string) {
    super(`找不到 session：${sessionId}`)
    this.name = 'SessionNotFoundError'
  }
}

/** 對唯讀（無 PTY handle）的 session 做需要 PTY 的操作。 */
export class ReadonlySessionError extends Error {
  constructor(sessionId: string) {
    super(`session ${sessionId} 為唯讀，無法寫入 PTY`)
    this.name = 'ReadonlySessionError'
  }
}

export class HookInstallError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message)
    this.name = 'HookInstallError'
  }
}
