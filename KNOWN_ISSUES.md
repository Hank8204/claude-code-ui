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
- **下一步**：(1) 找出「怎樣的 turn 才會觸發 claude 寫 transcript」；(2) 視情況向 Claude Code 團隊回報

### ISSUE-003 · 新增專案只能手動貼路徑
- **嚴重度**：Medium
- **分類**：`ux`
- **狀態**：未修（M3 範圍，spec 已註明）
- **現象**：AddProjectBar 是純文字輸入，沒有原生資料夾選取器。
- **下一步**：M3 換成 Electron `dialog.showOpenDialog`。

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
| ISSUE-002 | CLI 找不到時沒有錯誤 UI → app:error 事件 + 錯誤橫幅 + 選單「指定 claude CLI 路徑」 | (本次) |
| — | packaged .app `node: command not found`（PATH 未傳給 spawn 的 claude） | `c1a134b` |
| — | 唯讀誤判：PTY 死掉的 session 被當成 readonly、打不開 | `6884385` |
| — | 接回不存在對話的 session 讓小人倒下 → resume fallback | `a17a93d` / `6da82fd` |
| — | session 無法命名、只有 `#N` 編號 | `c1a134b` |
| — | 幽靈工位累積、無法移除 → 「移除」按鈕 | `61dc025` |
| — | 終端機視窗不能調大小 / 不能選停靠位置 | `6884385` |
