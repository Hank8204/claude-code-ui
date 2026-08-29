# Claude Code UI

一個 2D 俯視角的桌面儀表板：每個專案是一層「辦公室」，每個 Claude Code session 是一個
「白色小人」工位，即時反映該 session 的狀態（工作中 / 等待你確認 / 發呆 / 異常 / 結束）
與 context window 佔用率。

小人與房間**全部以純 CSS 幾何圖形繪製**，沒有 three.js、沒有任何圖片資產。

## ⚠️ 本 App 會修改你的 Claude Code 設定

啟動時會（在徵求你同意後）寫入 `~/.claude/settings.json`，註冊**全域 hooks**。
這些 hook 會在你**所有**的 Claude Code session 上執行，包含與本 App 無關的。

* 寫入內容：`SessionStart` / `PreToolUse` / `PostToolUse` / `PermissionRequest` /
  `Stop` / `SessionEnd` / `PostCompact` 各掛一支
  `~/.claude-code-ui/cc-ui-hook` 腳本（單向遙測，1 秒硬性 timeout，永不阻擋 CLI）。
* 寫入前會備份成 `~/.claude/settings.json.ccui-backup`。
* **合併而非覆寫**：你既有的其他 hook 不受影響。
* 移除方式：設定 →「解除安裝 hooks」，會還原至無本 App 痕跡的狀態。

## 系統需求

| 項目 | 版本 |
|---|---|
| macOS | 13+（Apple Silicon 或 Intel） |
| Node.js | 見 `.nvmrc`（22.x）——**務必一致**，`node-pty` 對 ABI 敏感 |
| Claude Code CLI | 已安裝且可在你的 shell 執行 `claude` |

## 建置

```bash
nvm use                 # 對齊 Node 版本（重要）
npm install             # postinstall 會自動 rebuild 原生模組
npm run rebuild         # 若 node-pty 對 Electron ABI 不符時手動重編
npm run dev             # 開發模式
npm run package         # 打包出 release/mac/*.app（本機 build，ad-hoc 簽章）
```

`node-pty` 是 native module，需對 Electron 的 ABI 重新編譯。版本不符是最常見的建置
失敗原因——遇到時跑 `npm run rebuild`。

## 開發指令

| 指令 | 用途 |
|---|---|
| `npm run dev` | electron-vite 開發模式，含 HMR |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | vitest（狀態機 / transcript 解析 / hook 合併） |
| `npm run lint` | ESLint |
| `npm run package` | `electron-vite build` + `electron-builder --dir` |

## 架構

核心設計：**畫面與狀態分離**。PTY 輸出只負責 xterm.js 顯示；狀態由 hooks 經
`127.0.0.1` 送回主進程；量化資料（token / cost）由 tail transcript JSONL 取得。
Renderer 不做任何文字解析。

```
src/
├── shared/          # 主進程與 renderer 共用型別、model 對照表
├── main/
│   ├── session/     # ClaudeSession、SessionManager、OutputBatcher
│   ├── transcript/  # TranscriptReader（tail JSONL）、usage 計算
│   ├── state/       # StateMachine（hook 事件驅動）
│   ├── bridge/      # HookBridgeServer、hook 安裝/移除
│   └── cli-resolver.ts
├── preload/         # contextBridge 白名單
└── renderer/
    ├── components/  # ProjectFloor / OfficeRoom / AgentAvatar / StaminaBar / TerminalView
    ├── store/       # 低頻狀態容器、樓層彙總
    └── styles/      # 純 CSS 小人與房間
```

## 已知問題

見 [`KNOWN_ISSUES.md`](KNOWN_ISSUES.md)。最需要注意的是 **ISSUE-001**：claude 2.1.247
互動模式的 transcript 是延遲數分鐘才寫出的，因此 session 剛開時體力條會顯示「Context 未知」，
待 transcript 出現後才補上。

若 App 找不到 `claude`，會跳錯誤橫幅，可從選單「設定 → 指定 claude CLI 路徑」手動指定。

## 里程碑

* **M1**（完成）：單一專案 PTY → xterm 可打字 → hook 通了 → 小人會動；含打包驗證
* **M2**（完成）：transcript tail → 體力條 + `/compact` 咖啡按鈕
* **M3**（大致完成）：多專案樓層、多 session、設定持久化、error / disconnected、原生資料夾選取器
* **spec_04**（完成）：一鍵指令列、常駐開關（模型 / 思考深度 / 自動批准 / 極速）、
  `committing` 狀態
* **Claude Design 改版**（2026-08）：小人 → session 名牌、compact 卡片點擊展開；
  一鍵指令列改成可在「設定」（⚙）裡挑，最多 4 個（內建目錄 + 自訂指令；預設
  `/compact` `/clear` `/rewind` `/review`）；Ctrl-C 移到工位標題列的「關閉」鍵；
  `/clear` 換 session id 的問題已修
  （ISSUE-009，工位會自動接到新 id）
* **M4**（未來）：外部 session 唯讀監看

一鍵指令與常駐開關的細節、限制見 spec_04 與 [`KNOWN_ISSUES.md`](KNOWN_ISSUES.md)
（ISSUE-007 / 008：執行中改開關是樂觀顯示，無 CLI 確認回饋）。

## License

MIT
