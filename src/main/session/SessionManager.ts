import { randomUUID } from 'node:crypto'
import { basename } from 'node:path'
import { ClaudeSession } from './ClaudeSession.js'
import { normalizeControls } from './controls.js'
import { pickForkParent, type ForkCandidate } from './fork-adopt.js'
import { TranscriptReader } from '../transcript/TranscriptReader.js'
import { resolveClaudeEnv, type ClaudeEnv } from '../cli-resolver.js'
import { SessionNotFoundError } from '../errors.js'
import type { HookEvent } from '../bridge/HookBridgeServer.js'
import type {
  PersistedProject,
  PersistedSession,
  WorkspacePort
} from '../config/store.js'
import {
  DEFAULT_CONTROLS,
  type AppStateSnapshot,
  type MainToRenderer,
  type ProjectSnapshot,
  type SessionControls,
  type SessionSnapshot,
  type UsageSnapshot
} from '@shared/types.js'

type Emit = <C extends keyof MainToRenderer>(channel: C, payload: MainToRenderer[C]) => void

type ProjectRecord = PersistedProject

/**
 * 所有 session 的生命週期與派送中樞（spec_01 §3.1）。
 *
 * 主鍵永遠是 sessionId；projectId 只是分組用的次要索引。專案本身不持有狀態，
 * 專案層級顯示一律由其下 session 即時彙總（在 renderer 做）。
 *
 * 專案清單與 session 中繼資料經 `workspace` port 持久化（spec_01 §5）。重新啟動後
 * 未啟動的 session 以「休眠工位」呈現（`disconnected`），使用者可 `--resume` 接回。
 */
export class SessionManager {
  private readonly projects = new Map<string, ProjectRecord>()
  private readonly sessions = new Map<string, ClaudeSession>()
  private readonly dormant = new Map<string, PersistedSession>()
  /** 休眠 session 的 transcript reader——抓延遲寫出的 transcript、補上 usage。 */
  private readonly dormantReaders = new Map<string, TranscriptReader>()
  private readonly dormantUsage = new Map<string, UsageSnapshot>()
  /** sessionId → 轉 disconnected / error 的時間戳。`/clear` fork adopt 的時間窗判斷用。 */
  private readonly endedAt = new Map<string, number>()
  private claudeEnv: ClaudeEnv | null = null
  private foregroundId: string | null = null

  constructor(
    private readonly emit: Emit,
    private readonly workspace: WorkspacePort,
    private userCliPath?: string
  ) {}

  /** App 啟動時載入持久化的專案與休眠 session。在 registerIpcHandlers 之前呼叫。 */
  restore(): void {
    const { projects, sessions } = this.workspace.load()
    for (const project of projects) this.projects.set(project.projectId, { ...project })
    for (const session of sessions) {
      if (!this.projects.has(session.projectId)) continue
      this.dormant.set(session.sessionId, session)
      this.attachDormantReader(session.sessionId)
    }
  }

  /** 讓休眠工位的 transcript reader 繼續盯——互動模式 transcript 延遲寫出。 */
  private attachDormantReader(sessionId: string): void {
    const reader = new TranscriptReader(sessionId, (snap) => {
      this.dormantUsage.set(sessionId, snap)
      this.emitAppState()
    })
    this.dormantReaders.set(sessionId, reader)
    void reader.start()
  }

  /**
   * 使用者移除一個工位。可移除：
   * (1) 休眠工位（app 重啟後由持久化重建的）；
   * (2) 本次執行中已 `disconnected` / `error` 的 live session——它仍在 `sessions`
   *     裡（`stop()` / PTY exit 都不會把它移到 `dormant`），舊版只查 `dormant`
   *     所以這種情況「移除」按了沒反應。
   * 執行中的 session 不允許移除，請先「停止」。
   */
  async forget(sessionId: string): Promise<void> {
    const live = this.sessions.get(sessionId)
    if (live) {
      const state = live.snapshot().state
      if (state !== 'disconnected' && state !== 'error') {
        throw new Error(`session ${sessionId} 仍在執行中，請先停止再移除`)
      }
      await live.dispose('user-forget', true)
      this.sessions.delete(sessionId)
      this.endedAt.delete(sessionId)
      await this.dormantReaders.get(sessionId)?.stop()
      this.dormantReaders.delete(sessionId)
      this.dormantUsage.delete(sessionId)
      this.persist()
      this.broadcastProjectSessions(live.projectId)
      return
    }

    const record = this.dormant.get(sessionId)
    if (!record) throw new SessionNotFoundError(sessionId)
    await this.dormantReaders.get(sessionId)?.stop()
    this.dormantReaders.delete(sessionId)
    this.dormantUsage.delete(sessionId)
    this.dormant.delete(sessionId)
    this.persist()
    this.broadcastProjectSessions(record.projectId)
  }

  async start(
    projectPath: string,
    displayName?: string,
    controlsPatch?: Partial<SessionControls>
  ): Promise<{ sessionId: string }> {
    const env = await this.ensureClaudeEnv()
    const project = this.ensureProject(projectPath)
    const sessionId = randomUUID()
    const name = displayName?.trim() || `${project.displayName} #${++project.serial}`

    const session = new ClaudeSession({
      sessionId,
      projectId: project.projectId,
      projectPath,
      displayName: name,
      cliPath: env.cliPath,
      pathEnv: env.pathEnv,
      controls: normalizeControls(controlsPatch, DEFAULT_CONTROLS)
    })
    this.register(session)
    await session.start()

    this.persist()
    this.broadcastProjectSessions(project.projectId)
    return { sessionId }
  }

  /** 重啟 `error` 的 session，或接回休眠 session（皆走 `claude --resume`）。 */
  async restart(sessionId: string): Promise<{ sessionId: string }> {
    const target = this.resolveResumeTarget(sessionId)
    const env = await this.ensureClaudeEnv()

    await this.sessions.get(sessionId)?.dispose('restart')
    this.sessions.delete(sessionId)
    this.dormant.delete(sessionId)
    this.endedAt.delete(sessionId)
    await this.dormantReaders.get(sessionId)?.stop()
    this.dormantReaders.delete(sessionId)

    const revived = new ClaudeSession({
      sessionId: target.sessionId,
      projectId: target.projectId,
      projectPath: target.projectPath,
      displayName: target.displayName,
      controls: target.controls,
      initialUsage: target.usage,
      cliPath: env.cliPath,
      pathEnv: env.pathEnv,
      resume: true
    })
    this.register(revived)
    await revived.start()

    this.persist()
    this.broadcastProjectSessions(target.projectId)
    return { sessionId }
  }

  rename(sessionId: string, displayName: string): void {
    const live = this.sessions.get(sessionId)
    const sleeping = this.dormant.get(sessionId)
    if (live) live.rename(displayName)
    else if (sleeping) this.dormant.set(sessionId, { ...sleeping, displayName })
    else throw new SessionNotFoundError(sessionId)

    this.persist()
    this.emitAppState()
  }

  async stop(sessionId: string): Promise<void> {
    const session = this.require(sessionId)
    await session.dispose('user-stop')
    // 保留工位：不從 sessions 移除，維持空的 OfficeRoom（disconnected 狀態）
    this.persist()
    this.broadcastProjectSessions(session.projectId)
  }

  input(sessionId: string, data: string): void {
    this.require(sessionId).write(data)
  }

  resize(sessionId: string, cols: number, rows: number): void {
    this.require(sessionId).resize(cols, rows)
  }

  compact(sessionId: string): void {
    this.require(sessionId).compact()
  }

  /** spec_04 §2：一鍵指令送進 PTY。 */
  sendCommand(sessionId: string, command: string): void {
    this.require(sessionId).sendCommand(command)
  }

  /** spec_04 §2：Ctrl-C 中斷。 */
  interrupt(sessionId: string): void {
    this.require(sessionId).interrupt()
  }

  /** 工位標題列「關閉」——連送兩次 Ctrl-C 讓 claude 直接跳出。 */
  close(sessionId: string): void {
    this.require(sessionId).close()
  }

  /** spec_04 §3：更新常駐開關。 */
  setControls(sessionId: string, patch: Partial<SessionControls>): void {
    this.require(sessionId).setControls(patch)
  }

  /** 控制輸出轉發（spec_01 §3.5）：只有前景 session 的 output 會廣播。 */
  setForeground(sessionId: string | null): void {
    if (sessionId !== null && !this.sessions.has(sessionId)) {
      throw new SessionNotFoundError(sessionId)
    }
    this.foregroundId = sessionId
  }

  /** 依 session_id 精準派送 hook 事件。未知（含休眠）session 靜默忽略（spec_03 §3.2）。 */
  dispatchHookEvent(event: HookEvent): void {
    const session = this.sessions.get(event.sessionId)
    console.error(
      `[hook] ${event.hookEventName} session=${event.sessionId.slice(0, 8)} known=${Boolean(session)} src=${event.source ?? '-'} tp=${event.transcriptPath ?? '-'}`
    )
    if (!session) {
      if (event.hookEventName === 'SessionStart') void this.tryAdoptFork(event)
      return
    }
    if (event.transcriptPath) session.noteTranscriptPath(event.transcriptPath)
    session.handleHookEvent(event.hookEventName, {
      toolName: event.toolName,
      command: event.command
    })
  }

  /**
   * `/clear` 讓 claude 在同一個 PTY 內換了新 session id（ISSUE-009）。收到那個未知 id
   * 的 SessionStart 時，把「剛斷線但 PTY 還活著」的工位接到新 id：工位不會卡在
   * disconnected，「接回」也會 `--resume` 到 clear 之後的（空）對話。
   */
  private async tryAdoptFork(event: HookEvent): Promise<void> {
    const candidates: ForkCandidate[] = [...this.sessions.values()].map((s) => ({
      sessionId: s.sessionId,
      projectPath: s.projectPath,
      endedAt: this.endedAt.get(s.sessionId),
      hasLivePty: s.hasLivePty
    }))
    const parentId = pickForkParent(
      { cwd: event.cwd, source: event.source },
      candidates,
      Date.now()
    )
    if (!parentId) return

    const parent = this.sessions.get(parentId)
    if (!parent) return
    console.error(
      `[hook] adopt fork ${parentId.slice(0, 8)} → ${event.sessionId.slice(0, 8)}`
    )

    await parent.adoptForkedSession(event.sessionId, event.transcriptPath)
    this.sessions.delete(parentId)
    this.sessions.set(event.sessionId, parent)
    this.endedAt.delete(parentId)
    if (this.foregroundId === parentId) this.foregroundId = event.sessionId

    this.emit('session:reattached', {
      oldSessionId: parentId,
      newSessionId: event.sessionId
    })
    this.persist()
    this.broadcastProjectSessions(parent.projectId)
  }

  getState(): AppStateSnapshot {
    return {
      projects: [...this.projects.values()].map(toProjectSnapshot),
      sessions: [
        ...[...this.sessions.values()].map((s) => s.snapshot()),
        ...[...this.dormant.values()].map((s) => this.dormantSnapshot(s))
      ]
    }
  }

  async disposeAll(): Promise<void> {
    this.persist() // 關閉前把最新狀態寫下
    await Promise.all([
      ...[...this.sessions.values()].map((s) => s.dispose('app-quit', true)),
      ...[...this.dormantReaders.values()].map((r) => r.stop())
    ])
    this.sessions.clear()
    this.dormantReaders.clear()
  }

  private register(session: ClaudeSession): void {
    this.sessions.set(session.sessionId, session)
    session.on('output', (data) => {
      if (session.sessionId === this.foregroundId) {
        this.emit('session:output', { sessionId: session.sessionId, data })
      }
    })
    session.on('state', (state) => {
      this.emit('session:state', { sessionId: session.sessionId, state })
      if (state === 'disconnected' || state === 'error') {
        this.endedAt.set(session.sessionId, Date.now())
      }
    })
    session.on('usage', (usage) =>
      this.emit('session:usage', { sessionId: session.sessionId, usage })
    )
    session.on('burnout', (isBurnout) =>
      this.emit('session:burnout', { sessionId: session.sessionId, isBurnout })
    )
    session.on('controls', (controls) => {
      this.emit('session:controls', { sessionId: session.sessionId, controls })
      this.persist()
    })
    session.on('ended', (reason) =>
      this.emit('session:ended', { sessionId: session.sessionId, reason })
    )
    // session 首次寫出 transcript 才可 --resume——此時才寫進持久化
    session.on('persistable', () => this.persist())
  }

  private ensureProject(projectPath: string): ProjectRecord {
    for (const record of this.projects.values()) {
      if (record.projectPath === projectPath) return record
    }
    const record: ProjectRecord = {
      projectId: randomUUID(),
      projectPath,
      displayName: basename(projectPath) || projectPath,
      serial: 0
    }
    this.projects.set(record.projectId, record)
    return record
  }

  private resolveResumeTarget(sessionId: string): {
    sessionId: string
    projectId: string
    projectPath: string
    displayName: string
    controls: SessionControls
    usage: UsageSnapshot | null
  } {
    const live = this.sessions.get(sessionId)
    if (live) {
      return {
        sessionId,
        projectId: live.projectId,
        projectPath: live.projectPath,
        displayName: live.displayName,
        controls: live.currentControls,
        usage: live.currentUsage
      }
    }
    const sleeping = this.dormant.get(sessionId)
    const project = sleeping && this.projects.get(sleeping.projectId)
    if (!sleeping || !project) throw new SessionNotFoundError(sessionId)
    return {
      sessionId,
      projectId: sleeping.projectId,
      projectPath: project.projectPath,
      displayName: sleeping.displayName,
      controls: normalizeControls(sleeping.controls, DEFAULT_CONTROLS),
      usage: this.dormantUsage.get(sessionId) ?? null
    }
  }

  private dormantSnapshot(session: PersistedSession): SessionSnapshot {
    const project = this.projects.get(session.projectId)
    return {
      sessionId: session.sessionId,
      projectId: session.projectId,
      projectPath: project?.projectPath ?? '',
      displayName: session.displayName,
      readonly: false,
      state: 'disconnected',
      isBurnout: false,
      usage: this.dormantUsage.get(session.sessionId) ?? null,
      usageStale: false,
      controls: normalizeControls(session.controls, DEFAULT_CONTROLS)
    }
  }

  /**
   * 持久化所有 session。互動模式 transcript 延遲寫出，無法在 start 當下判斷是否
   * 可 resume，因此全部存下；接不回的靠 `--resume` fallback 全新重生，多餘的靠
   * 「移除」按鈕清掉。
   */
  private persist(): void {
    const live: PersistedSession[] = [...this.sessions.values()].map((s) => ({
      sessionId: s.sessionId,
      projectId: s.projectId,
      displayName: s.displayName,
      controls: s.currentControls
    }))
    this.workspace.save({
      projects: [...this.projects.values()],
      sessions: [...live, ...this.dormant.values()]
    })
  }

  private async ensureClaudeEnv(): Promise<ClaudeEnv> {
    this.claudeEnv ??= await resolveClaudeEnv(this.userCliPath ?? undefined)
    return this.claudeEnv
  }

  /** 使用者在設定中指定 CLI 路徑後呼叫——清快取，下次 start 重新解析。 */
  setCliPath(path: string): void {
    this.userCliPath = path
    this.claudeEnv = null
  }

  private require(sessionId: string): ClaudeSession {
    const session = this.sessions.get(sessionId)
    if (!session) throw new SessionNotFoundError(sessionId)
    return session
  }

  private broadcastProjectSessions(projectId: string): void {
    const sessionIds = [...this.sessions.values()]
      .filter((s) => s.projectId === projectId)
      .map((s) => s.sessionId)
    this.emit('project:sessions', { projectId, sessionIds })
    this.emitAppState()
  }

  private emitAppState(): void {
    this.emit('app:state', this.getState())
  }
}

function toProjectSnapshot(record: ProjectRecord): ProjectSnapshot {
  return {
    projectId: record.projectId,
    projectPath: record.projectPath,
    displayName: record.displayName
  }
}
