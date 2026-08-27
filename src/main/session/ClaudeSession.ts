import { spawn, type IPty } from 'node-pty'
import { EventEmitter } from 'node:events'
import { StateMachine } from '../state/StateMachine.js'
import { TranscriptReader } from '../transcript/TranscriptReader.js'
import { OutputBatcher } from './OutputBatcher.js'
import { ReadonlySessionError } from '../errors.js'
import type { SessionSnapshot, SessionState, UsageSnapshot } from '@shared/types.js'

export interface SessionConfig {
  sessionId: string
  projectId: string
  projectPath: string
  displayName: string
  cliPath: string
  /** resume 既有 session 時帶入。 */
  resume?: boolean
}

interface SessionEvents {
  output: [string]
  state: [SessionState]
  usage: [UsageSnapshot]
  burnout: [boolean]
  ended: [string]
}

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
  private usageSnapshot: UsageSnapshot | null = null
  private disposed = false

  constructor(private readonly config: SessionConfig) {
    super()
    this.sessionId = config.sessionId
    this.projectId = config.projectId
    this.projectPath = config.projectPath
    this.displayName = config.displayName

    this.state = new StateMachine(
      (s) => this.emit('state', s),
      (b) => this.emit('burnout', b)
    )
    this.batcher = new OutputBatcher((data) => this.emit('output', data))
    this.transcript = new TranscriptReader(this.sessionId, (snap) => {
      this.usageSnapshot = snap
      this.state.updateContextRatio(snap.contextRatio)
      this.emit('usage', snap)
    })
  }

  get isReadonly(): boolean {
    return this.pty === null
  }

  async start(): Promise<void> {
    this.spawnPty()
    await this.transcript.start()
  }

  /** 收到經 session_id 派送過來的 hook 事件。 */
  handleHookEvent(hookEventName: string): void {
    this.state.applyHookEvent(hookEventName)
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
      usage: this.usageSnapshot
    }
  }

  async dispose(reason: string): Promise<void> {
    if (this.disposed) return
    this.disposed = true
    this.batcher.flush()
    this.batcher.dispose()
    this.pty?.kill()
    this.pty = null
    await this.transcript.stop()
    this.state.markEnded()
    this.emit('ended', reason)
  }

  private spawnPty(): void {
    const args = this.config.resume
      ? ['--resume', this.sessionId]
      : ['--session-id', this.sessionId, '--name', this.displayName]

    this.pty = spawn(this.config.cliPath, args, {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: this.projectPath,
      env: process.env as Record<string, string>
    })

    this.pty.onData((data) => this.batcher.push(data))
    this.pty.onExit(({ exitCode }) => this.onPtyExit(exitCode))
  }

  private onPtyExit(exitCode: number): void {
    if (this.disposed) return
    this.pty = null
    this.batcher.flush()
    if (exitCode === 0) {
      this.state.markEnded()
      this.emit('ended', 'exit')
    } else {
      this.state.markPtyCrashed() // 非預期退出 → error，保留工位
    }
  }
}
