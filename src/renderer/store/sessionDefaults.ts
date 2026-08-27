import { DEFAULT_CONTROLS, type SessionControls } from '@shared/types.js'

/** 新 session 的開關預設值（AddProjectBar 會寫，ProjectFloor 快速新增會讀）。 */
export const SESSION_DEFAULTS_KEY = 'ccui.session.defaults'

export function readSessionDefaults(): SessionControls {
  try {
    const raw = localStorage.getItem(SESSION_DEFAULTS_KEY)
    if (raw) return { ...DEFAULT_CONTROLS, ...(JSON.parse(raw) as Partial<SessionControls>) }
  } catch {
    /* localStorage 不可用 / JSON 壞掉 */
  }
  return { ...DEFAULT_CONTROLS }
}

export function writeSessionDefaults(controls: SessionControls): void {
  try {
    localStorage.setItem(SESSION_DEFAULTS_KEY, JSON.stringify(controls))
  } catch {
    /* localStorage 不可用 */
  }
}
