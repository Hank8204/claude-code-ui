import { Menu, dialog, shell, type MenuItemConstructorOptions } from 'electron'
import { existsSync } from 'node:fs'
import { areHooksInstalled, reinstallHooks, removeHooks } from './bridge/hook-lifecycle.js'
import { setUserCliPath, getUserCliPath } from './config/store.js'
import type { SessionManager } from './session/SessionManager.js'

/** 應用程式選單：Hooks 安裝／解除安裝（spec_03 §6）、CLI 路徑設定（spec_01 §3.2）。 */
export async function buildAppMenu(manager: SessionManager): Promise<void> {
  const installed = await areHooksInstalled()

  const hooksSubmenu: MenuItemConstructorOptions[] = [
    { label: installed ? 'Hooks：已安裝' : 'Hooks：未安裝', enabled: false },
    { type: 'separator' },
    { label: '重新安裝 Hooks', click: () => void refresh(manager, reinstallHooks) },
    {
      label: '解除安裝 Hooks（還原 settings.json）',
      enabled: installed,
      click: () => void refresh(manager, removeHooks)
    },
    { type: 'separator' },
    {
      label: '開啟 ~/.claude/settings.json',
      click: () => void shell.openPath(`${process.env.HOME}/.claude/settings.json`)
    }
  ]

  const settingsSubmenu: MenuItemConstructorOptions[] = [
    {
      label: `claude CLI：${getUserCliPath() ?? '自動偵測'}`,
      enabled: false
    },
    { label: '指定 claude CLI 路徑…', click: () => void pickCliPath(manager) }
  ]

  const template: MenuItemConstructorOptions[] = [
    { role: 'appMenu' },
    { role: 'editMenu' },
    { label: 'Hooks', submenu: hooksSubmenu },
    { label: '設定', submenu: settingsSubmenu },
    { role: 'viewMenu' },
    { role: 'windowMenu' }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

async function pickCliPath(manager: SessionManager): Promise<void> {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: '選擇 claude 執行檔',
    properties: ['openFile'],
    message: '通常在 ~/.nvm/versions/node/<版本>/bin/claude 或 /opt/homebrew/bin/claude'
  })
  const picked = filePaths[0]
  if (canceled || !picked) return
  if (!existsSync(picked)) {
    await dialog.showMessageBox({ type: 'error', message: '找不到該檔案' })
    return
  }
  setUserCliPath(picked)
  manager.setCliPath(picked)
  await buildAppMenu(manager)
  await dialog.showMessageBox({ type: 'info', message: '已設定 claude CLI 路徑', detail: picked })
}

async function refresh(manager: SessionManager, action: () => Promise<void>): Promise<void> {
  await action()
  await buildAppMenu(manager)
}
