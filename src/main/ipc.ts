import { ipcMain, type BrowserWindow } from 'electron'
import { CliNotFoundError } from './errors.js'
import type { SessionManager } from './session/SessionManager.js'
import type { MainToRenderer } from '@shared/types.js'

type Emit = <C extends keyof MainToRenderer>(channel: C, payload: MainToRenderer[C]) => void

/**
 * 註冊 Renderer → Main 的 invoke handler（spec_01 §4.2）。
 * 逐一列舉 channel，不轉發任意名稱。使用者操作失敗時廣播 app:error。
 */
export function registerIpcHandlers(manager: SessionManager, emit: Emit): void {
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

  ipcMain.handle('session:start', (_e, projectPath: string, displayName?: string) =>
    guard(() => manager.start(projectPath, displayName))()
  )
  ipcMain.handle('session:restart', (_e, id: string) => guard(() => manager.restart(id))())
  ipcMain.handle('session:rename', (_e, id: string, name: string) => manager.rename(id, name))
  ipcMain.handle('session:stop', (_e, id: string) => manager.stop(id))
  ipcMain.handle('session:forget', (_e, id: string) => manager.forget(id))
  ipcMain.handle('session:input', (_e, id: string, data: string) => manager.input(id, data))
  ipcMain.handle('session:resize', (_e, id: string, cols: number, rows: number) =>
    manager.resize(id, cols, rows)
  )
  ipcMain.handle('session:compact', (_e, id: string) => manager.compact(id))
  ipcMain.handle('session:setForeground', (_e, id: string | null) => manager.setForeground(id))
  ipcMain.handle('app:getState', () => manager.getState())
}

/** 建立廣播函式，供 SessionManager 推事件給 renderer。 */
export function createEmitter(getWindow: () => BrowserWindow | null) {
  return (channel: string, payload: unknown): void => {
    getWindow()?.webContents.send(channel, payload)
  }
}
