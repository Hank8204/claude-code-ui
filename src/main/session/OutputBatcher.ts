/** PTY 輸出節流（spec_01 §3.5）：累積至 16ms 或 8KB 才 flush 一次。 */
const FLUSH_INTERVAL_MS = 16
const FLUSH_SIZE_BYTES = 8 * 1024

export class OutputBatcher {
  private buffer = ''
  private timer: NodeJS.Timeout | null = null

  constructor(private readonly onFlush: (data: string) => void) {}

  push(chunk: string): void {
    this.buffer += chunk
    if (Buffer.byteLength(this.buffer, 'utf8') >= FLUSH_SIZE_BYTES) {
      this.flush()
      return
    }
    this.timer ??= setTimeout(() => this.flush(), FLUSH_INTERVAL_MS)
  }

  flush(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    if (!this.buffer) return
    const data = this.buffer
    this.buffer = ''
    this.onFlush(data)
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    this.buffer = ''
  }
}
