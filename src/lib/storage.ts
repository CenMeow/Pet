// 巨集庫的存取：自動存在本機（localStorage），也可以匯出／匯入 JSON 分享。
import type { ColorPoint, Library, Macro, Settings, Step } from './types'
import { defaultSettings, newId } from './types'
import { TEMPLATES, macroFromTemplate } from './templates'

const KEY = 'tsb-macro-editor.library.v1'

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}
function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}

function parsePoint(raw: unknown): ColorPoint {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    x: Math.round(num(r.x, 0)),
    y: Math.round(num(r.y, 0)),
    color: typeof r.color === 'string' && /^#[0-9a-f]{6}$/i.test(r.color) ? r.color.toUpperCase() : '#FFFFFF',
  }
}

function parseStep(raw: unknown): Step | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const id = newId()
  switch (r.type) {
    case 'tap': {
      const holdMs = num(r.holdMs, 0)
      return holdMs > 0 ? { id, type: 'tap', key: str(r.key), holdMs } : { id, type: 'tap', key: str(r.key) }
    }
    case 'down':
    case 'up':
      return { id, type: r.type, key: str(r.key) }
    case 'wait':
      return { id, type: 'wait', ms: num(r.ms, 0) }
    case 'turn':
      return {
        id, type: 'turn', degrees: num(r.degrees, 0), parts: Math.max(1, Math.round(num(r.parts, 1))), partDelayMs: num(r.partDelayMs, 0),
        ...(r.vertical === true ? { vertical: true } : {}),
      }
    case 'block': {
      const target = r.target === 'keyboard' || r.target === 'mouse' ? r.target : 'all'
      return { id, type: 'block', target, on: r.on !== false }
    }
    case 'moveTo':
      return { id, type: 'moveTo', x: Math.round(num(r.x, 0)), y: Math.round(num(r.y, 0)) }
    case 'tab':
      return { id, type: 'tab', target: r.target === 'minimize' ? 'minimize' : 'title', holdMs: Math.max(0, num(r.holdMs, 800)) }
    case 'waitKey':
      return {
        id,
        type: 'waitKey',
        key: str(r.key, 'q'),
        release: r.release === true,
        timeoutMs: Math.max(1, num(r.timeoutMs, 1000)),
        stopOnTimeout: r.stopOnTimeout !== false,
      }
    case 'waitColor': {
      // 0.2.13 以前只有一個點，直接存在步驟上（x、y、color）
      const points = Array.isArray(r.points) && r.points.length > 0 ? r.points.map(parsePoint) : [parsePoint(r)]
      return {
        id,
        type: 'waitColor',
        points,
        tolerance: Math.min(255, Math.max(0, Math.round(num(r.tolerance, 20)))),
        timeoutMs: Math.max(1, num(r.timeoutMs, 1000)),
        stopOnTimeout: r.stopOnTimeout !== false,
      }
    }
    default:
      return null
  }
}

function parseMacro(raw: unknown): Macro | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const steps = Array.isArray(r.steps) ? r.steps.map(parseStep).filter((s): s is Step => s !== null) : []
  return {
    id: newId('m'),
    name: str(r.name, '未命名巨集'),
    hotkey: str(r.hotkey),
    enabled: r.enabled !== false,
    passThrough: r.passThrough === true,
    ...(r.repeat === true ? { repeat: true } : {}),
    note: str(r.note) || undefined,
    steps,
  }
}

function parseSettings(raw: unknown): Settings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    sensitivity: num(r.sensitivity, defaultSettings.sensitivity),
    autoSensitivity: r.autoSensitivity !== false,
    countsPer360: num(r.countsPer360, defaultSettings.countsPer360),
    toggleHotkey: str(r.toggleHotkey, defaultSettings.toggleHotkey),
    exitHotkey: str(r.exitHotkey, defaultSettings.exitHotkey),
    robloxOnly: r.robloxOnly !== false,
    ahkPath: str(r.ahkPath),
  }
}

/** 解析匯入的 JSON。可以是整個巨集庫、一個巨集陣列，或單一巨集。 */
export function parseLibraryJson(text: string): { settings?: Settings; macros: Macro[] } {
  const data: unknown = JSON.parse(text)
  if (Array.isArray(data)) return { macros: data.map(parseMacro).filter((m): m is Macro => m !== null) }
  if (data && typeof data === 'object' && Array.isArray((data as Library).macros)) {
    const lib = data as Library
    return {
      settings: parseSettings(lib.settings),
      macros: lib.macros.map(parseMacro).filter((m): m is Macro => m !== null),
    }
  }
  const one = parseMacro(data)
  if (one && Array.isArray((data as Macro).steps)) return { macros: [one] }
  throw new Error('這不是巨集檔案')
}

export function serializeLibrary(settings: Settings, macros: Macro[]): string {
  const lib: Library = { version: 1, settings, macros }
  return JSON.stringify(lib, null, 2)
}

export function starterLibrary(): Library {
  const pick = ['backdash-cancel', 'emote-backdash-rachan', 'twist-v2']
  const macros = TEMPLATES.filter((t) => pick.includes(t.key)).map((t) => macroFromTemplate(t))
  return { version: 1, settings: { ...defaultSettings }, macros }
}

export function loadLibrary(): Library {
  try {
    const text = localStorage.getItem(KEY)
    if (text) {
      const parsed = parseLibraryJson(text)
      return { version: 1, settings: parsed.settings ?? { ...defaultSettings }, macros: parsed.macros }
    }
  } catch {
    // 資料壞掉就從範本重新開始
  }
  return starterLibrary()
}

export function saveLibrary(settings: Settings, macros: Macro[]): void {
  try {
    localStorage.setItem(KEY, serializeLibrary(settings, macros))
  } catch {
    // 存不了就算了，下次啟動會回到範本
  }
}
