import { spawn } from 'node:child_process'
import type { UsageReport, UsageLimit } from '@shared/types.js'

const FETCH_TIMEOUT_MS = 20_000
const MAX_OUTPUT_BYTES = 512 * 1024

/**
 * 解析 `/usage` 的純文字報告。找不到的欄位回 null——解析失敗不該讓整個功能壞掉。
 *
 * 報告開頭長這樣：
 *   Current session: 91% used · resets Aug 29 at 8pm (Asia/Taipei)
 *   Current week (all models): 8% used · resets Sep 5 at 4am (Asia/Taipei)
 */
export function parseUsageReport(result: string, fetchedAt: number): UsageReport {
  const pick = (re: RegExp): UsageLimit | null => {
    const m = result.match(re)
    if (!m) return null
    const percent = Number(m[1])
    if (!Number.isFinite(percent)) return null
    return { percent, resetsAt: m[2].trim() }
  }
  return {
    fetchedAt,
    session: pick(/Current session:\s*(\d+)%\s*used\s*·\s*resets\s*([^\n]+)/i),
    week: pick(/Current week[^:\n]*:\s*(\d+)%\s*used\s*·\s*resets\s*([^\n]+)/i),
    raw: result.trim()
  }
}

/** 跑 `claude -p "/usage" --output-format json` 抓一次帳號用量。 */
export async function fetchUsageReport(cliPath: string, pathEnv: string): Promise<UsageReport> {
  const stdout = await run(cliPath, ['-p', '/usage', '--output-format', 'json'], pathEnv)
  return parseUsageReport(extractResult(stdout), Date.now())
}

/**
 * 從 `claude -p ... --output-format json` 的 stdout 取 `result` 字串。
 * 正常是單行 JSON，但偶爾會多夾一行（警告等）讓 `JSON.parse(整段)` 失敗——
 * 因此逐行嘗試，取第一個 parse 成功且有 `result` 的。
 */
export function extractResult(stdout: string): string {
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('{')) continue
    try {
      const obj = JSON.parse(trimmed) as { result?: unknown }
      if (typeof obj.result === 'string') return obj.result
    } catch {
      /* 下一行 */
    }
  }
  try {
    const obj = JSON.parse(stdout) as { result?: unknown }
    if (typeof obj.result === 'string') return obj.result
  } catch {
    /* 放棄 */
  }
  return ''
}

function run(cliPath: string, args: string[], pathEnv: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cliPath, args, {
      // stdin 關掉——否則 claude 會等 3 秒 stdin 才繼續
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PATH: pathEnv || process.env.PATH || '' }
    })

    let out = ''
    let size = 0
    let done = false
    const finish = (fn: () => void): void => {
      if (done) return
      done = true
      clearTimeout(timer)
      fn()
    }
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      finish(() => reject(new Error('/usage 逾時')))
    }, FETCH_TIMEOUT_MS)

    child.stdout.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size <= MAX_OUTPUT_BYTES) out += chunk.toString('utf8')
    })
    child.on('error', (err) => finish(() => reject(err)))
    child.on('close', (code) => {
      finish(() => (code === 0 ? resolve(out) : reject(new Error(`/usage 結束碼 ${code}`))))
    })
  })
}
