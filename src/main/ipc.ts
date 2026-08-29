import { ipcMain, dialog, BrowserWindow } from 'electron'
import { CliNotFoundError } from './errors.js'
import type { SessionManager } from './session/SessionManager.js'
import type { UsagePoller } from './usage/UsagePoller.js'
import type { MainToRenderer, SessionControls } from '@shared/types.js'

type Emit = <C extends keyof MainToRenderer>(channel: C, payload: MainToRenderer[C]) => void

/**
 * 註冊 Renderer → Main 的 invoke handler（spec_01 §4.2）。
 * 逐一列舉 channel，不轉發任意名稱。使用者操作失敗時廣播 app:error。
 */
export function registerIpcHandlers(
  manager: SessionManager,
  emit: Emit,
  usage: UsagePoller
): void {
  const guard = <T>(fn: () => Promise<T> | T) => async (): Promise<T | undefined> => {
    try {
      return await fn()
    } catch (err) {
      emit('app:error', {
        message: err instanceof Error ? err.message : String(err),
        canSetCliPath: err instanceof CliNotFoundError
      })
      return undefined
    }
  }

  ipcMain.handle(
    'session:start',
    (_e, projectPath: string, displayName?: string, controls?: Partial<SessionControls>) =>
      guard(() => manager.start(projectPath, displayName, controls))()
  )
  ipcMain.handle('session:restart', (_e, id: string) => guard(() => manager.restart(id))())
  ipcMain.handle('session:rename', (_e, id: string, name: string) => manager.rename(id, name))
  ipcMain.handle('session:stop', (_e, id: string) => manager.stop(id))
  ipcMain.handle('session:forget', (_e, id: string) => guard(() => manager.forget(id))())
  ipcMain.handle('session:input', (_e, id: string, data: string) => manager.input(id, data))
  ipcMain.handle('session:resize', (_e, id: string, cols: number, rows: number) =>
    manager.resize(id, cols, rows)
  )
  ipcMain.handle('session:compact', (_e, id: string) => manager.compact(id))
  ipcMain.handle('session:sendCommand', (_e, id: string, command: string) =>
    guard(() => manager.sendCommand(id, command))()
  )
  ipcMain.handle('session:interrupt', (_e, id: string) =>
    guard(() => manager.interrupt(id))()
  )
  ipcMain.handle('session:close', (_e, id: string) => guard(() => manager.close(id))())
  ipcMain.handle('session:setControls', (_e, id: string, patch: Partial<SessionControls>) =>
    guard(() => manager.setControls(id, patch))()
  )
  ipcMain.handle('session:setForeground', (_e, id: string | null) => manager.setForeground(id))
  ipcMain.handle('project:pick', () => pickProjectDir())
  ipcMain.handle('app:getState', () => manager.getState())
  ipcMain.handle('usage:get', () => usage.latest)
  ipcMain.handle('usage:refresh', () => usage.refresh())
  ipcMain.handle('usage:setInterval', (_e, ms: number) => usage.configure(ms))
}

/** 原生資料夾選取器（spec_04 / ISSUE-003）。 */
async function pickProjectDir(): Promise<string | null> {
  const owner = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  const opts = { title: '選擇專案資料夾', properties: ['openDirectory' as const] }
  const { canceled, filePaths } = owner
    ? await dialog.showOpenDialog(owner, opts)
    : await dialog.showOpenDialog(opts)
  return canceled || filePaths.length === 0 ? null : filePaths[0]
}

/** 建立廣播函式，供 SessionManager 推事件給 renderer。 */
export function createEmitter(getWindow: () => BrowserWindow | null) {
  return (channel: string, payload: unknown): void => {
    getWindow()?.webContents.send(channel, payload)
  }
}
