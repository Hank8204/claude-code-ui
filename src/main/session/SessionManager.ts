import { randomUUID } from 'node:crypto'
import { basename } from 'node:path'
import { ClaudeSession } from './ClaudeSession.js'
import { resolveClaudeCliPath } from '../cli-resolver.js'
import { SessionNotFoundError } from '../errors.js'
import type { HookEvent } from '../bridge/HookBridgeServer.js'
import type {
  PersistedProject,
  PersistedSession,
  WorkspacePort
} from '../config/store.js'
import type {
  AppStateSnapshot,
  MainToRenderer,
  ProjectSnapshot,
  SessionSnapshot
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
  private cliPath: string | null = null
  private foregroundId: string | null = null

  constructor(
    private readonly emit: Emit,
    private readonly workspace: WorkspacePort,
    private readonly userCliPath?: string
  ) {}

  /** App 啟動時載入持久化的專案與休眠 session。在 registerIpcHandlers 之前呼叫。 */
  restore(): void {
    const { projects, sessions } = this.workspace.load()
    for (const project of projects) this.projects.set(project.projectId, { ...project })
    for (const session of sessions) {
      if (this.projects.has(session.projectId)) this.dormant.set(session.sessionId, session)
    }
  }

  async start(projectPath: string): Promise<{ sessionId: string }> {
    const cliPath = await this.ensureCliPath()
    const project = this.ensureProject(projectPath)
    const sessionId = randomUUID()
    const displayName = `${project.displayName} #${++project.serial}`

    const session = new ClaudeSession({
      sessionId,
      projectId: project.projectId,
      projectPath,
      displayName,
      cliPath
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
    const cliPath = await this.ensureCliPath()

    await this.sessions.get(sessionId)?.dispose('restart')
    this.sessions.delete(sessionId)
    this.dormant.delete(sessionId)

    const revived = new ClaudeSession({ ...target, cliPath, resume: true })
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

  /** 控制輸出轉發（spec_01 §3.5）：只有前景 session 的 output 會廣播。 */
  setForeground(sessionId: string | null): void {
    if (sessionId !== null && !this.sessions.has(sessionId)) {
      throw new SessionNotFoundError(sessionId)
    }
    this.foregroundId = sessionId
  }

  /** 依 session_id 精準派送 hook 事件。未知（含休眠）session 靜默忽略（spec_03 §3.2）。 */
  dispatchHookEvent(event: HookEvent): void {
    const known = this.sessions.has(event.sessionId)
    console.error(
      `[hook] ${event.hookEventName} session=${event.sessionId.slice(0, 8)} known=${known}`
    )
    this.sessions.get(event.sessionId)?.handleHookEvent(event.hookEventName)
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
    await Promise.all([...this.sessions.values()].map((s) => s.dispose('app-quit')))
    this.sessions.clear()
  }

  private register(session: ClaudeSession): void {
    this.sessions.set(session.sessionId, session)
    session.on('output', (data) => {
      if (session.sessionId === this.foregroundId) {
        this.emit('session:output', { sessionId: session.sessionId, data })
      }
    })
    session.on('state', (state) =>
      this.emit('session:state', { sessionId: session.sessionId, state })
    )
    session.on('usage', (usage) =>
      this.emit('session:usage', { sessionId: session.sessionId, usage })
    )
    session.on('burnout', (isBurnout) =>
      this.emit('session:burnout', { sessionId: session.sessionId, isBurnout })
    )
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
  } {
    const live = this.sessions.get(sessionId)
    if (live) {
      return {
        sessionId,
        projectId: live.projectId,
        projectPath: live.projectPath,
        displayName: live.displayName
      }
    }
    const sleeping = this.dormant.get(sessionId)
    const project = sleeping && this.projects.get(sleeping.projectId)
    if (!sleeping || !project) throw new SessionNotFoundError(sessionId)
    return {
      sessionId,
      projectId: sleeping.projectId,
      projectPath: project.projectPath,
      displayName: sleeping.displayName
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
      usage: null
    }
  }

  /** 只持久化「已可 --resume」的 session——避免存下從未產生對話的幽靈工位。 */
  private persist(): void {
    const live: PersistedSession[] = [...this.sessions.values()]
      .filter((s) => s.isResumable)
      .map((s) => ({
        sessionId: s.sessionId,
        projectId: s.projectId,
        displayName: s.displayName
      }))
    this.workspace.save({
      projects: [...this.projects.values()],
      sessions: [...live, ...this.dormant.values()]
    })
  }

  private async ensureCliPath(): Promise<string> {
    this.cliPath ??= await resolveClaudeCliPath(this.userCliPath)
    return this.cliPath
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
