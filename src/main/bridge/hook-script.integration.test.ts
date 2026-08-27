import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawn } from 'node:child_process'
import { mkdtemp, rm, writeFile, chmod, copyFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer, type Server } from 'node:http'
import { randomBytes } from 'node:crypto'

/**
 * 真實跑 `resources/cc-ui-hook` bash 腳本 → HTTP 接收端。
 * 驗證腳本的 sed 解析、curl POST、token header 這一段接縫（不含 claude 本身）。
 * 只碰 localhost，無網路、無 API。以 HOME 覆寫讓腳本讀測試用的 bridge.json。
 */
describe('cc-ui-hook 腳本', () => {
  const bodies: Array<{ headers: Record<string, unknown>; json: unknown }> = []
  let server: Server
  let port: number
  const token = randomBytes(12).toString('hex')
  let home: string
  let scriptPath: string

  beforeAll(async () => {
    server = createServer((req, res) => {
      const chunks: Buffer[] = []
      req.on('data', (c) => chunks.push(c))
      req.on('end', () => {
        try {
          bodies.push({ headers: req.headers, json: JSON.parse(Buffer.concat(chunks).toString()) })
        } catch {
          bodies.push({ headers: req.headers, json: null })
        }
        res.writeHead(200)
        res.end()
      })
    })
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    port = (server.address() as { port: number }).port

    home = await mkdtemp(join(tmpdir(), 'ccui-hook-'))
    await mkdir(join(home, '.claude-code-ui'), { recursive: true })
    await writeFile(
      join(home, '.claude-code-ui', 'bridge.json'),
      JSON.stringify({ port, token })
    )
    scriptPath = join(home, 'cc-ui-hook')
    await copyFile(join(process.cwd(), 'resources', 'cc-ui-hook'), scriptPath)
    await chmod(scriptPath, 0o755)
  })

  afterAll(async () => {
    await new Promise<void>((r) => server.close(() => r()))
    await rm(home, { recursive: true, force: true })
  })

  it('把 stdin payload 原封轉發，帶正確 token header', async () => {
    const payload = {
      session_id: 'sess-abc',
      hook_event_name: 'PermissionRequest',
      cwd: '/tmp/proj',
      tool_name: 'Bash'
    }
    const exit = await run(scriptPath, home, payload)
    expect(exit).toBe(0)

    await waitFor(() => bodies.length > 0, 3000)
    const got = bodies[0]
    expect(got.headers['x-ccui-token']).toBe(token)
    expect(got.json).toEqual(payload)
  })

  it('bridge.json 不存在 → 秒退 exit 0，不 POST', async () => {
    const before = bodies.length
    const exit = await run(scriptPath, join(home, 'nope'), { session_id: 'x', hook_event_name: 'Stop' })
    expect(exit).toBe(0)
    await new Promise((r) => setTimeout(r, 300))
    expect(bodies.length).toBe(before)
  })
})

function run(script: string, home: string, payload: unknown): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn('bash', [script], { env: { ...process.env, HOME: home } })
    child.on('error', reject)
    child.on('close', (code) => resolve(code ?? -1))
    child.stdin.write(JSON.stringify(payload))
    child.stdin.end()
  })
}

function waitFor(pred: () => boolean, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const tick = (): void => {
      if (pred()) return resolve()
      if (Date.now() - start > timeoutMs) return reject(new Error('waitFor 逾時'))
      setTimeout(tick, 50)
    }
    tick()
  })
}
