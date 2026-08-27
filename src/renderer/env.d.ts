/// <reference types="vite/client" />
import type { CcuiApi } from '../preload/index.js'

declare global {
  interface Window {
    ccui: CcuiApi
  }
}
