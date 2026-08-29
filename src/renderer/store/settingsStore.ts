import { useSyncExternalStore } from 'react'
import {
  CATALOG_IDS,
  DEFAULT_TOOLBAR,
  sanitizeCustom,
  sanitizeToolbar,
  type CustomCommand
} from '@shared/toolbar.js'
import { sanitizeUsageInterval } from '@shared/usage.js'

/**
 * Renderer 端的使用者偏好：一鍵指令列的指令（含自訂）、`/usage` 更新頻率。
 *
 * 跟 sessionDefaults 一樣存 localStorage——純畫面偏好。頻率會由 App 推給
 * 主進程的 UsagePoller。用 useSyncExternalStore 讓相關元件即時重繪。
 */
const TOOLBAR_KEY = 'ccui.toolbar'
const CUSTOM_KEY = 'ccui.toolbar.custom'
const USAGE_INTERVAL_KEY = 'ccui.usage.interval'

class SettingsStore {
  private custom: CustomCommand[] = readCustom()
  private toolbar: string[] = sanitizeToolbar(readRawToolbar(), this.knownIds())
  private usageInterval: number = readUsageInterval()
  private readonly listeners = new Set<() => void>()

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  getToolbar = (): string[] => this.toolbar
  getCustom = (): CustomCommand[] => this.custom
  getUsageInterval = (): number => this.usageInterval

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

  /** 更新 `/usage` 輪詢間隔（ms）。 */
  setUsageInterval(ms: number): void {
    this.usageInterval = sanitizeUsageInterval(ms)
    persist(USAGE_INTERVAL_KEY, this.usageInterval)
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

function readUsageInterval(): number {
  try {
    const raw = localStorage.getItem(USAGE_INTERVAL_KEY)
    if (raw !== null) return sanitizeUsageInterval(JSON.parse(raw))
  } catch {
    /* localStorage 不可用 / JSON 壞掉 */
  }
  return sanitizeUsageInterval(undefined)
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

/** `/usage` 輪詢間隔（ms）；0 = 不自動更新。 */
export function useUsageInterval(): number {
  return useSyncExternalStore(settingsStore.subscribe, settingsStore.getUsageInterval)
}
