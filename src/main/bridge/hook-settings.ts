/**
 * ~/.claude/settings.json 的 hooks 區塊純函式操作（spec_03 §6）。
 *
 * 抽成無副作用的模組——合併/移除邏輯是最該測的一段，出錯會破壞使用者環境。
 * 檔案 IO 留在 hook-installer.ts。
 */

/** 以固定 command 路徑作為可辨識標記——移除時只刪路徑相符的項目。 */
export const HOOK_COMMAND = '~/.claude-code-ui/cc-ui-hook'

/** 每個事件都掛同一支腳本；事件種類由 payload 的 hook_event_name 區分。 */
export const HOOK_EVENTS = [
  'SessionStart',
  'PreToolUse',
  'PostToolUse',
  'PermissionRequest',
  'Stop',
  'SessionEnd',
  'PostCompact'
] as const

export interface HookCommand {
  type: string
  command: string
  timeout?: number
}
export interface HookGroup {
  hooks: HookCommand[]
}
export type SettingsShape = { hooks?: Record<string, HookGroup[]> } & Record<string, unknown>

/** 合併：僅在對應事件陣列 append 自己那一筆，保留使用者既有 hook。 */
export function addOurHooks(input: SettingsShape): SettingsShape {
  const settings: SettingsShape = { ...input, hooks: { ...(input.hooks ?? {}) } }
  for (const event of HOOK_EVENTS) {
    settings.hooks![event] = appendEntry(settings.hooks![event] ?? [])
  }
  return settings
}

/** 移除：只刪 command 路徑相符的項目，清掉因此變空的群組與事件。 */
export function removeOurHooks(input: SettingsShape): SettingsShape {
  if (!input.hooks) return input
  const settings: SettingsShape = { ...input, hooks: { ...input.hooks } }

  for (const event of Object.keys(settings.hooks!)) {
    const pruned = settings.hooks![event]
      .map((group) => ({ ...group, hooks: group.hooks.filter((h) => h.command !== HOOK_COMMAND) }))
      .filter((group) => group.hooks.length > 0)
    if (pruned.length > 0) settings.hooks![event] = pruned
    else delete settings.hooks![event]
  }
  if (Object.keys(settings.hooks!).length === 0) delete settings.hooks
  return settings
}

export function hasOurHooks(settings: SettingsShape): boolean {
  const groups = settings.hooks?.PermissionRequest ?? []
  return groups.some((g) => g.hooks.some((h) => h.command === HOOK_COMMAND))
}

function appendEntry(groups: HookGroup[]): HookGroup[] {
  const already = groups.some((g) => g.hooks.some((h) => h.command === HOOK_COMMAND))
  if (already) return groups
  return [...groups, { hooks: [{ type: 'command', command: HOOK_COMMAND, timeout: 5 }] }]
}
