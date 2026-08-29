import { useSyncExternalStore } from 'react'
import {
  CATALOG_IDS,
  DEFAULT_TOOLBAR,
  sanitizeCustom,
  sanitizeToolbar,
  type CustomCommand
} from '@shared/toolbar.js'

/**
 * Renderer 端的使用者偏好：一鍵指令列要放哪些指令（含自訂指令）。
 *
 * 跟 sessionDefaults 一樣存 localStorage——這是純畫面偏好，不需要進主進程。
 * 用 useSyncExternalStore 讓 RoomToolbar 在設定變更時即時重繪。
 */
const TOOLBAR_KEY = 'ccui.toolbar'
const CUSTOM_KEY = 'ccui.toolbar.custom'

class SettingsStore {
  private custom: CustomCommand[] = readCustom()
  private toolbar: string[] = sanitizeToolbar(readRawToolbar(), this.knownIds())
  private readonly listeners = new Set<() => void>()

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  getToolbar = (): string[] => this.toolbar
  getCustom = (): CustomCommand[] => this.custom

  /** 更新開啟的指令清單。 */
  setToolbar(ids: readonly string[]): void {
    this.toolbar = sanitizeToolbar(ids, this.knownIds())
    persist(TOOLBAR_KEY, this.toolbar)
    this.emit()
  }

  /** 更新自訂指令清單；被刪掉的自訂指令會一併從開啟清單移除。 */
  setCustom(list: readonly CustomCommand[]): void {
    this.custom = sanitizeCustom(list)
    this.toolbar = sanitizeToolbar(this.toolbar, this.knownIds())
    persist(CUSTOM_KEY, this.custom)
    persist(TOOLBAR_KEY, this.toolbar)
    this.emit()
  }

  private knownIds(): Set<string> {
    return new Set([...CATALOG_IDS, ...this.custom.map((c) => c.id)])
  }

  private emit(): void {
    this.listeners.forEach((fn) => fn())
  }
}

function readRawToolbar(): unknown[] {
  try {
    const raw = localStorage.getItem(TOOLBAR_KEY)
    if (raw) return JSON.parse(raw) as unknown[]
  } catch {
    /* localStorage 不可用 / JSON 壞掉 */
  }
  return [...DEFAULT_TOOLBAR]
}

function readCustom(): CustomCommand[] {
  try {
    const raw = localStorage.getItem(CUSTOM_KEY)
    if (raw) return sanitizeCustom(JSON.parse(raw))
  } catch {
    /* localStorage 不可用 / JSON 壞掉 */
  }
  return []
}

function persist(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* localStorage 不可用 */
  }
}

export const settingsStore = new SettingsStore()

/** 目前開啟的一鍵指令 id（已正規化、已截到上限）。 */
export function useToolbar(): string[] {
  return useSyncExternalStore(settingsStore.subscribe, settingsStore.getToolbar)
}

/** 目前的自訂指令清單。 */
export function useCustomCommands(): CustomCommand[] {
  return useSyncExternalStore(settingsStore.subscribe, settingsStore.getCustom)
}
