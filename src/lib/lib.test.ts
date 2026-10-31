import { describe, expect, it } from 'vitest'
import { generate, turnCounts, validate, estimateDuration } from './generator'
import { parseMgp } from './mgp'
import { normalizeHotkey, normalizeKey, keyFromCode } from './keys'
import { TEMPLATES, macroFromTemplate } from './templates'
import { parseLibraryJson, serializeLibrary } from './storage'
import { defaultSettings, type Macro } from './types'

const RACHAN = `[jumpemote]
bindedkey=C
repeat=1
e={b down}
e={b up}
e={LMouse down}
e=10 D
e={LMouse up}
e={s down}
e=10 D
e={q down}
e={q up}
e={s up}
e={LMouse down}
e={LMouse up}
e=30 D
e={SPACE down}
e=30 D
e={SPACE up}
`

function macro(partial: Partial<Macro>): Macro {
  return { id: 'm1', name: 'test', hotkey: 'c', enabled: true, passThrough: false, steps: [], ...partial }
}

describe('keys', () => {
  it('normalizes key names', () => {
    expect(normalizeKey('Q')).toBe('q')
    expect(normalizeKey('space')).toBe('Space')
    expect(normalizeKey('lbutton')).toBe('LButton')
    expect(normalizeKey('"')).toBeNull()
    expect(normalizeKey('q}')).toBeNull()
    expect(normalizeHotkey('^+e')).toBe('^+e')
    expect(normalizeHotkey('xbutton1')).toBe('XButton1')
    expect(keyFromCode('KeyQ')).toBe('q')
    expect(keyFromCode('Digit1')).toBe('1')
  })
})

describe('mgp import', () => {
  it('parses the Rachan emote backdash file', () => {
    const { macros, warnings } = parseMgp(RACHAN, 'Rachan emote backdash 2.mgp')
    expect(warnings).toEqual([])
    expect(macros).toHaveLength(1)
    const m = macros[0]
    expect(m.name).toBe('jumpemote')
    expect(m.hotkey).toBe('c')
    expect(m.steps.map((s) => (s.type === 'wait' ? `w${s.ms}` : 'key' in s ? `${s.type}:${s.key}` : s.type))).toEqual([
      'tap:b', 'down:LButton', 'w10', 'up:LButton', 'down:s', 'w10', 'tap:q', 'up:s',
      'tap:LButton', 'w30', 'down:Space', 'w30', 'up:Space',
    ])
  })

  it('warns about unknown events and expands repeat', () => {
    const { macros, warnings } = parseMgp('[x]\nbindedkey=F6\nrepeat=2\ne={q down}\ne={q up}\ne=MOVE 1 2\n')
    expect(macros[0].steps).toHaveLength(2)
    expect(warnings).toHaveLength(1)
  })
})

describe('generator', () => {
  it('generates every template without errors', () => {
    const macros = TEMPLATES.map(macroFromTemplate).map((m, i) => ({ ...m, hotkey: `F${i + 3}` }))
    const { script, problems } = generate(macros, defaultSettings)
    expect(problems.filter((p) => p.level === 'error')).toEqual([])
    expect(script).toContain('#Requires AutoHotkey v2.0')
    expect(script).toContain('#HotIf MacrosEnabled && WinActive("ahk_exe RobloxPlayerBeta.exe")')
    expect(script).toContain('Send("{q}")')
    expect(script).toContain('Send("{s down}")')
    expect(script).toContain('MouseMove(1124, 542, 0)')
  })

  it('writes the Rachan macro as expected', () => {
    const { macros } = parseMgp(RACHAN)
    const { script } = generate(macros, defaultSettings)
    expect(script).toContain('$c::Macro1()  ; jumpemote')
    expect(script).toContain('    Send("{b}")\r\n    Send("{LButton down}")\r\n    PreciseSleep(10)')
  })

  it('converts degrees using sensitivity', () => {
    // 參考腳本：720 / 靈敏度 = 360°
    expect(turnCounts(360, { ...defaultSettings, sensitivity: 0.4 })).toBe(1800)
    expect(turnCounts(-60, { ...defaultSettings, sensitivity: 0.4 })).toBe(-300)
    const { script } = generate([macro({ steps: [{ id: 't', type: 'turn', degrees: 86, parts: 1, partDelayMs: 0 }] })], defaultSettings)
    expect(script).toContain('Turn(430, 1, 0)')
  })

  it('flags duplicate hotkeys and bad keys', () => {
    const problems = validate([
      macro({ id: 'a', hotkey: 'c' }),
      macro({ id: 'b', hotkey: 'C', steps: [{ id: 's', type: 'tap', key: 'q"' }] }),
      macro({ id: 'c', hotkey: 'F2' }),
    ], defaultSettings)
    const errors = problems.filter((p) => p.level === 'error').map((p) => p.message)
    expect(errors.some((m) => m.includes('熱鍵 c'))).toBe(true)
    expect(errors.some((m) => m.includes('q"'))).toBe(true)
    expect(errors.some((m) => m.includes('F2'))).toBe(true)
    expect(generate([macro({ steps: [{ id: 's', type: 'tap', key: 'q"' }] })], defaultSettings).script).toBe('')
  })

  it('warns about held keys and escapes special hotkeys', () => {
    const problems = validate([macro({ steps: [{ id: 's', type: 'down', key: 's' }] })], defaultSettings)
    expect(problems.some((p) => p.level === 'warning' && p.message.includes('沒有放開'))).toBe(true)
    const { script } = generate([macro({ hotkey: ';', passThrough: true, steps: [{ id: 's', type: 'tap', key: '`' }] })], defaultSettings)
    expect(script).toContain('~`;::Macro1()')
    expect(script).toContain('Send("{``}")')
  })

  it('skips disabled macros and estimates duration', () => {
    const { script } = generate([macro({ enabled: false })], defaultSettings)
    expect(script).not.toContain('Macro1')
    expect(estimateDuration([
      { id: '1', type: 'wait', ms: 30 },
      { id: '2', type: 'turn', degrees: 10, parts: 5, partDelayMs: 8 },
    ])).toBe(62)
  })
})

describe('storage', () => {
  it('round-trips a library', () => {
    const macros = TEMPLATES.slice(0, 3).map(macroFromTemplate)
    const parsed = parseLibraryJson(serializeLibrary(defaultSettings, macros))
    expect(parsed.macros.map((m) => m.name)).toEqual(macros.map((m) => m.name))
    expect(parsed.macros[0].steps.length).toBe(macros[0].steps.length)
    expect(parsed.settings).toEqual(defaultSettings)
  })
  it('rejects non-macro files', () => {
    expect(() => parseLibraryJson('{"hello": 1}')).toThrow()
  })
})

describe('mouse hotkeys', () => {
  it('warns when a mouse button is the trigger', () => {
    const problems = validate([macro({ hotkey: 'LButton' })], defaultSettings)
    expect(problems.some((p) => p.level === 'warning' && p.message.includes('滑鼠'))).toBe(true)
    expect(validate([macro({ hotkey: 'LButton', passThrough: true })], defaultSettings).some((p) => p.message.includes('滑鼠'))).toBe(false)
  })
})
