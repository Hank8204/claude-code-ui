/**
 * `/clear` 會讓同一個 claude 進程結束當前 session、以**全新 session id** 在同一個
 * PTY 內重開（ISSUE-009）。本 App 用 `--session-id` 釘住 session，所以那個新 id 的
 * hook 事件原本會因 `known=false` 被丟掉：工位卡在 `disconnected`、「接回」還會
 * `--resume` 回 clear 之前的對話。
 *
 * 解法是收到「未知 id 的 SessionStart」時，判斷它是不是某個剛斷線工位的接續，
 * 是的話把工位接到新 id（見 SessionManager.tryAdoptFork）。這個模組只放「該不該接、
 * 接哪一個」的純判斷，方便單測。
 */

/** 舊 session 轉 disconnected / error 後，仍可能收到 fork 出來的新 SessionStart 的時間窗。 */
export const FORK_ADOPT_WINDOW_MS = 15_000

export interface ForkCandidate {
  sessionId: string
  /** spawn 時帶入的 cwd；與 SessionStart 的 cwd 比對。 */
  projectPath: string
  /** 轉 disconnected / error 的時間戳（epoch ms）；未結束為 undefined。 */
  endedAt: number | undefined
  /** PTY 還活著——只有活著的才值得「跟著 fork 走」，死掉的接了也不能用。 */
  hasLivePty: boolean
}

export interface ForkStartEvent {
  cwd: string
  /** SessionStart 的 source：startup | resume | clear | compact。舊版 claude 可能沒有。 */
  source: string | undefined
}

/**
 * 決定這個未知 id 的 SessionStart 該不該被某個工位接手，回傳該工位目前的 sessionId。
 *
 * 規則：
 * - `source` 有值且不是 `'clear'` → 一律不接（正常啟動 / resume / compact 都不換位）
 * - 候選工位必須：PTY 還活著、在時間窗內剛結束、cwd 對得上（event 有帶 cwd 時）
 * - 多個符合 → 取「最近才結束」的那個
 */
export function pickForkParent(
  event: ForkStartEvent,
  candidates: readonly ForkCandidate[],
  now: number
): string | null {
  if (event.source !== undefined && event.source !== 'clear') return null

  let bestId: string | null = null
  let bestEndedAt = -1
  for (const c of candidates) {
    if (!c.hasLivePty) continue
    if (c.endedAt === undefined) continue
    if (now - c.endedAt > FORK_ADOPT_WINDOW_MS) continue
    if (event.cwd && c.projectPath !== event.cwd) continue
    if (c.endedAt > bestEndedAt) {
      bestId = c.sessionId
      bestEndedAt = c.endedAt
    }
  }
  return bestId
}
