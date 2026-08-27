# 待修正問題 / Known Issues

本檔追蹤已知但尚未（或無法）完全解決的問題。每次遇到新問題就在對應嚴重度區塊新增一列，
修掉後移到「已解決」並註記 commit。

## 嚴重度定義

| 級別 | 意義 |
|---|---|
| **Blocker** | 核心流程不可用，M1 不能宣告完成 |
| **High** | 主要功能明顯壞掉或誤導使用者，但有 workaround |
| **Medium** | 功能降級 / 邊緣情境出錯 / 明顯 UX 缺陷 |
| **Low** | 小瑕疵、technical debt、測試缺口 |

## 分類標籤

`upstream`（claude CLI 本身行為） · `correctness`（邏輯錯誤） · `ux` · `packaging` ·
`spec-deviation`（偏離 spec 的設計決定） · `test-gap` · `observability`

---

## 未解決

### ISSUE-001 · 互動模式 transcript 延遲數分鐘才寫出
- **嚴重度**：Medium
- **分類**：`upstream` `spec-deviation`
- **狀態**：已緩解，接受降級（2026-08-27）
- **現象**：`claude --session-id X --name Y`（互動）啟動後，`~/.claude/projects/<proj>/X.jsonl`
  不會立即出現，先只有 `X/tool-results/`；`.jsonl` 數分鐘後才寫出，短 session 甚至可能一直沒有。
  `claude -p` 模式則立即寫。
- **影響**：session 剛開的前幾分鐘 StaminaBar 顯示「Context 未知」；空跑的 session 可能永遠拿不到 usage、
  `--resume` 會失敗。
- **根因**：claude 2.1.247 的行為改變 / 內部批次寫入，非本專案可控。spec_01 §3.3 假設可即時 tail。
- **緩解**（commit `61dc025`）：
  - TranscriptReader 輪詢到 deadline（活著 20min、結束後再盯 6min）
  - restore 後為休眠工位掛 reader 補延遲 usage
  - `--resume` 失敗 → 5s 內退出就用全新 `--session-id` 重生
  - 「移除」按鈕清幽靈工位
- **淨效果**：有實質對話 → 幾分鐘後一切正常；空跑 session → StaminaBar「未知」+ resume fallback
- **接回時的緩解（本次）**：`restart()` 把接回前的 `usage` 帶進新 session 當初始值，
  StaminaBar 先顯示舊值並標「（上次）」+ 斜紋，新 transcript 到來再更新，不再整個空掉。
  StaminaBar 文案也分「等待 transcript」與「model 無對照：<名稱>」兩種。
- **下一步**：(1) 找出「怎樣的 turn 才會觸發 claude 寫 transcript」；(2) 視情況向 Claude Code 團隊回報

### ISSUE-007 · spec_04 §3 常駐開關：執行中改動無確認回饋（樂觀顯示）
- **嚴重度**：Medium
- **分類**：`upstream` `ux`
- **狀態**：已知限制，使用者接受（2026-08-27）
- **現象**：model / effort / autoApprove / fast 開關在 session 執行中改動時，只能往 PTY
  送 `/model`、`/effort`、`/fast` 或 Shift-Tab。claude CLI 不回報實際狀態，UI 顯示的是
  「使用者意圖」而非 CLI 真實值，兩者可能不同步（例如 claude 版本不吃某個 slash command）。
- **緩解**：建立 / resume session 時改以啟動參數（`--model` / `--effort` /
  `--permission-mode`）精準帶入——這條路徑 100% 可控。`--model` 之後也可由 transcript 的
  `usage.model` 間接確認。
- **下一步**：確認 claude 2.1.247 是否有 `/effort`、`/model <alias>` 這些 slash command；
  沒有的話改為「改開關 = 觸發 resume 重生」。

### ISSUE-008 · autoApprove 執行中切換無法抵達 bypassPermissions
- **嚴重度**：Low
- **分類**：`upstream`
- **現象**：claude 互動模式只有 Shift-Tab 循環（normal → acceptEdits → plan），
  `bypassPermissions` 只能靠啟動參數。執行中按開關只送一次 Shift-Tab 做最佳努力。
- **下一步**：想要真正的「全自動」請在建立 session 時勾「自動批准」。

### ISSUE-009 · `/clear` 會換掉 session id，打破本 App 的追蹤
- **嚴重度**：Medium
- **分類**：`upstream` `correctness`
- **狀態**：已從一鍵指令列移除 `/clear`（2026-08-27）
- **現象**：按 `/clear` 後小人變暗、按「接回」後被清掉的對話又跑回來。
- **根因**：claude `/clear` 會結束當前 session、以**全新 session id** 重開。本 App 用
  `--session-id X` 釘住 session：clear 之後
  (1) 舊 id 收到 `SessionEnd` → 狀態機轉 `disconnected`（小人變暗）；
  (2) 新 id 的 hook 事件因 `known=false` 被忽略；
  (3) 「接回」走 `claude --resume 舊id` → 載回的是 clear **之前**的對話。
- **緩解**：拿掉 `/clear` 按鈕。要乾淨重來請用「停止」再新增一個 session。
- **下一步**：M4 若要支援，需在送 `/clear` 後從同一 PTY/cwd 的 hook 事件裡認領新 session id 並重新綁定。

### ISSUE-004 · PTY 非預期退出 → error 狀態未實機驗證
- **嚴重度**：Low
- **分類**：`test-gap`
- **狀態**：邏輯在（`onPtyExit` 非零 → `markPtyCrashed`），但沒有實際觸發過。
- **下一步**：手動殺掉某個 session 的 claude 子程序，確認小人倒下 + 「重啟」可用。

### ISSUE-005 · e2e 測試需手動觸發
- **嚴重度**：Low
- **分類**：`test-gap`
- **現象**：`src/main/e2e.integration.test.ts` 預設 skip，要 `E2E=1` 才跑，且會呼叫 Anthropic API。
  Claude Code 的 auto-mode 分類器會擋含 `--dangerously-skip-permissions` 的指令。
- **下一步**：接受現狀（e2e 本來就該手動 / CI 專跑）。

### ISSUE-006 · claude-mem plugin 對每個 session 另跑 SDK query
- **嚴重度**：Low
- **分類**：`observability`
- **現象**：使用者環境裝了 claude-mem plugin，它的 hook 會對我們開的 session id 再 spawn 一個
  `claude --output-format stream-json ... --no-session-persistence` 做記憶觀察。
- **影響**：`ps` 會看到額外的 claude 程序；不是我們的 bug，但除錯時容易混淆。
- **下一步**：無動作，記錄備查。

---

## 已解決

| ID | 標題 | commit |
|---|---|---|
| ISSUE-003 | 新增專案只能貼路徑 → 加原生資料夾選取器（`project:pick` + 「瀏覽…」按鈕） | (本次) |
| ISSUE-002 | CLI 找不到時沒有錯誤 UI → app:error 事件 + 錯誤橫幅 + 選單「指定 claude CLI 路徑」 | `a05012a` |
| — | packaged .app `node: command not found`（PATH 未傳給 spawn 的 claude） | `c1a134b` |
| — | 唯讀誤判：PTY 死掉的 session 被當成 readonly、打不開 | `6884385` |
| — | 接回不存在對話的 session 讓小人倒下 → resume fallback | `a17a93d` / `6da82fd` |
| — | session 無法命名、只有 `#N` 編號 | `c1a134b` |
| — | 幽靈工位累積、無法移除 → 「移除」按鈕 | `61dc025` |
| — | 終端機視窗不能調大小 / 不能選停靠位置 | `6884385` |
