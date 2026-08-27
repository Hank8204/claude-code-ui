import { Menu, shell, type MenuItemConstructorOptions } from 'electron'
import {
  areHooksInstalled,
  reinstallHooks,
  removeHooks
} from './bridge/hook-lifecycle.js'

/** 應用程式選單。Hooks 的安裝／解除安裝入口（spec_03 §6 要求可逆）。 */
export async function buildAppMenu(): Promise<void> {
  const installed = await areHooksInstalled()

  const hooksSubmenu: MenuItemConstructorOptions[] = [
    {
      label: installed ? 'Hooks：已安裝' : 'Hooks：未安裝',
      enabled: false
    },
    { type: 'separator' },
    { label: '重新安裝 Hooks', click: () => void refresh(reinstallHooks) },
    {
      label: '解除安裝 Hooks（還原 settings.json）',
      enabled: installed,
      click: () => void refresh(removeHooks)
    },
    { type: 'separator' },
    {
      label: '開啟 ~/.claude/settings.json',
      click: () => void shell.openPath(`${process.env.HOME}/.claude/settings.json`)
    }
  ]

  const template: MenuItemConstructorOptions[] = [
    { role: 'appMenu' },
    { role: 'editMenu' },
    { label: 'Hooks', submenu: hooksSubmenu },
    { role: 'viewMenu' },
    { role: 'windowMenu' }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

async function refresh(action: () => Promise<void>): Promise<void> {
  await action()
  await buildAppMenu() // 重建選單以更新「已安裝／未安裝」狀態
}
