// AHK 按鍵名稱的白名單與瀏覽器按鍵轉換。
// 產生腳本前所有按鍵都要通過 isValidKey，避免奇怪字元破壞腳本。

const NAMED = [
  'Space', 'Enter', 'Tab', 'Escape', 'Backspace', 'Delete', 'Insert', 'Home', 'End', 'PgUp', 'PgDn',
  'Up', 'Down', 'Left', 'Right',
  'Shift', 'LShift', 'RShift', 'Ctrl', 'LCtrl', 'RCtrl', 'Alt', 'LAlt', 'RAlt', 'LWin', 'RWin',
  'CapsLock', 'AppsKey', 'PrintScreen', 'ScrollLock', 'Pause',
  'LButton', 'RButton', 'MButton', 'XButton1', 'XButton2', 'WheelUp', 'WheelDown',
  'Numpad0', 'Numpad1', 'Numpad2', 'Numpad3', 'Numpad4', 'Numpad5', 'Numpad6', 'Numpad7', 'Numpad8', 'Numpad9',
  'NumpadAdd', 'NumpadSub', 'NumpadMult', 'NumpadDiv', 'NumpadDot', 'NumpadEnter',
]
for (let i = 1; i <= 24; i++) NAMED.push(`F${i}`)

const NAMED_LOWER = new Map(NAMED.map((k) => [k.toLowerCase(), k]))
const PUNCT = new Set(['`', '-', '=', '[', ']', '\\', ';', "'", ',', '.', '/'])

/** 回傳標準化後的按鍵名稱；不合法回傳 null。 */
export function normalizeKey(raw: string): string | null {
  const k = raw.trim()
  if (k.length === 1) {
    if (/[a-z0-9]/i.test(k)) return k.toLowerCase()
    if (PUNCT.has(k)) return k
    return null
  }
  return NAMED_LOWER.get(k.toLowerCase()) ?? null
}

export function isValidKey(raw: string): boolean {
  return normalizeKey(raw) !== null
}

/** 熱鍵可以帶修飾鍵前綴：^ Ctrl、! Alt、+ Shift、# Win */
export function normalizeHotkey(raw: string): string | null {
  const m = /^([\^!+#]*)(.+)$/.exec(raw.trim())
  if (!m) return null
  const key = normalizeKey(m[2])
  if (!key) return null
  const mods = [...new Set(m[1].split(''))].join('')
  return mods + key
}

/** 在 Send 字串裡使用的寫法，例如 {q}、{Space} */
export function sendName(key: string): string {
  const k = normalizeKey(key)
  if (!k) throw new Error(`不合法的按鍵：${key}`)
  return k
}

const CODE_MAP: Record<string, string> = {
  Space: 'Space', Enter: 'Enter', Tab: 'Tab', Escape: 'Escape', Backspace: 'Backspace', Delete: 'Delete',
  Insert: 'Insert', Home: 'Home', End: 'End', PageUp: 'PgUp', PageDown: 'PgDn',
  ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
  ShiftLeft: 'LShift', ShiftRight: 'RShift', ControlLeft: 'LCtrl', ControlRight: 'RCtrl',
  AltLeft: 'LAlt', AltRight: 'RAlt', MetaLeft: 'LWin', MetaRight: 'RWin', CapsLock: 'CapsLock',
  Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\',
  Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/',
  NumpadAdd: 'NumpadAdd', NumpadSubtract: 'NumpadSub', NumpadMultiply: 'NumpadMult',
  NumpadDivide: 'NumpadDiv', NumpadDecimal: 'NumpadDot', NumpadEnter: 'NumpadEnter',
}

/** 把瀏覽器的 KeyboardEvent.code 轉成 AHK 名稱 */
export function keyFromCode(code: string): string | null {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase()
  if (/^Digit[0-9]$/.test(code)) return code.slice(5)
  if (/^Numpad[0-9]$/.test(code)) return code
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code
  return CODE_MAP[code] ?? null
}

/** 滑鼠按鈕（MouseEvent.button）轉 AHK 名稱 */
export function keyFromMouseButton(button: number): string | null {
  return ['LButton', 'MButton', 'RButton', 'XButton1', 'XButton2'][button] ?? null
}

export const COMMON_KEYS = [
  'q', 'w', 'a', 's', 'd', 'e', 'r', 'f', 'g', 'b', '1', '2', '3', '4',
  'Space', 'Shift', 'LButton', 'RButton', 'MButton', 'XButton1', 'XButton2',
]

/** 給使用者看的中文名稱 */
export function keyLabel(key: string): string {
  const labels: Record<string, string> = {
    LButton: '滑鼠左鍵', RButton: '滑鼠右鍵', MButton: '滑鼠中鍵',
    XButton1: '滑鼠側鍵 1', XButton2: '滑鼠側鍵 2', Space: '空白鍵', Shift: 'Shift',
    WheelUp: '滾輪上', WheelDown: '滾輪下',
  }
  return labels[key] ?? (key.length === 1 ? key.toUpperCase() : key)
}
