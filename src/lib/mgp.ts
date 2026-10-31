// 匯入 .mgp 巨集檔（[名稱] / bindedkey= / repeat= / e= 事件 的格式）
import type { Macro, Step } from './types'
import { newId } from './types'
import { normalizeHotkey, normalizeKey } from './keys'

export interface MgpImport {
  macros: Macro[]
  warnings: string[]
}

const KEY_ALIASES: Record<string, string> = {
  lmouse: 'LButton', rmouse: 'RButton', mmouse: 'MButton',
  xmouse1: 'XButton1', xmouse2: 'XButton2',
  lshift: 'LShift', rshift: 'RShift', lctrl: 'LCtrl', rctrl: 'RCtrl', lalt: 'LAlt', ralt: 'RAlt',
  control: 'Ctrl', ctrl: 'Ctrl', esc: 'Escape', return: 'Enter',
}

function mapKey(raw: string): string | null {
  const alias = KEY_ALIASES[raw.toLowerCase()]
  return normalizeKey(alias ?? raw)
}

/** 連續的「按下 X」+「放開 X」合併成「按一下 X」，比較好讀 */
function mergeTaps(steps: Step[]): Step[] {
  const out: Step[] = []
  for (const s of steps) {
    const prev = out[out.length - 1]
    if (s.type === 'up' && prev?.type === 'down' && prev.key === s.key) {
      out[out.length - 1] = { id: prev.id, type: 'tap', key: s.key }
    } else {
      out.push(s)
    }
  }
  return out
}

export function parseMgp(text: string, fileName = ''): MgpImport {
  const macros: Macro[] = []
  const warnings: string[] = []
  let cur: { name: string; hotkey: string; repeat: number; steps: Step[] } | null = null

  const flush = () => {
    if (!cur) return
    let steps = mergeTaps(cur.steps)
    const times = Math.max(1, Math.min(cur.repeat, 50))
    if (times > 1) {
      const once = steps
      steps = []
      for (let i = 0; i < times; i++) steps.push(...once.map((s) => ({ ...s, id: newId() })))
    }
    macros.push({
      id: newId('m'),
      name: cur.name,
      hotkey: cur.hotkey,
      enabled: true,
      passThrough: false,
      note: fileName ? `從 ${fileName} 匯入` : '從 .mgp 匯入',
      steps,
    })
  }

  text.split(/\r?\n/).forEach((rawLine, i) => {
    const line = rawLine.trim()
    if (!line || line.startsWith(';') || line.startsWith('#')) return
    const section = /^\[(.+)\]$/.exec(line)
    if (section) {
      flush()
      cur = { name: section[1].trim(), hotkey: '', repeat: 1, steps: [] }
      return
    }
    if (!cur) {
      cur = { name: fileName.replace(/\.mgp$/i, '') || '匯入的巨集', hotkey: '', repeat: 1, steps: [] }
    }
    const eq = line.indexOf('=')
    if (eq < 0) {
      warnings.push(`第 ${i + 1} 行看不懂：${line}`)
      return
    }
    const field = line.slice(0, eq).trim().toLowerCase()
    const value = line.slice(eq + 1).trim()
    if (field === 'bindedkey' || field === 'bindkey' || field === 'hotkey') {
      const hk = normalizeHotkey(mapKey(value) ?? value)
      if (hk) cur.hotkey = hk
      else warnings.push(`第 ${i + 1} 行的觸發鍵「${value}」無法辨識，請手動設定`)
      return
    }
    if (field === 'repeat') {
      const n = parseInt(value, 10)
      if (Number.isFinite(n) && n > 0) cur.repeat = n
      return
    }
    if (field !== 'e') return

    const delay = /^(\d+(?:\.\d+)?)\s*D$/i.exec(value)
    if (delay) {
      cur.steps.push({ id: newId(), type: 'wait', ms: Number(delay[1]) })
      return
    }
    const key = /^\{\s*([^\s}]+)\s+(down|up)\s*\}$/i.exec(value)
    if (key) {
      const k = mapKey(key[1])
      if (!k) {
        warnings.push(`第 ${i + 1} 行的按鍵「${key[1]}」無法辨識，已略過`)
        return
      }
      cur.steps.push({ id: newId(), type: key[2].toLowerCase() === 'down' ? 'down' : 'up', key: k })
      return
    }
    const single = /^\{\s*([^\s}]+)\s*\}$/.exec(value)
    if (single) {
      const k = mapKey(single[1])
      if (k) {
        cur.steps.push({ id: newId(), type: 'tap', key: k })
        return
      }
    }
    warnings.push(`第 ${i + 1} 行的事件「${value}」不支援，已略過`)
  })
  flush()
  return { macros, warnings }
}
