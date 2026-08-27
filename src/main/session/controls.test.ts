import { describe, it, expect } from 'vitest'
import {
  spawnArgsForControls,
  liveCommandsForControls,
  normalizeControls,
  SHIFT_TAB
} from './controls.js'
import { DEFAULT_CONTROLS, type SessionControls } from '@shared/types.js'

const base: SessionControls = { ...DEFAULT_CONTROLS }

describe('spawnArgsForControls（spec_04 §3 啟動參數）', () => {
  it('預設不帶任何參數', () => {
    expect(spawnArgsForControls(base)).toEqual([])
  })

  it('model / effort / autoApprove 各自映射到旗標', () => {
    expect(
      spawnArgsForControls({ model: 'opus', effort: 'high', autoApprove: true, fast: true })
    ).toEqual(['--model', 'opus', '--effort', 'high', '--permission-mode', 'bypassPermissions'])
  })

  it('fast 不產生啟動參數（只能執行中 /fast 切換）', () => {
    expect(spawnArgsForControls({ ...base, fast: true })).toEqual([])
  })
})

describe('liveCommandsForControls（執行中送進 PTY）', () => {
  it('沒有變動 → 不送任何東西', () => {
    expect(liveCommandsForControls(base, base)).toEqual([])
  })

  it('切模型送 /model，切深度送 /effort', () => {
    const next: SessionControls = { ...base, model: 'sonnet', effort: 'low' }
    expect(liveCommandsForControls(base, next)).toEqual(['/model sonnet\r', '/effort low\r'])
  })

  it('切回 default 模型不送 /model（避免開啟互動選單）', () => {
    const prev: SessionControls = { ...base, model: 'opus' }
    expect(liveCommandsForControls(prev, base)).toEqual([])
  })

  it('autoApprove 變動送一次 Shift-Tab', () => {
    expect(liveCommandsForControls(base, { ...base, autoApprove: true })).toEqual([SHIFT_TAB])
  })

  it('fast 變動送 /fast', () => {
    expect(liveCommandsForControls(base, { ...base, fast: true })).toEqual(['/fast\r'])
  })
})

describe('normalizeControls（防禦 renderer 傳來的髒資料）', () => {
  it('undefined patch → 原樣回傳 base', () => {
    expect(normalizeControls(undefined, base)).toEqual(base)
  })

  it('未知 model / effort 落回 base 值', () => {
    const out = normalizeControls({ model: 'gpt' as never, effort: 'ultra' as never }, base)
    expect(out.model).toBe('default')
    expect(out.effort).toBeNull()
  })

  it('effort 明確給 null 會清空', () => {
    const prev: SessionControls = { ...base, effort: 'high' }
    expect(normalizeControls({ effort: null }, prev).effort).toBeNull()
  })

  it('只帶部分欄位時其餘沿用 base', () => {
    const prev: SessionControls = { model: 'opus', effort: 'max', autoApprove: true, fast: true }
    expect(normalizeControls({ model: 'sonnet' }, prev)).toEqual({
      model: 'sonnet',
      effort: 'max',
      autoApprove: true,
      fast: true
    })
  })
})
