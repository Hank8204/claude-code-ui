import { createServer, type Server } from 'node:http'
import { randomBytes } from 'node:crypto'
import { writeFile, rm, mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const CCUI_DIR = join(homedir(), '.claude-code-ui')
const BRIDGE_FILE = join(CCUI_DIR, 'bridge.json')
const TOKEN_HEADER = 'x-ccui-token'
const MAX_BODY_BYTES = 64 * 1024

/** 一筆已解析的 hook 事件。其餘欄位一律忽略（spec_03 §3.1）。 */
export interface HookEvent {
  sessionId: string
  hookEventName: string
  cwd: string
  toolName?: string
  transcriptPath?: string
}

/**
 * Hooks 事件接收端（spec_03 §4）。
 *
 * 127.0.0.1 + 系統指派 port（listen 0）；token 防本機其他程序偽造；
 * 一律回 200——不要讓 App 的錯誤變成 CLI 的錯誤。
 */
export class HookBridgeServer {
  private server: Server | null = null
  private token = ''

  constructor(private readonly onEvent: (event: HookEvent) => void) {}

  async start(): Promise<void> {
    this.token = randomBytes(24).toString('hex')
    this.server = createServer((req, res) => this.handle(req, res))

    await new Promise<void>((resolve, reject) => {
      this.server!.once('error', reject)
      this.server!.listen(0, '127.0.0.1', resolve)
    })

    await this.writeBridgeFile()
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve) => this.server?.close(() => resolve()))
    this.server = null
    await rm(BRIDGE_FILE, { force: true })
  }

  private get port(): number {
    const addr = this.server?.address()
    return addr && typeof addr === 'object' ? addr.port : 0
  }

  private async writeBridgeFile(): Promise<void> {
    await mkdir(CCUI_DIR, { recursive: true })
    const payload = JSON.stringify({ port: this.port, token: this.token })
    await writeFile(BRIDGE_FILE, payload, { mode: 0o600 })
  }

  private handle(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse): void {
    const done = (code: number): void => {
      res.writeHead(code)
      res.end()
    }
    if (req.method !== 'POST' || req.url !== '/hook') return done(404)
    if (req.headers[TOKEN_HEADER] !== this.token) return done(403)

    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size <= MAX_BODY_BYTES) chunks.push(c)
    })
    req.on('end', () => {
      this.dispatch(Buffer.concat(chunks).toString('utf8'))
      done(200) // 永遠 200，即使 payload 無法解析
    })
    req.on('error', () => done(200))
  }

  private dispatch(body: string): void {
    let raw: unknown
    try {
      raw = JSON.parse(body)
    } catch {
      return
    }
    if (typeof raw !== 'object' || raw === null) return
    const r = raw as Record<string, unknown>
    if (typeof r.session_id !== 'string' || typeof r.hook_event_name !== 'string') return

    this.onEvent({
      sessionId: r.session_id,
      hookEventName: r.hook_event_name,
      cwd: typeof r.cwd === 'string' ? r.cwd : '',
      toolName: typeof r.tool_name === 'string' ? r.tool_name : undefined,
      transcriptPath: typeof r.transcript_path === 'string' ? r.transcript_path : undefined
    })
  }
}
