import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SessionManager } from './session/SessionManager.js'
import { HookBridgeServer } from './bridge/HookBridgeServer.js'
import { registerIpcHandlers, createEmitter } from './ipc.js'
import { ensureHooksOnStartup } from './bridge/hook-lifecycle.js'
import { buildAppMenu } from './menu.js'
import { getUserCliPath } from './config/store.js'
import type { MainToRenderer } from '@shared/types.js'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

let mainWindow: BrowserWindow | null = null
let bridge: HookBridgeServer | null = null
let manager: SessionManager | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 820,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())
  mainWindow.on('closed', () => (mainWindow = null))

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    void mainWindow.loadURL(devUrl)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

async function bootstrap(): Promise<void> {
  const emit = createEmitter(() => mainWindow) as <C extends keyof MainToRenderer>(
    channel: C,
    payload: MainToRenderer[C]
  ) => void

  manager = new SessionManager(emit, getUserCliPath())
  bridge = new HookBridgeServer((event) => manager?.dispatchHookEvent(event))
  await bridge.start()

  registerIpcHandlers(manager)
  await buildAppMenu()
  createWindow()

  // 視窗建立後才詢問 hook 同意，dialog 才有 owner window
  await ensureHooksOnStartup()
  await buildAppMenu() // 安裝狀態可能已改變
}

app.whenReady().then(bootstrap)

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

/** App 關閉：明確終止所有 PTY，刪除 bridge.json，避免孤兒進程（spec_01 §5）。 */
app.on('before-quit', async (event) => {
  if (!manager && !bridge) return
  event.preventDefault()
  await manager?.disposeAll()
  await bridge?.stop()
  manager = null
  bridge = null
  app.quit()
})
