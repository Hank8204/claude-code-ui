import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { MainToRendererChannel } from '@shared/types.js'

/**
 * contextBridge 白名單（spec_01 §4.1）。
 * 逐一列舉方法，不轉發任意 channel 名稱；renderer 不得取得 Node 能力。
 */
const SUBSCRIBABLE: MainToRendererChannel[] = [
  'session:output',
  'session:state',
  'session:usage',
  'session:burnout',
  'session:ended',
  'project:sessions',
  'app:state'
]

const api = {
  startSession: (projectPath: string) => ipcRenderer.invoke('session:start', projectPath),
  renameSession: (id: string, name: string) => ipcRenderer.invoke('session:rename', id, name),
  stopSession: (id: string) => ipcRenderer.invoke('session:stop', id),
  restartSession: (id: string) => ipcRenderer.invoke('session:restart', id),
  sendInput: (id: string, data: string) => ipcRenderer.invoke('session:input', id, data),
  resize: (id: string, cols: number, rows: number) =>
    ipcRenderer.invoke('session:resize', id, cols, rows),
  compact: (id: string) => ipcRenderer.invoke('session:compact', id),
  setForeground: (id: string | null) => ipcRenderer.invoke('session:setForeground', id),
  getState: () => ipcRenderer.invoke('app:getState'),

  /** 訂閱 Main → Renderer 事件，回傳退訂函式。 */
  on: (channel: MainToRendererChannel, listener: (payload: unknown) => void): (() => void) => {
    if (!SUBSCRIBABLE.includes(channel)) throw new Error(`不允許的 channel：${channel}`)
    const wrapped = (_e: IpcRendererEvent, payload: unknown): void => listener(payload)
    ipcRenderer.on(channel, wrapped)
    return () => ipcRenderer.removeListener(channel, wrapped)
  }
}

contextBridge.exposeInMainWorld('ccui', api)

export type CcuiApi = typeof api
