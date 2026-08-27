/**
 * spec_04 §3：把 SessionControls 轉成 claude CLI 的啟動參數，以及執行中要送進 PTY 的
 * slash command。純函式，方便單獨測試——這段對錯直接決定 session 起得來與否。
 */
import type { EffortLevel, ModelChoice, SessionControls } from '@shared/types.js'

/** Shift-Tab：claude 互動模式循環切換權限模式的按鍵序列。 */
export const SHIFT_TAB = '\x1b[Z'

/** 啟動 / resume 時精準帶入的參數（fresh 與 resume 都適用）。 */
export function spawnArgsForControls(controls: SessionControls): string[] {
  const args: string[] = []
  if (controls.model !== 'default') args.push('--model', controls.model)
  if (controls.effort) args.push('--effort', controls.effort)
  if (controls.autoApprove) args.push('--permission-mode', 'bypassPermissions')
  return args
}

/**
 * 執行中改開關時，要依序送進 PTY 的字串（每筆自帶結尾）。
 * 只針對「有變動」的欄位產生指令。
 */
export function liveCommandsForControls(
  prev: SessionControls,
  next: SessionControls
): string[] {
  const out: string[] = []
  if (next.model !== prev.model && next.model !== 'default') {
    out.push(`/model ${next.model}\r`)
  }
  if (next.effort !== prev.effort && next.effort) {
    out.push(`/effort ${next.effort}\r`)
  }
  if (next.autoApprove !== prev.autoApprove) {
    // bypassPermissions 無法以按鍵抵達——送一次 Shift-Tab 做最佳努力的循環切換。
    out.push(SHIFT_TAB)
  }
  if (next.fast !== prev.fast) {
    out.push('/fast\r')
  }
  return out
}

export function normalizeControls(patch: Partial<SessionControls> | undefined, base: SessionControls): SessionControls {
  return {
    model: isModelChoice(patch?.model) ? patch!.model! : base.model,
    autoApprove: typeof patch?.autoApprove === 'boolean' ? patch.autoApprove : base.autoApprove,
    effort: patch && 'effort' in patch ? sanitizeEffort(patch.effort) : base.effort,
    fast: typeof patch?.fast === 'boolean' ? patch.fast : base.fast
  }
}

function isModelChoice(value: unknown): value is ModelChoice {
  return value === 'default' || value === 'opus' || value === 'sonnet' || value === 'haiku'
}

function sanitizeEffort(value: unknown): EffortLevel | null {
  const levels: EffortLevel[] = ['low', 'medium', 'high', 'xhigh', 'max']
  return levels.includes(value as EffortLevel) ? (value as EffortLevel) : null
}
