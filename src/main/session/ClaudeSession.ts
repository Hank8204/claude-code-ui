import { spawn, type IPty } from 'node-pty'
import { EventEmitter } from 'node:events'
import { StateMachine } from '../state/StateMachine.js'
import { TranscriptReader } from '../transcript/TranscriptReader.js'
import { OutputBatcher } from './OutputBatcher.js'
import { ReadonlySessionError } from '../errors.js'
import {
  spawnArgsForControls,
  liveCommandsForControls,
  normalizeControls
} from './controls.js'
import {
  DEFAULT_CONTROLS,
  type SessionControls,
  type SessionSnapshot,
  type SessionState,
  type UsageSnapshot
} from '@shared/types.js'

export interface SessionConfig {
  sessionId: string
  projectId: string
  projectPath: string
  displayName: string
  cliPath: string
  /** login shell 的完整 PATH——claude 的 hooks 靠它找 node/bun。 */
  pathEnv?: string
  /** resume 既有 session 時帶入。 */
  resume?: boolean
  /** 外部監看 session（無 PTY handle，不可輸入）。PTY 死掉不算——那是 disconnected。 */
  readonly?: boolean
  /** spec_04 §3：啟動時的常駐開關；未帶則用 DEFAULT_CONTROLS。 */
  controls?: SessionControls
}

interface SessionEvents {
  output: [string]
  state: [SessionState]
  usage: [UsageSnapshot]
  burnout: [boolean]
  controls: [SessionControls]
  ended: [string]
  /** 首次寫出 transcript——此後這個 session 才能 `claude --resume`。 */
  persistable: []
}

/** `--resume` 失敗到改用全新 session 之間的存活時間上限。 */
const RESUME_FALLBACK_WINDOW_MS = 5000

/**
 * 單一 Claude Code session（spec_01 §3.1）。
 *
 * 三條管道各司其職：PTY 負責畫面與互動、TranscriptReader 負責量化資料、
 * StateMachine 由外部餵入的 hook 事件驅動。PTY 可為 null（未來的唯讀監看 session）。
 */
export class ClaudeSession extends EventEmitter<SessionEvents> {
  readonly sessionId: string
  readonly projectId: string
  readonly projectPath: string
  displayName: string

  private pty: IPty | null = null
  private readonly state: StateMachine
  private readonly transcript: TranscriptReader
  private readonly batcher: OutputBatcher
  private controls: SessionControls
  private usageSnapshot: UsageSnapshot | null = null
  private disposed = false
  private resumable = false
  /** `--resume` 已失敗過一次，下次 spawn 改用全新 session。 */
  private resumeFailed = false
  private spawnedAt = 0

  constructor(private readonly config: SessionConfig) {
    super()
    this.sessionId = config.sessionId
    this.projectId = config.projectId
    this.projectPath = config.projectPath
    this.displayName = config.displayName
    this.controls = config.controls ?? { ...DEFAULT_CONTROLS }

    this.state = new StateMachine(
      (s) => this.emit('state', s),
      (b) => this.emit('burnout', b)
    )
    this.batcher = new OutputBatcher((data) => this.emit('output', data))
    this.transcript = new TranscriptReader(this.sessionId, (snap) => {
      this.usageSnapshot = snap
      this.state.updateContextRatio(snap.contextRatio)
      this.emit('usage', snap)
      this.markResumable()
    })
  }

  get isReadonly(): boolean {
    return this.config.readonly ?? false
  }

  /** transcript 已存在——這個 session 現在可以被 `claude --resume` 接回。 */
  get isResumable(): boolean {
    return this.resumable
  }

  private markResumable(): void {
    if (this.resumable) return
    this.resumable = true
    this.emit('persistable')
  }

  async start(): Promise<void> {
    this.spawnPty()
    await this.transcript.start()
  }

  /** 收到經 session_id 派送過來的 hook 事件。 */
  handleHookEvent(hookEventName: string, ctx?: { toolName?: string; command?: string }): void {
    this.state.applyHookEvent(hookEventName, ctx)
  }

  get currentControls(): SessionControls {
    return this.controls
  }

  /**
   * spec_04 §3：更新常駐開關。執行中會把差異即時送進 PTY（樂觀套用，無確認回饋）。
   * @returns 套用後的完整開關值。
   */
  setControls(patch: Partial<SessionControls>): SessionControls {
    const next = normalizeControls(patch, this.controls)
    if (this.pty) {
      for (const cmd of liveCommandsForControls(this.controls, next)) this.pty.write(cmd)
    }
    this.controls = next
    this.emit('controls', next)
    return next
  }

  /** spec_04 §2：送一鍵指令進 PTY（呼叫端負責帶結尾 `\r`）。 */
  sendCommand(command: string): void {
    if (!this.pty) throw new ReadonlySessionError(this.sessionId)
    this.pty.write(command)
  }

  /** spec_04 §2：Ctrl-C 中斷。 */
  interrupt(): void {
    if (!this.pty) throw new ReadonlySessionError(this.sessionId)
    this.pty.write('\x03')
  }

  /** hook payload 帶來的 transcript_path，轉給 TranscriptReader 作定位提示。 */
  noteTranscriptPath(path: string): void {
    this.transcript.setPathHint(path)
  }

  write(data: string): void {
    if (!this.pty) throw new ReadonlySessionError(this.sessionId)
    this.pty.write(data)
  }

  resize(cols: number, rows: number): void {
    if (cols > 0 && rows > 0) this.pty?.resize(cols, rows)
  }

  /** 送出 /compact；PostCompact hook 會觸發 transcript 重新取樣。 */
  compact(): void {
    this.pty?.write('/compact\r')
  }

  rename(displayName: string): void {
    this.displayName = displayName
  }

  snapshot(): SessionSnapshot {
    return {
      sessionId: this.sessionId,
      projectId: this.projectId,
      projectPath: this.projectPath,
      displayName: this.displayName,
      readonly: this.isReadonly,
      state: this.state.state,
      isBurnout: this.state.isBurnout,
      usage: this.usageSnapshot,
      controls: this.controls
    }
  }

  /**
   * @param hard App 關閉時為 true——立即停掉 transcript reader；
   *   否則（使用者停止 / 重啟）讓 reader 續盯數分鐘抓延遲寫出的 transcript。
   */
  async dispose(reason: string, hard = false): Promise<void> {
    if (this.disposed) return
    this.disposed = true
    await this.shutdownPty()
    this.batcher.flush()
    this.batcher.dispose()
    if (hard) await this.transcript.stop()
    else this.transcript.detach()
    this.state.markEnded()
    this.emit('ended', reason)
  }

  /**
   * 優雅關閉 PTY：先送 /exit，逾時才強制 kill。
   * claude 互動模式對 SIGHUP 不寫 transcript；/exit 也只是讓它「開始」延遲寫出。
   */
  private async shutdownPty(): Promise<void> {
    const pty = this.pty
    this.pty = null
    if (!pty) return
    try {
      pty.write('/exit\r')
    } catch {
      /* PTY 可能已關 */
    }
    await new Promise((resolve) => setTimeout(resolve, 800))
    try {
      pty.kill()
    } catch {
      /* 已退出 */
    }
  }

  private spawnPty(): void {
    const resuming = Boolean(this.config.resume) && !this.resumeFailed
    const base = resuming
      ? ['--resume', this.sessionId]
      : ['--session-id', this.sessionId, '--name', this.displayName]
    const args = [...base, ...spawnArgsForControls(this.controls)]

    this.spawnedAt = Date.now()
    this.log(`spawn ${this.config.cliPath} ${args.join(' ')}`)
    this.pty = spawn(this.config.cliPath, args, {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: this.projectPath,
      env: {
        ...(process.env as Record<string, string>),
        PATH: this.config.pathEnv || process.env.PATH || ''
      }
    })

    this.pty.onData((data) => this.batcher.push(data))
    this.pty.onExit(({ exitCode }) => this.onPtyExit(exitCode))
  }

  private onPtyExit(exitCode: number): void {
    if (this.disposed) return
    this.pty = null
    this.batcher.flush()
    const aliveMs = Date.now() - this.spawnedAt
    this.log(`pty exit code=${exitCode} aliveMs=${aliveMs}`)

    // resume 後很快退出 = 對話不存在（不論 exit code）→ 以全新 session 重生一次
    if (this.shouldRetryWithoutResume(aliveMs)) {
      this.log('resume 疑似失敗，改用 --session-id 全新重生')
      this.resumeFailed = true
      this.spawnPty()
      return
    }
    if (exitCode === 0) {
      this.state.markEnded()
      this.emit('ended', 'exit')
    } else {
      this.state.markPtyCrashed() // 非預期退出 → error，保留工位
    }
  }

  private shouldRetryWithoutResume(aliveMs: number): boolean {
    return (
      Boolean(this.config.resume) && !this.resumeFailed && aliveMs < RESUME_FALLBACK_WINDOW_MS
    )
  }

  private log(message: string): void {
    console.error(`[session ${this.sessionId.slice(0, 8)}] ${message}`)
  }
}
