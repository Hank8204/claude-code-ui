# design-sync notes

- **這個 repo 不是設計系統元件庫。** 是 Electron 桌面 App，元件（OfficeRoom / AgentAvatar /
  StaminaBar / SessionControlsBar / RoomToolbar）與 `window.ccui` IPC、sessionStore 綁死，
  沒有 prop 驅動的公開 API、沒有可發佈的 build、沒有 Storybook。
- 因此**不跑** `/design-sync` 的轉換器（`package-build.mjs`）與 Storybook 驗證流程。
- 改為手工維護 `demos/components/*.html`（自帶樣式、首行 `@dsCard`），用 DesignSync 工具
  直接 `create_project` / `finalize_plan` / `write_files` 推成卡片庫。
- 卡片 CSS 直接複製自 `src/renderer/styles/avatar.css` / `global.css`——改樣式時兩邊要同步。
- Claude Design 專案：`Claude Code UI` = 81505fe4-3cbb-4c24-8f76-c5d1d5470537
