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

## 使用方式（從原始碼執行）

**本 App 刻意不分發打包好的 `.app`。** macOS 對未經 Apple Developer ID 簽章 +
notarize 的 App 限制很多（Gatekeeper 擋、權限反覆索取），而從原始碼跑用的是
`npm` 安裝下來、**Electron 官方已 notarize 過**的執行檔，這些摩擦全部消失。
本 App 的受眾本來就有 Node、會用終端機，這個門檻趨近於零。

```bash
git clone <repo-url> claude-code-ui
cd claude-code-ui

nvm use            # 對齊 .nvmrc 的 Node 版本（重要——node-pty 對 ABI 敏感）
npm install        # postinstall 會自動把 node-pty 對 Electron ABI 重編
npm run dev        # 啟動（開發模式，含 HMR；日常就用這個）
```

- 首次啟動會**徵求同意後**寫入 `~/.claude/settings.json`（見上方警告）。
- 找不到 `claude` 會跳錯誤橫幅 → 選單「設定 → 指定 claude CLI 路徑」。
- `npm install` 失敗多半是 `node-pty` 對 Electron ABI 不符 → 跑 `npm run rebuild`。
- 想跑「production 版」（無 dev server / HMR）：`npm start`（= build + preview）。
- `npm run package` 會產出 `release/mac-*/*.app`，但那是 ad-hoc 簽章、僅供本機自用。

## 在 IntelliJ IDEA 開發

專案已內建 npm run configurations（`.idea/runConfigurations/`，隨 repo 提供）。
在 **Run/Debug Configurations** 下拉、或 **Services** 工具視窗（`⌘8`）裡直接跑：

| 設定 | 對應 script | 用途 |
|---|---|---|
| **dev** | `npm run dev` | 日常開發，HMR |
| **app (build + run)** | `npm start` | 跑 production 版 |
| **test** | `npm test` | vitest |
| **typecheck** / **lint** | — | `tsc --noEmit` / ESLint |
| **check (typecheck+lint+test)** | `npm run check` | 提交前一次跑完 |
| **package .app** | `npm run package` | 打包 |

首次開啟專案時：

1. IntelliJ 會偵測到 `package.json` → 提示 **Run 'npm install'**，讓它跑完。
2. **Settings → Languages & Frameworks → Node.js**：把 Node interpreter 指向
   `nvm use` 那版（run config 用的是 `node-interpreter value="project"`）。
3. 若 IntelliJ 把它當成 Java 專案（`.idea/*.iml` 是舊模板殘留、已不進版控）：
   關掉專案 → `rm -rf .idea/*.iml .idea/misc.xml .idea/modules.xml` → 重開，
   IntelliJ 會依 `package.json` 重新當 JS 專案匯入（`runConfigurations/` 會保留）。

## 指令一覽

| 指令 | 用途 |
|---|---|
| `npm run dev` | electron-vite 開發模式，含 HMR |
| `npm start` | `electron-vite build` + `preview`（production 版執行） |
| `npm run check` | typecheck + lint + test 一次跑完 |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | vitest（狀態機 / transcript 解析 / hook 合併 / `/usage` 解析） |
| `npm run lint` | ESLint |
| `npm run rebuild` | 手動把 node-pty 對 Electron ABI 重編 |
| `npm run package` | `electron-vite build` + `electron-builder --dir`（ad-hoc 簽章，本機自用） |

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
