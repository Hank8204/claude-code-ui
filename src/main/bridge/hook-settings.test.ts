import { describe, it, expect } from 'vitest'
import {
  addOurHooks,
  removeOurHooks,
  hasOurHooks,
  HOOK_COMMAND,
  HOOK_EVENTS,
  type SettingsShape
} from './hook-settings.js'

describe('hook-settings — 合併不破壞使用者既有設定', () => {
  it('保留既有的其他 hook，只 append 自己那一筆', () => {
    const existing: SettingsShape = {
      hooks: {
        PreToolUse: [
          { hooks: [{ type: 'command', command: '~/some-plugin/hook.sh' }] }
        ]
      }
    }
    const merged = addOurHooks(existing)
    const preTool = merged.hooks!.PreToolUse
    expect(preTool).toHaveLength(2)
    expect(preTool[0].hooks[0].command).toBe('~/some-plugin/hook.sh')
    expect(preTool[1].hooks[0].command).toBe(HOOK_COMMAND)
  })

  it('每個列表事件都掛上腳本', () => {
    const merged = addOurHooks({})
    for (const event of HOOK_EVENTS) {
      expect(hasEvent(merged, event)).toBe(true)
    }
  })

  it('重複安裝不會產生重複項目（idempotent）', () => {
    const once = addOurHooks({})
    const twice = addOurHooks(once)
    expect(twice.hooks!.Stop).toHaveLength(1)
  })

  it('不變動非 hooks 的欄位', () => {
    const merged = addOurHooks({ model: 'claude-sonnet-5', permissions: { allow: ['Bash'] } })
    expect(merged.model).toBe('claude-sonnet-5')
    expect(merged.permissions).toEqual({ allow: ['Bash'] })
  })
})

describe('hook-settings — 移除後回到原狀', () => {
  it('install → uninstall 後結構與原始相同', () => {
    const original: SettingsShape = {
      hooks: {
        PreToolUse: [{ hooks: [{ type: 'command', command: '~/some-plugin/hook.sh' }] }]
      }
    }
    const roundTripped = removeOurHooks(addOurHooks(original))
    expect(roundTripped).toEqual(original)
  })

  it('原本沒有任何 hook → uninstall 後 hooks 欄位整個消失', () => {
    const roundTripped = removeOurHooks(addOurHooks({}))
    expect(roundTripped.hooks).toBeUndefined()
  })

  it('hasOurHooks 正確辨識', () => {
    expect(hasOurHooks({})).toBe(false)
    expect(hasOurHooks(addOurHooks({}))).toBe(true)
  })
})

function hasEvent(settings: SettingsShape, event: string): boolean {
  return (settings.hooks?.[event] ?? []).some((g) =>
    g.hooks.some((h) => h.command === HOOK_COMMAND)
  )
}
