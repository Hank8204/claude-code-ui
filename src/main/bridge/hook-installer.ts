import { readFile, writeFile, copyFile, chmod, mkdir, access } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { CCUI_DIR } from './HookBridgeServer.js'
import { HookInstallError } from '../errors.js'
import {
  addOurHooks,
  removeOurHooks,
  hasOurHooks,
  type SettingsShape
} from './hook-settings.js'

const CLAUDE_DIR = join(homedir(), '.claude')
const SETTINGS_FILE = join(CLAUDE_DIR, 'settings.json')
const BACKUP_FILE = join(CLAUDE_DIR, 'settings.json.ccui-backup')
const HOOK_SCRIPT_DEST = join(CCUI_DIR, 'cc-ui-hook')

/**
 * 安裝全域 hooks（spec_03 §6）。合併而非覆寫；寫入前備份一次。
 * 呼叫端必須已取得使用者同意——影響範圍是所有 Claude Code session。
 */
export async function installHooks(bundledScriptPath: string): Promise<void> {
  await deployScript(bundledScriptPath)
  const settings = await readSettings()
  await backupOnce(settings)
  await writeSettings(addOurHooks(settings))
}

/** 解除安裝：還原至無本 App 痕跡的狀態。 */
export async function uninstallHooks(): Promise<void> {
  const settings = await readSettings()
  await writeSettings(removeOurHooks(settings))
}

export async function areHooksInstalled(): Promise<boolean> {
  return hasOurHooks(await readSettings())
}

async function deployScript(bundledScriptPath: string): Promise<void> {
  await mkdir(CCUI_DIR, { recursive: true })
  await copyFile(bundledScriptPath, HOOK_SCRIPT_DEST)
  await chmod(HOOK_SCRIPT_DEST, 0o755)
}

async function readSettings(): Promise<SettingsShape> {
  try {
    return JSON.parse(await readFile(SETTINGS_FILE, 'utf8')) as SettingsShape
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {}
    throw new HookInstallError('無法讀取 ~/.claude/settings.json', err)
  }
}

async function backupOnce(settings: SettingsShape): Promise<void> {
  try {
    await access(BACKUP_FILE)
  } catch {
    await writeFile(BACKUP_FILE, JSON.stringify(settings, null, 2))
  }
}

async function writeSettings(settings: SettingsShape): Promise<void> {
  await mkdir(CLAUDE_DIR, { recursive: true })
  await writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2) + '\n')
}
