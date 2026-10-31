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
    expect(script).toContain('MouseMove(957, 700, 0)')
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
    expect(generate([macro({ steps: [{ id: "t", type: "turn", degrees: 86, parts: 1, partDelayMs: 0 }] })], { ...defaultSettings, autoSensitivity: false }).script).toContain("Turn(430, 1, 0)")
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

describe('hold duration', () => {
  it('holds a tapped key for holdMs', () => {
    const { script } = generate([macro({ steps: [{ id: 's', type: 'tap', key: 's', holdMs: 80 }] })], defaultSettings)
    expect(script).toContain('    Send("{s down}")\r\n    PreciseSleep(80)\r\n    Send("{s up}")')
    expect(estimateDuration([{ id: 's', type: 'tap', key: 's', holdMs: 80 }])).toBe(80)
    const parsed = parseLibraryJson(serializeLibrary(defaultSettings, [macro({ steps: [{ id: 's', type: 'tap', key: 's', holdMs: 80 }] })]))
    expect(parsed.macros[0].steps[0]).toMatchObject({ type: 'tap', key: 's', holdMs: 80 })
  })

  it('auto emote template unlocks shift lock and clicks Drum Major', () => {
    const t = TEMPLATES.find((x) => x.key === 'emote-backdash-auto')!
    const { script, problems } = generate([macroFromTemplate(t)], defaultSettings)
    expect(problems).toEqual([])
    const body = script.slice(script.indexOf('Macro1(*) {'))
    expect(body.indexOf('Send("{Shift}")')).toBeLessThan(body.indexOf('MouseMove(957, 700, 0)'))
    expect(body.indexOf('MouseMove(957, 700, 0)')).toBeLessThan(body.indexOf('Send("{b}")'))
  })
})

describe('block input', () => {
  it('wraps macros with block steps in try/finally', () => {
    const { script, problems } = generate([macro({ steps: [
      { id: 'b1', type: 'block', target: 'all', on: true },
      { id: 't', type: 'tap', key: 'q' },
      { id: 'b2', type: 'block', target: 'keyboard', on: false },
    ] })], defaultSettings)
    expect(problems).toEqual([])
    expect(script).toContain('    try {\r\n        BlockAll(true)\r\n        Send("{q}")\r\n        BlockKeyboard(false)\r\n    } finally {\r\n        UnblockAll()\r\n    }')
    const parsed = parseLibraryJson(serializeLibrary(defaultSettings, [macro({ steps: [{ id: 'b', type: 'block', target: 'mouse', on: false }] })]))
    expect(parsed.macros[0].steps[0]).toMatchObject({ type: 'block', target: 'mouse', on: false })
  })
  it('relaunches as admin only when blocking is used', () => {
    const withBlock = generate([macro({ steps: [{ id: 'b', type: 'block', target: 'keyboard', on: true }] })], defaultSettings).script
    expect(withBlock).toContain(`Run('*RunAs "' A_AhkPath '" /restart "' A_ScriptFullPath '"')`)
    expect(withBlock).toContain('BlockKeyboard(true)')
    expect(withBlock).toContain('"RCtrl", "``", "-"')
    expect(withBlock).toContain('FileExist(A_ScriptDir "\\stop.flag")')
  })
  it('leaves macros without block steps unwrapped', () => {
    const { script } = generate([macro({ steps: [{ id: 't', type: 'tap', key: 'q' }] })], defaultSettings)
    expect(script).not.toContain('Macro1(*) {\r\n    try {')
    expect(script).not.toContain('*RunAs')
  })
})

describe('held keys', () => {
  it('releases keys held before blocking and restores them after', () => {
    const { script } = generate([macro({ steps: [{ id: 'b', type: 'block', target: 'all', on: true }] })], defaultSettings)
    expect(script).toContain('ReleaseHeld(BlockableKeys())\n            ReleaseHeld(MouseButtons)\n            BlockInput("On")')
    expect(script).toContain('RestoreHeld(keys) {')
    expect(script).toContain('InstallKeybdHook()')
  })
})

describe('auto sensitivity', () => {
  it('reads Roblox sensitivity at runtime when enabled', () => {
    const steps = [{ id: 't', type: 'turn' as const, degrees: -60, parts: 1, partDelayMs: 0 }]
    const auto = generate([macro({ steps })], { ...defaultSettings, autoSensitivity: true }).script
    expect(auto).toContain('TurnDeg(-60, 1, 0)')
    expect(auto).toContain('"\\Roblox\\GlobalBasicSettings_*.xml"')
    expect(auto).toContain(`'<float name="MouseSensitivity">([\\d.]+)</float>'`)
    expect(auto).toContain('global FallbackSens := 0.4')
    const manual = generate([macro({ steps })], { ...defaultSettings, autoSensitivity: false }).script
    expect(manual).toContain('Turn(-300, 1, 0)')
    expect(manual).not.toContain('RefreshSens()\r\n')
    expect(manual).toContain('global FallbackSens := 0.4')
  })
})

describe('ahk import', () => {
  it('round-trips scripts generated by the editor', async () => {
    const { parseAhk } = await import('./ahkImport')
    const macros = TEMPLATES.filter((t) => t.steps.length > 0).map(macroFromTemplate).map((m, i) => ({ ...m, hotkey: `F${i + 3}` }))
    macros[0].steps.unshift({ id: 'b', type: 'block', target: 'all', on: true })
    const { script } = generate(macros, defaultSettings)
    const { macros: back, warnings } = parseAhk(script, defaultSettings)
    expect(warnings).toEqual([])
    expect(back.map((m) => m.name)).toEqual(macros.map((m) => m.name))
    const strip = (ms: Macro[]) => ms.map((m) => ({ hotkey: m.hotkey, steps: m.steps.map(({ id: _id, ...rest }) => rest) }))
    // 按住時長會被展開成 down/wait/up，比較前先把原始的也展開
    const expand = (ms: Macro[]) => ms.map((m) => ({ ...m, steps: m.steps.flatMap((s) => s.type === 'tap' && s.holdMs ? [
      { id: '', type: 'down' as const, key: s.key }, { id: '', type: 'wait' as const, ms: s.holdMs }, { id: '', type: 'up' as const, key: s.key }] : [s]) }))
    expect(strip(back)).toEqual(strip(expand(macros)))
  })

  it('reads hand-written v1 and v2 hotkeys', async () => {
    const { parseAhk } = await import('./ahkImport')
    const v2 = `#Requires AutoHotkey v2.0
~x:: {
    Send("{s Down}")
    Sleep 10
    Send "q"
    Click("Down Left")
    DllCall("mouse_event", "UInt", 1, "Int", -300, "Int", 0)
    loop 2
    {
        Send("{Space}")
    }
    foo := 1
}
F1::ExitApp()`
    const r = parseAhk(v2, defaultSettings)
    expect(r.macros).toHaveLength(1)
    expect(r.macros[0].passThrough).toBe(true)
    expect(r.macros[0].steps.map((s) => s.type)).toEqual(['down', 'wait', 'tap', 'down', 'turn', 'tap', 'tap'])
    expect(r.macros[0].steps[4]).toMatchObject({ degrees: -60 })
    expect(r.warnings.some((w) => w.includes('foo := 1'))).toBe(true)
    const v1 = 'c::\nSend {b}\nSleep, 30\nreturn\n'
    expect(parseAhk(v1, defaultSettings).macros[0].steps.map((s) => s.type)).toEqual(['tap', 'wait'])
  })
})

describe('wait color', () => {
  const wc = (stopOnTimeout: boolean) => ({
    id: 'w', type: 'waitColor' as const, x: 957, y: 700, color: '#F2C14E', tolerance: 20, timeoutMs: 1000, stopOnTimeout,
  })

  it('stops the macro and releases held keys when the color never shows up', () => {
    const steps = [{ id: 'd', type: 'down' as const, key: 's' }, wc(true), { id: 'u', type: 'up' as const, key: 's' }, wc(true)]
    const { script, problems } = generate([macro({ steps })], defaultSettings)
    expect(problems.filter((p) => p.level === 'error')).toEqual([])
    expect(script).toContain('CoordMode("Pixel", "Screen")')
    expect(script).toContain('    if !WaitColor(957, 700, 0xF2C14E, 20, 1000) {\r\n        Send("{s up}")\r\n        return\r\n    }\r\n    Send("{s up}")')
    // s 放開之後就不用再補放開
    expect(script).toContain('    Send("{s up}")\r\n    if !WaitColor(957, 700, 0xF2C14E, 20, 1000)\r\n        return\r\n')
    expect(script).toContain('WaitColor(x, y, color, variation, timeoutMs) {')
  })

  it('just waits when set to continue', () => {
    const { script } = generate([macro({ steps: [wc(false)] })], defaultSettings)
    expect(script).toContain('    WaitColor(957, 700, 0xF2C14E, 20, 1000)\r\n')
    expect(script).not.toContain('if !WaitColor')
  })

  it('validates color and tolerance', () => {
    const problems = validate([macro({ steps: [{ ...wc(true), color: 'red', tolerance: 300 }] })], defaultSettings)
    expect(problems.filter((p) => p.level === 'error')).toHaveLength(2)
  })

  it('survives saving and .ahk import', async () => {
    const lib = parseLibraryJson(serializeLibrary(defaultSettings, [macro({ steps: [wc(true)] })]))
    expect(lib.macros[0].steps[0]).toMatchObject({ type: 'waitColor', x: 957, y: 700, color: '#F2C14E', tolerance: 20, timeoutMs: 1000, stopOnTimeout: true })
    const { parseAhk } = await import('./ahkImport')
    const steps = [{ id: 'd', type: 'down' as const, key: 's' }, wc(true), wc(false), { id: 'u', type: 'up' as const, key: 's' }]
    const back = parseAhk(generate([macro({ steps })], defaultSettings).script, defaultSettings)
    expect(back.warnings).toEqual([])
    expect(back.macros[0].steps.map(({ id: _id, ...rest }) => rest)).toEqual(steps.map(({ id: _id, ...rest }) => rest))
  })
})
