import { ipcMain, type BrowserWindow } from 'electron'
import type { SessionManager } from './session/SessionManager.js'

/**
 * 註冊 Renderer → Main 的 invoke handler（spec_01 §4.2）。
 * 逐一列舉 channel，不轉發任意名稱。
 */
export function registerIpcHandlers(manager: SessionManager): void {
  ipcMain.handle('session:start', (_e, projectPath: string) => manager.start(projectPath))
  ipcMain.handle('session:rename', (_e, id: string, name: string) => manager.rename(id, name))
  ipcMain.handle('session:stop', (_e, id: string) => manager.stop(id))
  ipcMain.handle('session:restart', (_e, id: string) => manager.restart(id))
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
