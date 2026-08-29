import { fetchUsageReport } from './usageReport.js'
import { DEFAULT_USAGE_INTERVAL_MS } from '@shared/usage.js'
import type { ClaudeEnv } from '../cli-resolver.js'
import type { UsageReport } from '@shared/types.js'

/**
 * 定期跑 `claude -p "/usage"` 抓帳號用量，推給 renderer（Dashboard 的用量表）。
 *
 * - 輪詢間隔由 renderer 從設定推入（configure）；0 = 不自動更新
 * - 手動 refresh 立即抓；同時只跑一個（去重）——renderer 掛載時也會呼叫一次，
 *   結果直接由 refresh() 的回傳值拿到，不吃「事件比訂閱早發」的 race
 * - 抓失敗只記 log，保留上一次成功的結果
 */
export class UsagePoller {
  private timer: ReturnType<typeof setInterval> | null = null
  private last: UsageReport | null = null
  private inflight: Promise<UsageReport | null> | null = null

  constructor(
    private readonly getEnv: () => Promise<ClaudeEnv>,
    private readonly onReport: (report: UsageReport) => void,
    private intervalMs: number = DEFAULT_USAGE_INTERVAL_MS
  ) {}

  start(): void {
    void this.refresh()
    this.reschedule()
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  /** 更新輪詢間隔（ms）。0 或負值 = 停掉自動輪詢，只留手動。 */
  configure(intervalMs: number): void {
    if (intervalMs === this.intervalMs) return
    this.intervalMs = intervalMs
    this.reschedule()
  }

  get latest(): UsageReport | null {
    return this.last
  }

  /** 立即抓一次；已有進行中的就回同一個 promise。 */
  async refresh(): Promise<UsageReport | null> {
    this.inflight ??= this.run().finally(() => {
      this.inflight = null
    })
    return this.inflight
  }

  private reschedule(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer =
      this.intervalMs > 0 ? setInterval(() => void this.refresh(), this.intervalMs) : null
  }

  private async run(): Promise<UsageReport | null> {
    try {
      const env = await this.getEnv()
      const report = await fetchUsageReport(env.cliPath, env.pathEnv)
      this.last = report
      this.onReport(report)
      console.error(
        `[usage] session=${report.session?.percent ?? '?'}% week=${report.week?.percent ?? '?'}%`
      )
      return report
    } catch (err) {
      console.error('[usage] 抓取失敗：', err instanceof Error ? err.message : err)
      return null
    }
  }
}
