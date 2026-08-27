import { randomUUID } from 'node:crypto'
import { basename } from 'node:path'
import { ClaudeSession } from './ClaudeSession.js'
import { resolveClaudeCliPath } from '../cli-resolver.js'
import { SessionNotFoundError } from '../errors.js'
import type { HookEvent } from '../bridge/HookBridgeServer.js'
import type {
  AppStateSnapshot,
  MainToRenderer,
  ProjectSnapshot
} from '@shared/types.js'

type Emit = <C extends keyof MainToRenderer>(channel: C, payload: MainToRenderer[C]) => void

interface ProjectRecord {
  projectId: string
  projectPath: string
  displayName: string
  serial: number
}

/**
 * 所有 session 的生命週期與派送中樞（spec_01 §3.1）。
 *
 * 主鍵永遠是 sessionId；projectId 只是分組用的次要索引。專案本身不持有狀態，
 * 專案層級顯示一律由其下 session 即時彙總（在 renderer 做）。
 */
export class SessionManager {
  private readonly projects = new Map<string, ProjectRecord>()
  private readonly sessions = new Map<string, ClaudeSession>()
  private cliPath: string | null = null
  private foregroundId: string | null = null

  constructor(
    private readonly emit: Emit,
    private readonly userCliPath?: string
  ) {}

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

    this.broadcastProjectSessions(project.projectId)
    return { sessionId }
  }

  async restart(sessionId: string): Promise<{ sessionId: string }> {
    const old = this.require(sessionId)
    const cliPath = await this.ensureCliPath()
    await old.dispose('restart')
    this.sessions.delete(sessionId)

    const revived = new ClaudeSession({
      sessionId,
      projectId: old.projectId,
      projectPath: old.projectPath,
      displayName: old.displayName,
      cliPath,
      resume: true
    })
    this.register(revived)
    await revived.start()
    this.broadcastProjectSessions(old.projectId)
    return { sessionId }
  }

  rename(sessionId: string, displayName: string): void {
    this.require(sessionId).rename(displayName)
    this.emitAppState()
  }

  async stop(sessionId: string): Promise<void> {
    const session = this.require(sessionId)
    await session.dispose('user-stop')
    // 保留工位：不從 sessions 移除，維持空的 OfficeRoom（disconnected 狀態）
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

  /** 依 session_id 精準派送 hook 事件。未知 session 靜默忽略（spec_03 §3.2）。 */
  dispatchHookEvent(event: HookEvent): void {
    this.sessions.get(event.sessionId)?.handleHookEvent(event.hookEventName)
  }

  getState(): AppStateSnapshot {
    return {
      projects: [...this.projects.values()].map(toProjectSnapshot),
      sessions: [...this.sessions.values()].map((s) => s.snapshot())
    }
  }

  async disposeAll(): Promise<void> {
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
