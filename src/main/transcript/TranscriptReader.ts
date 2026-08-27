import { createReadStream, existsSync, statSync, readdirSync } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import chokidar, { type FSWatcher } from 'chokidar'
import { buildSnapshot, emptyUsage, extractUsage } from './usage.js'
import type { TokenUsage, UsageSnapshot } from '@shared/types.js'

const PROJECTS_ROOT = join(homedir(), '.claude', 'projects')

/**
 * Transcript JSONL 讀取器（spec_01 §3.3）。
 *
 * append-only tail：記住 byte offset 只解析新增行；容忍寫入中途的不完整行
 * （保留殘餘 buffer）與壞行（略過而非拋錯）。欄位缺失時保留前一次的值。
 */
export class TranscriptReader {
  private watcher: FSWatcher | null = null
  private filePath: string | null = null
  private offset = 0
  private pending = ''
  private stopped = false

  private lastModel: string | null = null
  private lastUsage: TokenUsage = emptyUsage()
  private totalCostUsd = 0
  /** hook payload 的 transcript_path——比 glob 權威（spec_03 §3.1）。 */
  private pathHint: string | null = null

  constructor(
    private readonly sessionId: string,
    private readonly onSnapshot: (snapshot: UsageSnapshot) => void
  ) {}

  /** 以 UUID 定位 transcript 檔並開始 tail。找不到時定期重試（CLI 可能還沒建檔）。 */
  async start(): Promise<void> {
    if (this.stopped) return
    this.filePath = await this.locateFile()
    if (!this.filePath) {
      setTimeout(() => void this.start(), 1000)
      return
    }
    this.log(`定位到 transcript：${this.filePath}`)
    await this.consumeNewBytes()
    this.watcher = chokidar.watch(this.filePath, { ignoreInitial: true })
    this.watcher.on('change', () => void this.consumeNewBytes())
  }

  async stop(): Promise<void> {
    this.stopped = true
    await this.watcher?.close()
    this.watcher = null
  }

  /** 由 hook 的 transcript_path 提示實際位置（比 glob 權威）。 */
  setPathHint(path: string): void {
    if (path && !this.pathHint) this.pathHint = path
  }

  private log(message: string): void {
    console.error(`[transcript ${this.sessionId.slice(0, 8)}] ${message}`)
  }

  /**
   * 定位 transcript：優先用 hook 提示的路徑；否則 glob。
   * 相容兩種 layout：`<proj>/<id>.jsonl`（-p 模式）與 `<proj>/<id>/*.jsonl`（互動模式）。
   */
  private async locateFile(): Promise<string | null> {
    const fromHint = this.resolveCandidate(this.pathHint)
    if (fromHint) return fromHint
    if (!existsSync(PROJECTS_ROOT)) return null

    const dirs = await readdir(PROJECTS_ROOT, { withFileTypes: true })
    for (const dir of dirs) {
      if (!dir.isDirectory()) continue
      const base = join(PROJECTS_ROOT, dir.name, this.sessionId)
      const hit = this.resolveCandidate(`${base}.jsonl`) ?? this.resolveCandidate(base)
      if (hit) return hit
    }
    return null
  }

  /** 接受檔案路徑或目錄路徑；目錄則取內含最新的 .jsonl。 */
  private resolveCandidate(path: string | null): string | null {
    if (!path || !existsSync(path)) return null
    if (statSync(path).isFile()) return path
    const inner = readdirSync(path).filter((n) => n.endsWith('.jsonl'))
    return inner.length ? join(path, inner.sort().at(-1)!) : null
  }

  private async consumeNewBytes(): Promise<void> {
    if (!this.filePath) return
    const { size } = await stat(this.filePath)
    if (size <= this.offset) {
      if (size < this.offset) this.resetForTruncation()
      return
    }
    const chunk = await this.readRange(this.offset, size - 1)
    this.offset = size
    this.ingest(chunk)
  }

  private resetForTruncation(): void {
    this.offset = 0
    this.pending = ''
  }

  private readRange(start: number, end: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const parts: Buffer[] = []
      createReadStream(this.filePath!, { start, end })
        .on('data', (d) => parts.push(d as Buffer))
        .on('end', () => resolve(Buffer.concat(parts).toString('utf8')))
        .on('error', reject)
    })
  }

  private ingest(chunk: string): void {
    this.pending += chunk
    const lines = this.pending.split('\n')
    this.pending = lines.pop() ?? '' // 最後一段可能是不完整行，留到下次
    let changed = false
    for (const line of lines) {
      if (this.applyLine(line)) changed = true
    }
    if (changed) {
      const snapshot = buildSnapshot(this.lastModel, this.lastUsage, this.totalCostUsd)
      this.log(`snapshot model=${snapshot.model} contextRatio=${snapshot.contextRatio}`)
      this.onSnapshot(snapshot)
    }
  }

  /** @returns 這一行是否更新了 usage 狀態。 */
  private applyLine(line: string): boolean {
    const trimmed = line.trim()
    if (!trimmed) return false
    let row: unknown
    try {
      row = JSON.parse(trimmed)
    } catch {
      return false // 壞行：略過
    }
    const extracted = extractUsage(row)
    if (!extracted) return false

    if (extracted.model) this.lastModel = extracted.model
    this.lastUsage = extracted.usage
    this.accumulateCost(row)
    return true
  }

  private accumulateCost(row: unknown): void {
    if (typeof row === 'object' && row !== null && 'costUSD' in row) {
      const cost = (row as { costUSD: unknown }).costUSD
      if (typeof cost === 'number' && Number.isFinite(cost)) this.totalCostUsd += cost
    }
  }
}
