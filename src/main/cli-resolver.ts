import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync } from 'node:fs'
import { CliNotFoundError } from './errors.js'

const execFileAsync = promisify(execFile)

/**
 * 解析 claude CLI 的絕對路徑（spec_01 §3.2）。
 *
 * macOS 上從 Finder / Dock 啟動的 Electron 繼承 launchd 的 PATH，不含 nvm / homebrew，
 * 直接 spawn('claude') 會 ENOENT。依序嘗試：使用者指定路徑 → login shell 撈取。
 * 結果由呼叫端快取，不要每次啟動 session 都重跑。
 */
export async function resolveClaudeCliPath(userSpecifiedPath?: string): Promise<string> {
  if (userSpecifiedPath && existsSync(userSpecifiedPath)) {
    return userSpecifiedPath
  }

  const fromLoginShell = await probeViaLoginShell()
  if (fromLoginShell) return fromLoginShell

  throw new CliNotFoundError()
}

/** 以 login + interactive shell 執行 `command -v claude`，取得真實環境下的路徑。 */
async function probeViaLoginShell(): Promise<string | null> {
  const shell = process.env.SHELL || '/bin/zsh'
  try {
    const { stdout } = await execFileAsync(shell, ['-ilc', 'command -v claude'], {
      timeout: 5000,
      encoding: 'utf8'
    })
    const candidate = stdout.trim().split('\n').pop()?.trim()
    return candidate && existsSync(candidate) ? candidate : null
  } catch {
    return null
  }
}
