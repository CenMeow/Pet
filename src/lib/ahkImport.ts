// 匯入 .ahk 腳本：盡量把熱鍵裡的按鍵、等待、轉視角等轉成步驟，看不懂的行略過並提示。
import type { BlockTarget, Macro, Settings, Step } from './types'
import { newId } from './types'
import { normalizeHotkey, normalizeKey } from './keys'

export interface AhkImport {
  macros: Macro[]
  warnings: string[]
}

const SKIP_CALLS = /^(ExitApp|ToggleMacros|Reload|Suspend|Pause)\b/i
const IGNORABLE = /^(\{|\}|return\b|global\b|static\b|local\b|if\s*\(?\s*!?\s*\w+\.Value|#|try\b|finally\b|else\b)/i

function stripComment(line: string): string {
  // 去掉 ; 註解（引號內的不算）
  let inStr: string | null = null
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (inStr) {
      if (c === inStr) inStr = null
    } else if (c === '"' || c === "'") {
      inStr = c
    } else if (c === ';' && (i === 0 || /\s/.test(line[i - 1]))) {
      return line.slice(0, i)
    }
  }
  return line
}

/** 從含 { 的那一行開始找到對應的 }，回傳區塊的所有行（含頭尾） */
function takeBlock(lines: string[], start: number): { body: string[]; end: number } {
  let depth = 0
  let opened = false
  const body: string[] = []
  for (let i = start; i < lines.length; i++) {
    body.push(lines[i])
    for (const c of stripComment(lines[i]).replace(/(["'])(?:(?!\1).)*\1/g, '')) {
      if (c === '{') {
        depth++
        opened = true
      } else if (c === '}') depth--
    }
    if (opened && depth <= 0) return { body, end: i }
  }
  return { body, end: lines.length - 1 }
}

function keyName(raw: string): string | null {
  const aliases: Record<string, string> = { lmouse: 'LButton', rmouse: 'RButton', click: 'LButton' }
  return normalizeKey(aliases[raw.toLowerCase()] ?? raw)
}

function sendSteps(text: string, warn: (m: string) => void): Step[] {
  const steps: Step[] = []
  const re = /\{([^}\s]+)(?:\s+(down|up|\d+))?\}|([^{}])/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    if (m[3] !== undefined) {
      const ch = m[3]
      if (/[\^!+#]/.test(ch)) continue // 修飾鍵符號略過
      const k = keyName(ch)
      if (k) steps.push({ id: newId(), type: 'tap', key: k })
      continue
    }
    const k = keyName(m[1])
    if (!k) {
      warn(`看不懂的按鍵 {${m[1]}}`)
      continue
    }
    const mod = m[2]?.toLowerCase()
    if (mod === 'down' || mod === 'up') steps.push({ id: newId(), type: mod, key: k })
    else {
      const times = mod ? Math.min(parseInt(mod, 10), 50) : 1
      for (let i = 0; i < times; i++) steps.push({ id: newId(), type: 'tap', key: k })
    }
  }
  return steps
}

function num(s: string): number | null {
  const n = Number(s.trim())
  return Number.isFinite(n) ? n : null
}

function parseBody(lines: string[], settings: Settings, warn: (m: string) => void, funcs: Map<string, string[]>, depth = 0): Step[] {
  const steps: Step[] = []
  const countsToDeg = (c: number) => Math.round(((c * 360 * settings.sensitivity) / settings.countsPer360) * 10) / 10
  for (let i = 0; i < lines.length; i++) {
    let l = stripComment(lines[i]).trim()
    if (!l) continue
    // Loop N { ... } 或 Loop N 下一行
    const loop = /^loop\s*,?\s*\(?\s*(\d+)\s*\)?\s*(\{)?\s*$/i.exec(l)
    if (loop) {
      const times = Math.min(parseInt(loop[1], 10), 50)
      let inner: string[]
      if (loop[2] || stripComment(lines[i + 1] ?? '').trim() === '{') {
        const blk = takeBlock(lines, loop[2] ? i : i + 1)
        inner = blk.body.slice(1, -1)
        i = blk.end
      } else {
        inner = [lines[i + 1] ?? '']
        i += 1
      }
      const once = parseBody(inner, settings, warn, funcs, depth)
      for (let t = 0; t < times; t++) steps.push(...once.map((s) => ({ ...s, id: newId() })))
      continue
    }
    l = l.replace(/^\{\s*/, '').replace(/\s*\}$/, '').trim()
    if (!l) continue
    let m: RegExpExecArray | null
    if ((m = /^Send(?:Input|Event|Play)?\s*\(?\s*(["'])(.*)\1\s*\)?$/i.exec(l))) {
      steps.push(...sendSteps(m[2], warn))
    } else if ((m = /^Send(?:Input|Event|Play)?\s*,?\s+([^"'(].*)$/i.exec(l))) {
      steps.push(...sendSteps(m[1], warn)) // v1：Send {b}
    } else if ((m = /^(?:Precise)?Sleep\s*[,(]?\s*([\d.]+)\s*\)?$/i.exec(l))) {
      steps.push({ id: newId(), type: 'wait', ms: Number(m[1]) })
    } else if ((m = /^TurnDeg\(\s*(-?[\d.]+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)$/i.exec(l))) {
      steps.push({ id: newId(), type: 'turn', degrees: Number(m[1]), parts: Number(m[2]), partDelayMs: Number(m[3]) })
    } else if ((m = /^Turn\(\s*(-?[\d.]+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)$/i.exec(l))) {
      steps.push({ id: newId(), type: 'turn', degrees: countsToDeg(Number(m[1])), parts: Number(m[2]), partDelayMs: Number(m[3]) })
    } else if ((m = /^DllCall\(\s*"mouse_event"\s*,\s*"UInt"\s*,\s*1\s*,\s*"Int"\s*,\s*([^,]+?)\s*,/i.exec(l))) {
      const c = num(m[1])
      if (c === null) warn(`轉視角用了變數（${m[1]}），請手動設定角度`)
      else steps.push({ id: newId(), type: 'turn', degrees: countsToDeg(c), parts: 1, partDelayMs: 0 })
    } else if ((m = /^MouseMove\s*[,(]?\s*(-?\d+)\s*,\s*(-?\d+)/i.exec(l))) {
      steps.push({ id: newId(), type: 'moveTo', x: Number(m[1]), y: Number(m[2]) })
    } else if ((m = /^Click\s*[,(]?\s*(["']?)([^"')]*)\1\s*\)?$/i.exec(l))) {
      const args = m[2].toLowerCase()
      const key = args.includes('right') ? 'RButton' : args.includes('middle') ? 'MButton' : 'LButton'
      const type = /\bdown\b/.test(args) ? 'down' : /\bup\b/.test(args) ? 'up' : 'tap'
      steps.push({ id: newId(), type, key })
    } else if ((m = /^Block(All|Keyboard|Mouse)\(\s*(true|false|1|0)\s*\)$/i.exec(l))) {
      const target: BlockTarget = m[1].toLowerCase() === 'all' ? 'all' : m[1].toLowerCase() === 'keyboard' ? 'keyboard' : 'mouse'
      steps.push({ id: newId(), type: 'block', target, on: m[2] === 'true' || m[2] === '1' })
    } else if (/^UnblockAll\(\)$/i.test(l)) {
      // 結尾自動解除，略過
    } else if ((m = /^(\w+)\(\s*\)$/.exec(l)) && funcs.has(m[1].toLowerCase()) && depth < 3) {
      steps.push(...parseBody(funcs.get(m[1].toLowerCase())!, settings, warn, funcs, depth + 1))
    } else if (IGNORABLE.test(l)) {
      // 略過
    } else {
      warn(`略過：${l.length > 60 ? l.slice(0, 60) + '…' : l}`)
    }
  }
  return steps
}

export function parseAhk(text: string, settings: Settings, fileName = ''): AhkImport {
  const lines = text.split(/\r?\n/)
  const warnings: string[] = []
  const funcs = new Map<string, string[]>()

  // 先收集所有函式
  for (let i = 0; i < lines.length; i++) {
    const m = /^\s*(\w+)\s*\([^)]*\)\s*(\{)?\s*$/.exec(stripComment(lines[i]))
    if (!m || /^(if|while|loop|for|switch|return)$/i.test(m[1])) continue
    const braceLine = m[2] ? i : stripComment(lines[i + 1] ?? '').trim() === '{' ? i + 1 : -1
    if (braceLine < 0) continue
    const blk = takeBlock(lines, braceLine)
    funcs.set(m[1].toLowerCase(), blk.body.slice(1, -1))
    i = blk.end
  }

  const macros: Macro[] = []
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    const hk = /^\s*([~$*]*)([^\s:;][^\s:]*)::(.*)$/.exec(raw)
    if (!hk) continue
    const hotkey = normalizeHotkey(hk[2])
    const restRaw = hk[3]
    const comment = /;\s*(.+)$/.exec(restRaw)?.[1]?.trim()
    const rest = stripComment(restRaw).trim()
    if (SKIP_CALLS.test(rest)) continue
    let body: string[]
    let name = comment ?? ''
    if (rest === '' || rest === '{') {
      const start = rest === '{' ? i : i + 1
      if (rest === '' && stripComment(lines[start] ?? '').trim() !== '{') {
        // AHK v1 風格：到 return 為止
        body = []
        let j = start
        for (; j < lines.length && !/^\s*return\b/i.test(lines[j]) && !/::/.test(lines[j]); j++) body.push(lines[j])
        i = j
      } else {
        const blk = takeBlock(lines, start)
        body = blk.body.slice(1, -1)
        i = blk.end
      }
    } else {
      const call = /^(\w+)\(.*\)$/.exec(rest)
      if (call && funcs.has(call[1].toLowerCase())) {
        body = funcs.get(call[1].toLowerCase())!
        if (!name) name = call[1]
      } else {
        body = [rest]
      }
    }
    const local: string[] = []
    const steps = parseBody(body, settings, (m) => local.push(m), funcs)
    if (steps.length === 0) continue
    const label = name || `熱鍵 ${hk[2]}`
    if (!hotkey) warnings.push(`「${label}」的熱鍵 ${hk[2]} 無法辨識，請手動設定`)
    warnings.push(...[...new Set(local)].map((w) => `「${label}」${w}`))
    macros.push({
      id: newId('m'),
      name: label,
      hotkey: hotkey ?? '',
      enabled: true,
      passThrough: hk[1].includes('~'),
      note: fileName ? `從 ${fileName} 匯入` : undefined,
      steps,
    })
  }
  if (macros.length === 0)
    warnings.push(/\bHotkey\s*\(/i.test(text) ? '這個腳本的熱鍵是用介面設定的，沒辦法直接匯入' : '找不到可以匯入的熱鍵')
  return { macros, warnings }
}
