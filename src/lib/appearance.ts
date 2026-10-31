// 外觀設定（主題、主題色、介面大小）。只存在這台電腦，不會跟巨集一起匯出。
export type ThemeMode = 'dark' | 'light' | 'system'
export type UiSize = 'sm' | 'md' | 'lg'

export interface Appearance {
  theme: ThemeMode
  accent: string
  size: UiSize
}

export const ACCENTS: { name: string; value: string }[] = [
  { name: '藍', value: '#4f8cff' },
  { name: '紫', value: '#8b5cf6' },
  { name: '粉', value: '#ec4899' },
  { name: '紅', value: '#ef4444' },
  { name: '橘', value: '#f59e0b' },
  { name: '綠', value: '#22c55e' },
  { name: '青', value: '#06b6d4' },
]

export const defaultAppearance: Appearance = { theme: 'dark', accent: ACCENTS[0].value, size: 'md' }

const KEY = 'tsb-macro-editor.appearance'
const HEX = /^#[0-9a-f]{6}$/i

export function loadAppearance(): Appearance {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Appearance> | null
    if (!raw || typeof raw !== 'object') return defaultAppearance
    return {
      theme: raw.theme === 'light' || raw.theme === 'system' ? raw.theme : 'dark',
      accent: typeof raw.accent === 'string' && HEX.test(raw.accent) ? raw.accent : defaultAppearance.accent,
      size: raw.size === 'sm' || raw.size === 'lg' ? raw.size : 'md',
    }
  } catch {
    return defaultAppearance
  }
}

export function saveAppearance(a: Appearance) {
  try {
    localStorage.setItem(KEY, JSON.stringify(a))
  } catch {
    // 存不了就算了，下次用預設值
  }
}

/** 主題色上面的文字要用白色還是深色 */
export function textOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16)
  const lin = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  const l = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255)
  // 偏亮的顏色（黃、綠）用深色字，其他用白字
  return l > 0.4 ? '#111318' : '#ffffff'
}

export function resolveTheme(mode: ThemeMode): 'dark' | 'light' {
  if (mode !== 'system') return mode
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

/** 套用到整個頁面 */
export function applyAppearance(a: Appearance) {
  const root = document.documentElement
  root.dataset.theme = resolveTheme(a.theme)
  root.dataset.size = a.size
  root.style.setProperty('--accent', a.accent)
  root.style.setProperty('--on-accent', textOn(a.accent))
}
