import { describe, it, expect } from 'vitest'
import { mergePath } from './cli-resolver.js'

describe('mergePath', () => {
  it('login shell PATH 疊在現有 PATH 前面', () => {
    const merged = mergePath('/opt/homebrew/bin:/Users/x/.nvm/bin', '/usr/bin:/bin')
    expect(merged).toBe('/opt/homebrew/bin:/Users/x/.nvm/bin:/usr/bin:/bin')
  })

  it('去重且保留先出現的順序', () => {
    const merged = mergePath('/a:/b:/usr/bin', '/usr/bin:/b:/c')
    expect(merged).toBe('/a:/b:/usr/bin:/c')
  })

  it('login PATH 為空時退回現有 PATH', () => {
    expect(mergePath(undefined, '/usr/bin:/bin')).toBe('/usr/bin:/bin')
  })

  it('略過空段', () => {
    expect(mergePath('/a::/b', '')).toBe('/a:/b')
  })
})
