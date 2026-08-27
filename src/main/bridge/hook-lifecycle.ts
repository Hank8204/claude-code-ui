import { app, dialog } from 'electron'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { installHooks, uninstallHooks, areHooksInstalled } from './hook-installer.js'
import { getHookConsent, setHookConsent, clearHookConsent } from '../config/store.js'
import { HookInstallError } from '../errors.js'

/**
 * Hooks 的安裝／移除生命週期（spec_03 §6，M1 必要功能）。
 *
 * 修改 `~/.claude/settings.json` 影響使用者所有的 Claude Code session，
 * 因此首次啟動必須明確徵求同意；使用者拒絕時 App 仍可運作（只是小人不會動）。
 */

/** 打包後腳本在 process.resourcesPath；開發時在專案的 resources/。 */
function bundledScriptPath(): string {
  const packaged = join(process.resourcesPath, 'cc-ui-hook')
  if (app.isPackaged && existsSync(packaged)) return packaged
  return join(app.getAppPath(), 'resources', 'cc-ui-hook')
}

/** App 啟動時呼叫。依既有決定決定要不要詢問／安裝。 */
export async function ensureHooksOnStartup(): Promise<void> {
  const consent = getHookConsent()
  if (consent === 'declined') return
  if (consent === 'granted') {
    await installIfNeeded()
    return
  }
  await promptAndInstall()
}

async function promptAndInstall(): Promise<void> {
  const { response } = await dialog.showMessageBox({
    type: 'info',
    buttons: ['同意並安裝', '略過'],
    defaultId: 0,
    cancelId: 1,
    title: '安裝 Claude Code hooks',
    message: 'Claude Code UI 需要寫入全域 hooks 才能顯示 session 狀態',
    detail:
      '將在 ~/.claude/settings.json 註冊 hooks，影響你「所有」的 Claude Code session\n' +
      '（包含與本 App 無關的）。寫入前會備份成 settings.json.ccui-backup，\n' +
      '且為合併而非覆寫。日後可從選單「Hooks → 解除安裝」完全還原。\n\n' +
      '略過的話 App 仍可使用，只是小人不會反映狀態。'
  })

  if (response === 0) {
    setHookConsent('granted')
    await installIfNeeded()
  } else {
    setHookConsent('declined')
  }
}

async function installIfNeeded(): Promise<void> {
  if (await areHooksInstalled()) return
  try {
    await installHooks(bundledScriptPath())
  } catch (err) {
    const detail = err instanceof HookInstallError ? err.message : String(err)
    await dialog.showMessageBox({
      type: 'error',
      title: 'Hooks 安裝失敗',
      message: '無法寫入 ~/.claude/settings.json',
      detail
    })
  }
}

/** 選單觸發：重新安裝。 */
export async function reinstallHooks(): Promise<void> {
  setHookConsent('granted')
  await installHooks(bundledScriptPath())
  await dialog.showMessageBox({ type: 'info', message: 'Hooks 已安裝' })
}

/** 選單觸發：解除安裝並還原。 */
export async function removeHooks(): Promise<void> {
  await uninstallHooks()
  clearHookConsent()
  await dialog.showMessageBox({
    type: 'info',
    message: 'Hooks 已解除安裝',
    detail: '~/.claude/settings.json 已還原至無本 App 痕跡的狀態。'
  })
}

export { areHooksInstalled }
