// 巨集資料模型。編輯器只操作這些資料，AHK 腳本一律由 generator.ts 產生。

export type Step =
  /** holdMs > 0 時會按住這麼久再放開（按鍵時長） */
  | { id: string; type: 'tap'; key: string; holdMs?: number }
  | { id: string; type: 'down'; key: string }
  | { id: string; type: 'up'; key: string }
  | { id: string; type: 'wait'; ms: number }
  /** 轉視角：用相對滑鼠移動（mouse_event），shift lock 下也有效。正數 = 向右。 */
  | { id: string; type: 'turn'; degrees: number; parts: number; partDelayMs: number }
  /** 移動滑鼠到螢幕絕對座標（例如點表情輪盤），會因解析度不同而失準。 */
  | { id: string; type: 'moveTo'; x: number; y: number }
  /** 封鎖／解除封鎖你自己的鍵盤或滑鼠輸入，巨集本身送出的按鍵不受影響。巨集結束時一定會自動解除。 */
  | { id: string; type: 'block'; target: BlockTarget; on: boolean }
  /** 等螢幕上某一點變成指定顏色（例如等表情選單真的打開）。color 是 #RRGGBB，tolerance 是每個顏色通道可差多少（0–255）。 */
  | { id: string; type: 'waitColor'; x: number; y: number; color: string; tolerance: number; timeoutMs: number; stopOnTimeout: boolean }
  /** Tab：按住 Roblox 視窗正上方的標題列（左鍵）或右上的最小化鈕（右鍵）一段時間。全螢幕時會先按 F11 退出。 */
  | { id: string; type: 'tab'; target: TabTarget; holdMs: number }

export type BlockTarget = 'keyboard' | 'mouse' | 'all'

export type TabTarget = 'title' | 'minimize'

export type StepType = Step['type']

export interface Macro {
  id: string
  name: string
  /** AHK 熱鍵名稱，例如 "c"、"XButton1"、"F5" */
  hotkey: string
  enabled: boolean
  /** 觸發後原本的按鍵是否照樣送給遊戲（AHK 的 ~ 前綴） */
  passThrough: boolean
  note?: string
  steps: Step[]
}

export interface Settings {
  /** Roblox 設定裡的滑鼠靈敏度 */
  sensitivity: number
  /** 執行時自動讀 Roblox 存檔裡的靈敏度（讀不到才用 sensitivity） */
  autoSensitivity: boolean
  /** 靈敏度 1 時轉 360° 需要的滑鼠移動量（可校正） */
  countsPer360: number
  toggleHotkey: string
  exitHotkey: string
  robloxOnly: boolean
  /** AutoHotkey v2 執行檔路徑；空白代表自動尋找 */
  ahkPath: string
}

export interface Library {
  version: 1
  settings: Settings
  macros: Macro[]
}

export const defaultSettings: Settings = {
  sensitivity: 0.4,
  autoSensitivity: true,
  countsPer360: 720,
  toggleHotkey: 'F2',
  exitHotkey: 'F1',
  robloxOnly: true,
  ahkPath: '',
}

let counter = 0
export function newId(prefix = 's'): string {
  counter += 1
  return `${prefix}${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`
}
