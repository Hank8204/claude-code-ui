import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync } from 'node:fs'
import { delimiter } from 'node:path'
import { CliNotFoundError } from './errors.js'

const execFileAsync = promisify(execFile)
const MARKER = '__CCUI_PATH__'

export interface ClaudeEnv {
  /** claude CLI 的絕對路徑。 */
  cliPath: string
  /** login shell 的完整 PATH——spawn claude 時要用，否則它的 hooks 會找不到 node/bun。 */
  pathEnv: string
}

/**
 * 解析 claude CLI 路徑與 login shell 的 PATH（spec_01 §3.2）。
 *
 * macOS 從 Finder / Dock 啟動的 Electron 繼承 launchd 的 PATH，不含 nvm / homebrew。
 * 不只 `spawn('claude')` 會 ENOENT，spawn 出來的 claude 執行 hooks 時也會
 * `node: command not found`。因此同時撈路徑與 PATH，結果由呼叫端快取。
 */
export async function resolveClaudeEnv(userSpecifiedPath?: string): Promise<ClaudeEnv> {
  const probed = await probeViaLoginShell()
  const pathEnv = mergePath(probed?.pathEnv, process.env.PATH ?? '')

  if (userSpecifiedPath && existsSync(userSpecifiedPath)) {
    return { cliPath: userSpecifiedPath, pathEnv }
  }
  if (probed?.cliPath) {
    return { cliPath: probed.cliPath, pathEnv }
  }
  throw new CliNotFoundError()
}

/** 一次 login + interactive shell 同時取 `command -v claude` 與 `$PATH`。 */
async function probeViaLoginShell(): Promise<{ cliPath: string | null; pathEnv: string } | null> {
  const shell = process.env.SHELL || '/bin/zsh'
  try {
    const script = `command -v claude; echo ${MARKER}; printf '%s' "$PATH"`
    const { stdout } = await execFileAsync(shell, ['-ilc', script], {
      timeout: 5000,
      encoding: 'utf8'
    })
    const [head, pathEnv = ''] = stdout.split(MARKER)
    const candidate = head.trim().split('\n').pop()?.trim()
    return {
      cliPath: candidate && existsSync(candidate) ? candidate : null,
      pathEnv: pathEnv.trim()
    }
  } catch {
    return null
  }
}

/** 把 login shell 的 PATH 疊在現有 PATH 前面，去重、保序。 */
export function mergePath(loginPath: string | undefined, currentPath = process.env.PATH ?? ''): string {
  const parts = [...(loginPath ?? '').split(delimiter), ...currentPath.split(delimiter)]
  const seen = new Set<string>()
  return parts.filter((p) => p && !seen.has(p) && seen.add(p)).join(delimiter)
}
