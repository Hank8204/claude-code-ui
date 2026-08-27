import Store from 'electron-store'

/** 持久化資料（spec_01 §5）。M1 只存 hook 同意決定與 CLI 路徑。 */
interface PersistedShape {
  /** 使用者對「寫入全域 hooks」的決定。undefined = 尚未詢問。 */
  hookConsent?: 'granted' | 'declined'
  /** 使用者在設定中指定的 claude CLI 絕對路徑。 */
  cliPath?: string
}

const store = new Store<PersistedShape>({
  name: 'claude-code-ui',
  defaults: {}
})

export function getHookConsent(): PersistedShape['hookConsent'] {
  return store.get('hookConsent')
}

export function setHookConsent(value: NonNullable<PersistedShape['hookConsent']>): void {
  store.set('hookConsent', value)
}

export function clearHookConsent(): void {
  store.delete('hookConsent')
}

export function getUserCliPath(): string | undefined {
  return store.get('cliPath')
}

export function setUserCliPath(path: string): void {
  store.set('cliPath', path)
}
