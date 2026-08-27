import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawn, execFileSync } from 'node:child_process'
import { mkdtemp, rm, mkdir, copyFile, chmod } from 'node:fs/promises'
import { tmpdir, homedir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { HookBridgeServer, type HookEvent } from './bridge/HookBridgeServer.js'
import { StateMachine } from './state/StateMachine.js'
import { TranscriptReader } from './transcript/TranscriptReader.js'
import type { SessionState, UsageSnapshot } from '@shared/types.js'

/**
 * 端到端：真實 claude CLI → hook 腳本 → HookBridgeServer → 狀態機，
 * 以及 transcript tail → usage。
 *
 * 預設不跑（會呼叫 Anthropic API）。啟用：`E2E=1 npx vitest run e2e.integration`
 * 不會動到 ~/.claude/settings.json——hooks 以 `claude --settings <json>` 注入。
 */
const RUN = process.env.E2E === '1'
const CCUI_DIR = join(homedir(), '.claude-code-ui')
const HOOK_SCRIPT = join(CCUI_DIR, 'cc-ui-hook')

describe.runIf(RUN)('e2e：真實 claude CLI 打通 hook 與 transcript', () => {
  const events: HookEvent[] = []
  let bridge: HookBridgeServer
  let projectDir: string
  const sessionId = randomUUID()

  beforeAll(async () => {
    bridge = new HookBridgeServer((e) => events.push(e))
    await bridge.start()

    await mkdir(CCUI_DIR, { recursive: true })
    await copyFile(join(process.cwd(), 'resources', 'cc-ui-hook'), HOOK_SCRIPT)
    await chmod(HOOK_SCRIPT, 0o755)

    projectDir = await mkdtemp(join(tmpdir(), 'ccui-e2e-'))
  })

  afterAll(async () => {
    await bridge.stop()
    await rm(projectDir, { recursive: true, force: true })
  })

  it('claude -p 觸發 Bash 工具 → 收到 PreToolUse/Stop，狀態機 working→idle', async () => {
    const cliPath = execFileSync(process.env.SHELL || '/bin/zsh', ['-ilc', 'command -v claude'])
      .toString()
      .trim()

    const hookCmd = { type: 'command', command: HOOK_SCRIPT, timeout: 5 }
    const settings = JSON.stringify({
      hooks: Object.fromEntries(
        ['SessionStart', 'PreToolUse', 'PostToolUse', 'Stop', 'SessionEnd'].map((e) => [
          e,
          [{ hooks: [hookCmd] }]
        ])
      )
    })

    await runClaude(cliPath, projectDir, [
      '-p',
      '用 Bash 工具執行這一行指令：echo e2e-ok。執行完就停，不要做其他事。',
      '--session-id',
      sessionId,
      '--settings',
      settings,
      '--dangerously-skip-permissions'
    ])

    const names = events.filter((e) => e.sessionId === sessionId).map((e) => e.hookEventName)
    expect(names).toContain('PreToolUse')
    expect(names).toContain('Stop')

    // 重放到狀態機：先 working 再 idle
    const seen: SessionState[] = []
    const sm = new StateMachine((s) => seen.push(s), () => {})
    for (const n of names) sm.applyHookEvent(n)
    expect(seen.indexOf('working')).toBeGreaterThanOrEqual(0)
    expect(seen.indexOf('idle')).toBeGreaterThan(seen.indexOf('working'))

    // claude -p 跑完 process 結束 → SessionEnd → disconnected（預期）。
    // 互動模式下 session 存活、無 SessionEnd，會停在 idle。
    expect(sm.state).toBe(names.includes('SessionEnd') ? 'disconnected' : 'idle')
  }, 120_000)

  it('transcript tail 取得 usage，已知 model 的 contextRatio 非 null', async () => {
    const snapshot = await firstSnapshot(sessionId, 15_000)
    expect(snapshot).not.toBeNull()
    expect(snapshot!.contextRatio).not.toBeNull()
    const u = snapshot!.usage
    expect(u.inputTokens + u.cacheReadInputTokens + u.cacheCreationInputTokens).toBeGreaterThan(0)
  }, 30_000)
})

function runClaude(cli: string, cwd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cli, args, { cwd, env: process.env })
    let stderr = ''
    child.stderr.on('data', (d) => (stderr += d))
    child.on('error', reject)
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`claude exit ${code}: ${stderr.slice(-500)}`))
    )
  })
}

function firstSnapshot(sessionId: string, timeoutMs: number): Promise<UsageSnapshot | null> {
  return new Promise((resolve) => {
    let reader: TranscriptReader
    const timer = setTimeout(() => {
      void reader?.stop()
      resolve(null)
    }, timeoutMs)
    reader = new TranscriptReader(sessionId, (snap) => {
      clearTimeout(timer)
      void reader.stop()
      resolve(snap)
    })
    void reader.start()
  })
}
