# Claude Code UI — 元件卡片

手工維護的 standalone 預覽卡片，來源 repo：`claude-code-ui`（Electron 桌面 App）。

> 這**不是**可執行的元件庫 bundle。每張卡片是自帶樣式的 HTML，CSS 直接複製自
> `src/renderer/styles/avatar.css` 與 `global.css`。設計時可作視覺參考，但無法用真實
> React 元件 render（元件與 `window.ccui` IPC 綁死）。

## 卡片

| 卡片 | 內容 |
|---|---|
| AgentAvatar | 小人 6 狀態（idle / working / committing / waiting_input / error / disconnected）+ burnout |
| OfficeRoom | 完整工位卡片，5 種狀態組合 |
| SessionControlsBar | spec_04 §3 常駐開關列（模型 / 深度 / 自動批准 / 極速） |
| RoomToolbar | spec_04 §2 一鍵指令列（/compact /rewind /review Ctrl-C） |
| StaminaBar | 體力條 6 種區間 |

## 主題 token（`src/renderer/styles/global.css`）

跟隨系統深淺色。關鍵變數：

- `--bg` / `--panel` / `--text` / `--text-dim` — 底色與文字
- `--room-bg` / `--room-border` — 工位卡片
- `--figure-light` / `--figure-mid` / `--figure-dark` — 小人漸層
- `--state-working`（藍）/ `--state-waiting`（黃）/ `--state-error`（紅）/ `--burnout`（紅）
- `--stamina-green` / `--stamina-yellow` / `--stamina-red` / `--stamina-unknown`

小人與房間**全部純 CSS 幾何**，動畫只動 `transform` / `opacity`，尊重 `prefers-reduced-motion`。
