/**
 * 工位底部「一鍵指令列」的可選指令與設定正規化（spec_04 §2）。
 *
 * 指令有兩種來源：內建目錄（TOOLBAR_CATALOG）與使用者自訂（CustomCommand）。
 * 使用者在設定頁面挑最多 TOOLBAR_MAX 個開啟；順序即挑選順序。
 * 設定存 renderer 的 localStorage（見 settingsStore），這裡只放與存放方式無關的
 * 純資料與純函式，方便單測。
 */

export interface ToolbarCommandDef {
  id: string
  label: string
  title: string
  /** 送進 PTY 的字串（不含結尾 `\r`）。內建項省略時等同 `id`。 */
  command?: string
  /** 使用者自訂（設定頁面可刪）。 */
  custom?: boolean
}

/** 使用者自訂指令。`command` 會被送進 PTY（RoomToolbar 補結尾 `\r`）。 */
export interface CustomCommand {
  id: string
  label: string
  command: string
}

/** 內建可選指令。Ctrl-C 不在此列——那是工位標題列的「關閉」鍵。 */
export const TOOLBAR_CATALOG: readonly ToolbarCommandDef[] = [
  { id: '/compact', label: '/compact', title: '壓縮記憶——context 逼近上限時回血' },
  { id: '/clear', label: '/clear', title: '清空對話重新開始（工位會自動接到新 session）' },
  { id: '/rewind', label: '/rewind', title: '時光倒流——開啟檢查點選單' },
  { id: '/review', label: '/review', title: '對當前變更做程式碼審查' },
  { id: '/context', label: '/context', title: '顯示 context window 用量明細' },
  { id: '/cost', label: '/cost', title: '顯示這個 session 到目前的花費' },
  { id: '/model', label: '/model', title: '切換思考模型' },
  { id: '/agents', label: '/agents', title: '管理 subagent' },
  { id: '/mcp', label: '/mcp', title: '檢視 MCP server 連線狀態' }
]

/** 指令列最多顯示幾個按鈕。 */
export const TOOLBAR_MAX = 4
/** 自訂指令最多幾條。 */
export const CUSTOM_MAX = 12
const LABEL_MAX = 24
const COMMAND_MAX = 200

/** 預設開啟的指令。 */
export const DEFAULT_TOOLBAR: readonly string[] = ['/compact', '/clear', '/rewind', '/review']

/** 內建目錄的 id 集合。 */
export const CATALOG_IDS: ReadonlySet<string> = new Set(TOOLBAR_CATALOG.map((c) => c.id))

/** 自訂指令 → 目錄項（給 RoomToolbar / 設定頁面統一處理）。 */
export function customToDef(c: CustomCommand): ToolbarCommandDef {
  return { id: c.id, label: c.label, title: `自訂指令：送出 ${c.command}`, command: c.command, custom: true }
}

/**
 * 把「開啟的 id 清單」解析成實際要渲染的按鈕定義（內建 + 自訂），
 * 丟掉不存在的 id、截到 TOOLBAR_MAX。
 */
export function resolveToolbar(
  enabled: readonly string[],
  custom: readonly CustomCommand[]
): ToolbarCommandDef[] {
  const byId = new Map<string, ToolbarCommandDef>()
  for (const d of TOOLBAR_CATALOG) byId.set(d.id, d)
  for (const c of custom) byId.set(c.id, customToDef(c))

  const out: ToolbarCommandDef[] = []
  const seen = new Set<string>()
  for (const id of enabled) {
    const def = byId.get(id)
    if (!def || seen.has(id)) continue
    seen.add(id)
    out.push(def)
    if (out.length >= TOOLBAR_MAX) break
  }
  return out
}

/** 去除未知 / 非字串 / 重複 id，截到 TOOLBAR_MAX。`known` = 內建 ∪ 自訂 的 id。 */
export function sanitizeToolbar(ids: readonly unknown[], known: ReadonlySet<string>): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const id of ids) {
    if (typeof id !== 'string' || !known.has(id) || seen.has(id)) continue
    seen.add(id)
    out.push(id)
    if (out.length >= TOOLBAR_MAX) break
  }
  return out
}

/** 正規化自訂指令清單：型別檢查、去空白、截長度與條數。 */
export function sanitizeCustom(raw: unknown): CustomCommand[] {
  if (!Array.isArray(raw)) return []
  const out: CustomCommand[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue
    const rec = item as Record<string, unknown>
    const id = typeof rec.id === 'string' ? rec.id : ''
    const label = typeof rec.label === 'string' ? rec.label.trim() : ''
    const command = typeof rec.command === 'string' ? rec.command.trim() : ''
    if (!id || !label || !command || seen.has(id) || CATALOG_IDS.has(id)) continue
    seen.add(id)
    out.push({ id, label: label.slice(0, LABEL_MAX), command: command.slice(0, COMMAND_MAX) })
    if (out.length >= CUSTOM_MAX) break
  }
  return out
}

/** 產生一個新的自訂指令 id。 */
export function makeCustomId(): string {
  return `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}
