// 把巨集資料轉成 AutoHotkey v2 腳本。
import type { Macro, Settings, Step } from './types'
import { normalizeHotkey, normalizeKey } from './keys'

export interface Problem {
  level: 'error' | 'warning'
  macroId?: string
  stepId?: string
  message: string
}

export interface GenerateResult {
  script: string
  problems: Problem[]
}

export const ROBLOX_EXE = 'RobloxPlayerBeta.exe'

/** 轉 degrees 度需要的滑鼠相對移動量 */
export function turnCounts(degrees: number, settings: Settings): number {
  return Math.round((degrees / 360) * (settings.countsPer360 / settings.sensitivity))
}

/** 估計一個巨集執行一次要多久（毫秒） */
export function estimateDuration(steps: Step[]): number {
  let ms = 0
  for (const s of steps) {
    if (s.type === 'wait') ms += Math.max(0, s.ms)
    if (s.type === 'tap' && s.holdMs) ms += Math.max(0, s.holdMs)
    if (s.type === 'turn') ms += Math.max(0, s.parts - 1) * Math.max(0, s.partDelayMs)
    if (s.type === 'tab') ms += Math.max(0, s.holdMs)
  }
  return ms
}

/** 巨集跑的時候暫停背景檢查多久：最多 1.2 秒，heartbeat 才不會太久沒更新讓編輯器以為腳本停了 */
function pauseMs(steps: Step[]): number {
  const waits = steps.reduce((t, s) => t + (s.type === 'waitColor' ? Math.max(0, s.timeoutMs) : 0), 0)
  return Math.min(1200, Math.round(estimateDuration(steps) + waits + 300))
}

/** 按鍵放進 AHK 字串時的寫法（反引號是 AHK 的跳脫字元） */
function sendKey(key: string): string {
  const k = normalizeKey(key) as string
  return k === '`' ? '``' : k
}

/** 熱鍵定義行的寫法（; 和 ` 需要跳脫） */
function hotkeyDef(raw: string): string {
  const hk = normalizeHotkey(raw) as string
  return hk.replace(/[;`]$/, (c) => '`' + c)
}

function cleanComment(text: string): string {
  return text.replace(/[\r\n]+/g, ' ').trim()
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n)
}

export function validate(macros: Macro[], settings: Settings): Problem[] {
  const problems: Problem[] = []
  if (!isFiniteNumber(settings.sensitivity) || settings.sensitivity <= 0) {
    problems.push({ level: 'error', message: '滑鼠靈敏度必須大於 0' })
  }
  if (!isFiniteNumber(settings.countsPer360) || settings.countsPer360 <= 0) {
    problems.push({ level: 'error', message: '轉 360° 移動量必須大於 0' })
  }

  const used = new Map<string, string>()
  const claim = (hk: string, owner: string, macroId?: string) => {
    const key = hk.toLowerCase()
    const prev = used.get(key)
    if (prev) {
      problems.push({ level: 'error', macroId, message: `熱鍵 ${hk} 同時用在「${prev}」和「${owner}」` })
    } else {
      used.set(key, owner)
    }
  }

  for (const [label, raw] of [['開關巨集', settings.toggleHotkey], ['結束巨集', settings.exitHotkey]] as const) {
    const hk = normalizeHotkey(raw)
    if (!hk) problems.push({ level: 'error', message: `「${label}」的熱鍵「${raw}」無法辨識` })
    else claim(hk, label)
  }

  for (const m of macros) {
    if (!m.enabled) continue
    const name = m.name || '(未命名)'
    const hk = normalizeHotkey(m.hotkey)
    if (!hk) {
      problems.push({ level: 'error', macroId: m.id, message: `「${name}」的熱鍵「${m.hotkey}」無法辨識` })
    } else {
      claim(hk, name, m.id)
      if (!m.passThrough && /^[\^!+#]*(LButton|RButton)$/.test(hk)) {
        problems.push({ level: 'warning', macroId: m.id, message: `「${name}」用滑鼠左／右鍵當觸發鍵，遊戲裡會收不到這個鍵；建議換鍵或打開「按鍵穿透」` })
      }
    }
    if (m.steps.length === 0) {
      problems.push({ level: 'warning', macroId: m.id, message: `「${name}」還沒有任何步驟` })
    }
    for (const s of m.steps) {
      const at = { macroId: m.id, stepId: s.id }
      switch (s.type) {
        case 'tap':
          if (s.holdMs !== undefined && (!isFiniteNumber(s.holdMs) || s.holdMs < 0)) problems.push({ level: 'error', ...at, message: `「${name}」的按鍵時長必須是 0 以上的數字` })
          if (!normalizeKey(s.key)) problems.push({ level: 'error', ...at, message: `「${name}」有無法辨識的按鍵「${s.key}」` })
          break
        case 'down':
        case 'up':
          if (!normalizeKey(s.key)) problems.push({ level: 'error', ...at, message: `「${name}」有無法辨識的按鍵「${s.key}」` })
          break
        case 'wait':
          if (!isFiniteNumber(s.ms) || s.ms < 0) problems.push({ level: 'error', ...at, message: `「${name}」的等待時間必須是 0 以上的數字` })
          break
        case 'turn':
          if (!isFiniteNumber(s.degrees)) problems.push({ level: 'error', ...at, message: `「${name}」的轉向角度不是數字` })
          if (!Number.isInteger(s.parts) || s.parts < 1 || s.parts > 200) problems.push({ level: 'error', ...at, message: `「${name}」的轉向分段數要是 1–200 的整數` })
          if (!isFiniteNumber(s.partDelayMs) || s.partDelayMs < 0) problems.push({ level: 'error', ...at, message: `「${name}」的分段間隔必須是 0 以上的數字` })
          break
        case 'block':
          if (!['keyboard', 'mouse', 'all'].includes(s.target)) problems.push({ level: 'error', ...at, message: `「${name}」的封鎖對象不正確` })
          break
        case 'moveTo':
          if (!Number.isInteger(s.x) || !Number.isInteger(s.y)) problems.push({ level: 'error', ...at, message: `「${name}」的滑鼠座標要是整數` })
          break
        case 'tab':
          if (s.target !== 'title' && s.target !== 'minimize') problems.push({ level: 'error', ...at, message: `「${name}」的 Tab 位置不正確` })
          if (!isFiniteNumber(s.holdMs) || s.holdMs < 0) problems.push({ level: 'error', ...at, message: `「${name}」的 Tab 按住時間必須是 0 以上的數字` })
          break
        case 'waitColor':
          if (s.points.length === 0) problems.push({ level: 'error', ...at, message: `「${name}」的等顏色至少要有一個顏色` })
          s.points.forEach((p, k) => {
            const which = s.points.length > 1 ? `第 ${k + 1} 個顏色` : ''
            if (!Number.isInteger(p.x) || !Number.isInteger(p.y)) problems.push({ level: 'error', ...at, message: `「${name}」${which}的取色座標要是整數` })
            if (!/^#[0-9a-f]{6}$/i.test(p.color)) problems.push({ level: 'error', ...at, message: `「${name}」${which}的顏色不正確` })
          })
          if (!Number.isInteger(s.tolerance) || s.tolerance < 0 || s.tolerance > 255) problems.push({ level: 'error', ...at, message: `「${name}」的顏色誤差要是 0–255 的整數` })
          if (!isFiniteNumber(s.timeoutMs) || s.timeoutMs <= 0) problems.push({ level: 'error', ...at, message: `「${name}」的最多等待時間必須大於 0` })
          break
      }
    }
    // 按住後沒放開的鍵
    const held = new Set<string>()
    for (const s of m.steps) {
      if (s.type === 'down') held.add(normalizeKey(s.key) ?? s.key)
      if (s.type === 'up') held.delete(normalizeKey(s.key) ?? s.key)
    }
    if (held.size > 0) {
      problems.push({ level: 'warning', macroId: m.id, message: `「${name}」按住了 ${[...held].join('、')} 但沒有放開` })
    }
  }
  return problems
}

/** held：執行到這一步時，巨集自己按住還沒放開的鍵（逾時停止前要先放開） */
function stepLines(s: Step, settings: Settings, held: string[]): string[] {
  switch (s.type) {
    case 'tap':
      if (s.holdMs && s.holdMs > 0) {
        return [`Send("{${sendKey(s.key)} down}")`, `PreciseSleep(${Math.round(s.holdMs)})`, `Send("{${sendKey(s.key)} up}")`]
      }
      return [`Send("{${sendKey(s.key)}}")`]
    case 'down':
      return [`Send("{${sendKey(s.key)} down}")`]
    case 'up':
      return [`Send("{${sendKey(s.key)} up}")`]
    case 'wait':
      return s.ms > 0 ? [`PreciseSleep(${Math.round(s.ms)})`] : []
    case 'turn':
      return settings.autoSensitivity
        ? [`TurnDeg(${s.degrees}, ${s.parts}, ${Math.round(s.partDelayMs)})`]
        : [`Turn(${turnCounts(s.degrees, settings)}, ${s.parts}, ${Math.round(s.partDelayMs)})  ; ${s.degrees}°`]
    case 'moveTo':
      return [`MouseMove(${s.x}, ${s.y}, 0)`]
    case 'tab':
      return [`TabWindow("${s.target}", ${Math.round(s.holdMs)})`]
    case 'waitColor': {
      const hex = (c: string) => `0x${c.slice(1).toUpperCase()}`
      const [p] = s.points
      const call = s.points.length === 1
        ? `WaitColor(${p.x}, ${p.y}, ${hex(p.color)}, ${s.tolerance}, ${Math.round(s.timeoutMs)})`
        : `WaitAnyColor([${s.points.map((q) => `[${q.x}, ${q.y}, ${hex(q.color)}]`).join(', ')}], ${s.tolerance}, ${Math.round(s.timeoutMs)})`
      if (!s.stopOnTimeout) return [call]
      if (held.length === 0) return [`if !${call}`, '    return']
      return [`if !${call} {`, ...held.map((k) => `    Send("{${sendKey(k)} up}")`), '    return', '}']
    }
    case 'block': {
      const v = s.on ? 'true' : 'false'
      const lines: string[] = []
      if (s.target === 'all') lines.push(`BlockAll(${v})`)
      if (s.target === 'keyboard') lines.push(`BlockKeyboard(${v})`)
      if (s.target === 'mouse') lines.push(`BlockMouse(${v})`)
      return lines
    }
  }
}

const HELPERS = `; 高精度等待：先用 Sleep 省 CPU，最後 15 ms 用計時器精準等待
PreciseSleep(ms) {
    static freq := 0
    if (!freq)
        DllCall("QueryPerformanceFrequency", "Int64*", &freq)
    start := 0
    DllCall("QueryPerformanceCounter", "Int64*", &start)
    target := start + ms * freq / 1000
    if (ms > 20)
        Sleep(ms - 15)
    now := 0
    Loop {
        DllCall("QueryPerformanceCounter", "Int64*", &now)
        if (now >= target)
            break
    }
}

; 轉視角：相對移動滑鼠，shift lock 下也有效。counts 正數向右
Turn(counts, parts, delayMs) {
    done := 0
    Loop parts {
        target := Round(counts * A_Index / parts)
        DllCall("mouse_event", "UInt", 1, "Int", target - done, "Int", 0, "UInt", 0, "UPtr", 0)
        done := target
        if (A_Index < parts && delayMs > 0)
            PreciseSleep(delayMs)
    }
}

; 讀 Roblox 存檔裡的靈敏度，讓轉視角角度不受遊戲設定影響。
; 遊戲設定選單改的是 MouseSensitivityThirdPerson／FirstPerson，舊的 MouseSensitivity 不會跟著變
RefreshSens(*) {
    global CurSens, FallbackSens, SensFromRoblox, ChecksPausedUntil
    static started := false
    if (A_TickCount < ChecksPausedUntil)
        return
    static pats := ['<Vector2 name="MouseSensitivityThirdPerson">\\s*<X>([\\d.eE+-]+)</X>', '<Vector2 name="MouseSensitivityFirstPerson">\\s*<X>([\\d.eE+-]+)</X>', '<float name="MouseSensitivity">([\\d.eE+-]+)</float>']
    newest := "", newestTime := 0
    try {
        Loop Files EnvGet("LOCALAPPDATA") "\\Roblox\\GlobalBasicSettings_*.xml" {
            if InStr(A_LoopFileName, "Studio")
                continue
            t := Integer(A_LoopFileTimeModified)
            if (t > newestTime) {
                newestTime := t
                newest := A_LoopFileFullPath
            }
        }
    }
    val := 0
    if (newest != "") {
        try {
            text := FileRead(newest)
            for pat in pats {
                if (RegExMatch(text, pat, &m) && Float(m[1]) > 0) {
                    val := Float(m[1])
                    break
                }
            }
        }
    }
    old := CurSens
    SensFromRoblox := val > 0
    CurSens := val > 0 ? val : FallbackSens
    if (started && old != CurSens) {
        ToolTip("轉視角靈敏度：" Format("{:g}", CurSens))
        SetTimer(() => ToolTip(), -2000)
    }
    started := true
}

TurnDeg(degrees, parts, delayMs) {
    global CountsPer360, CurSens
    Turn(Round(degrees / 360 * CountsPer360 / CurSens), parts, delayMs)
}

WatchEditor() {
    static beats := 0
    global ChecksPausedUntil
    if (A_TickCount < ChecksPausedUntil)
        return
    if FileExist(A_ScriptDir "\\stop.flag")
        ExitApp()
    beats += 1
    if (Mod(beats, 3) = 1) {
        try FileOpen(A_ScriptDir "\\heartbeat", "w").Write(A_TickCount)
    }
}

; 巨集跑的時候先暫停背景檢查（看停止檔案、讀靈敏度），免得插進巨集中間讓等待變長
PauseChecks(ms) {
    global ChecksPausedUntil
    ChecksPausedUntil := A_TickCount + ms
}

; 系統管理員模式下用 Windows 的 BlockInput 擋住全部實體輸入（包含 Shift 和滑鼠轉鏡頭）
BlockAll(on) {
    global FullBlocked
    if (A_IsAdmin) {
        if (on = FullBlocked)
            return
        FullBlocked := on
        if (on) {
            ReleaseHeld(BlockableKeys())
            ReleaseHeld(MouseButtons)
            BlockInput("On")
        } else {
            BlockInput("Off")
            RestoreHeld(BlockableKeys())
            RestoreHeld(MouseButtons)
        }
        return
    }
    BlockKeyboard(on)
    BlockMouse(on)
}

; 封鎖你自己的鍵盤：替每個鍵註冊一個什麼都不做的熱鍵把它吃掉。
; 巨集用 SendInput 送出的按鍵不會觸發熱鍵，所以照常送進遊戲
BlockKeyboard(on) {
    global KeysBlocked
    if (on = KeysBlocked)
        return
    KeysBlocked := on
    if (on)
        ReleaseHeld(BlockableKeys())
    HotIf()
    for k in BlockableKeys()
        try Hotkey("*" k, NoOp, on ? "On" : "Off")
    if (!on)
        RestoreHeld(BlockableKeys())
}

; 封鎖你自己的滑鼠：按鍵、滾輪和移動
BlockMouse(on) {
    global MouseBlocked
    if (on = MouseBlocked)
        return
    MouseBlocked := on
    if (on)
        ReleaseHeld(MouseButtons)
    HotIf()
    for k in MouseButtons
        Hotkey("*" k, NoOp, on ? "On" : "Off")
    Hotkey("*WheelUp", NoOp, on ? "On" : "Off")
    Hotkey("*WheelDown", NoOp, on ? "On" : "Off")
    BlockInput(on ? "MouseMove" : "MouseMoveOff")
    if (!on)
        RestoreHeld(MouseButtons)
}

UnblockAll() {
    BlockAll(false)
    BlockKeyboard(false)
    BlockMouse(false)
}

NoOp(*) {
}

BlockableKeys() {
    static keys := 0
    if (!IsObject(keys)) {
        keys := []
        Loop Parse "abcdefghijklmnopqrstuvwxyz0123456789"
            keys.Push(A_LoopField)
        for k in ["Space", "Tab", "Enter", "Escape", "Backspace", "Up", "Down", "Left", "Right",
                  "LShift", "RShift", "LCtrl", "RCtrl", "\`\`", "-", "=", "[", "]", "\\", "'", ",", ".", "/"]
            keys.Push(k)
    }
    return keys
}

; 開始封鎖時，你手上按著的鍵先送出「放開」，遊戲才不會以為它一直被按著
ReleaseHeld(keys) {
    for k in keys {
        if (GetKeyState(k, "P"))
            Send("{" k " up}")
    }
}

; 解除封鎖時：還按著的鍵補送「按下」，封鎖期間放開的補送「放開」
RestoreHeld(keys) {
    for k in keys {
        if (GetKeyState(k, "P"))
            Send("{" k " down}")
        else if (GetKeyState(k))
            Send("{" k " up}")
    }
}

; Tab：按住 Roblox 視窗正上方的標題列（左鍵）或右上的最小化鈕（右鍵）holdMs 毫秒。
; 全螢幕沒有標題列，會先按 F11 退出
TabWindow(target, holdMs) {
    hwnd := WinActive("ahk_exe ${ROBLOX_EXE}")
    if !hwnd
        hwnd := WinExist("ahk_exe ${ROBLOX_EXE}")
    if !hwnd
        return
    if !(WinGetStyle(hwnd) & 0xC00000) {
        Send("{F11}")
        start := A_TickCount
        while (!(WinGetStyle(hwnd) & 0xC00000) && A_TickCount - start < 2000)
            Sleep(10)
        Sleep(150)
    }
    WinGetPos(&wx, &wy, &ww, &wh, hwnd)
    WinGetClientPos(&cx, &cy, &cw, &ch, hwnd)
    dpi := 0
    try dpi := DllCall("GetDpiForWindow", "Ptr", hwnd, "UInt")
    if (dpi <= 0)
        dpi := A_ScreenDPI
    ; 標題列在視窗頂端到內容區之間，取中間
    y := (cy - wy >= 8) ? Round((wy + cy) / 2) : wy + Round(15 * dpi / 96)
    if (target = "minimize") {
        ; 右上三顆按鈕各約 46 px，最小化是右邊數來第三顆
        x := cx + cw - Round(46 * dpi / 96 * 2.5)
        btn := "RButton"
    } else {
        x := wx + ww // 2
        btn := "LButton"
    }
    DllCall("ClipCursor", "Ptr", 0)
    DllCall("SetCursorPos", "Int", x, "Int", y)
    Send("{" btn " down}")
    PreciseSleep(holdMs)
    Send("{" btn " up}")
    if (btn = "RButton") {
        ; 右鍵放開後如果跳出視窗選單，把它關掉
        Sleep(30)
        if WinExist("ahk_class #32768")
            Send("{Esc}")
    } else {
        ; 等標題列確定放開，移游標才不會拖到視窗
        PreciseSleep(15)
    }
    ; 游標回到遊戲畫面正中間
    try WinGetClientPos(&cx, &cy, &cw, &ch, hwnd)
    DllCall("SetCursorPos", "Int", cx + cw // 2, "Int", cy + ch // 2)
}

; 等螢幕上 (x, y) 變成指定顏色：等到回傳 true，超過 timeoutMs 回傳 false
WaitColor(x, y, color, variation, timeoutMs) {
    return WaitAnyColor([[x, y, color]], variation, timeoutMs)
}

; 等好幾個點，任一點變成它的顏色就回傳 true，超過 timeoutMs 回傳 false。points 是 [[x, y, 顏色], ...]
WaitAnyColor(points, variation, timeoutMs) {
    start := A_TickCount
    Loop {
        for p in points {
            try {
                if PixelSearch(&fx, &fy, p[1], p[2], p[1], p[2], p[3], variation)
                    return true
            }
        }
        if (A_TickCount - start >= timeoutMs)
            return false
        Sleep(1)
    }
}

ToggleMacros(*) {
    global MacrosEnabled
    MacrosEnabled := !MacrosEnabled
    ToolTip(MacrosEnabled ? "巨集：開" : "巨集：關")
    SetTimer(() => ToolTip(), -1000)
}`

export function generate(macros: Macro[], settings: Settings): GenerateResult {
  const problems = validate(macros, settings)
  if (problems.some((p) => p.level === 'error')) {
    return { script: '', problems }
  }

  const enabled = macros.filter((m) => m.enabled)
  const needsAdmin = enabled.some((m) => m.steps.some((s) => s.type === 'block'))
  const out: string[] = []
  out.push(
    '; 由 TSB 巨屌編輯器產生，請在編輯器裡修改，直接改這個檔案會被覆蓋',
    '#Requires AutoHotkey v2.0',
    '#SingleInstance Force',
    'SendMode("Input")',
    'CoordMode("Mouse", "Screen")',
    'CoordMode("Pixel", "Screen")',
    'A_MaxHotkeysPerInterval := 2000',
    'DllCall("winmm\\timeBeginPeriod", "UInt", 1)',
    '',
    'global MacrosEnabled := true',
    'global FullBlocked := false',
    'global KeysBlocked := false',
    'global MouseBlocked := false',
    'global MouseButtons := ["LButton", "RButton", "MButton", "XButton1", "XButton2"]',
    ...(needsAdmin
      ? [
          '; 有「封鎖輸入」步驟：用系統管理員身分重新啟動，才能真正擋住 Roblox 讀到的輸入',
          'if (!A_IsAdmin) {',
          '    try {',
          `        Run('*RunAs "' A_AhkPath '" /restart "' A_ScriptFullPath '"')`,
          '        ExitApp()',
          '    }',
          '    ; 拒絕權限確認時，改用一般模式繼續執行',
          '}',
        ]
      : []),
    '; 編輯器透過 stop.flag 要求停止，透過 heartbeat 判斷是否執行中（系統管理員模式下編輯器無法直接關閉腳本）',
    'global ChecksPausedUntil := 0',
    'SetTimer(WatchEditor, 300)',
    `global CountsPer360 := ${settings.countsPer360}`,
    `global FallbackSens := ${settings.sensitivity}`,
    'global CurSens := FallbackSens',
    'global SensFromRoblox := false',
    ...(settings.autoSensitivity ? ['RefreshSens()', 'SetTimer(RefreshSens, 3000)'] : []),
    ...(needsAdmin ? ['; 讀取實體按鍵狀態需要鍵盤、滑鼠 hook', 'InstallKeybdHook()', 'InstallMouseHook()'] : []),
    'ToolTip((A_IsAdmin ? "TSB 巨集已載入（系統管理員）" : "TSB 巨集已載入") "`n轉視角靈敏度：" Format("{:g}", CurSens) (SensFromRoblox ? "（Roblox 設定）" : "（編輯器設定）"))',
    'SetTimer(() => ToolTip(), -2500)',
    '',
    `${hotkeyDef(settings.exitHotkey)}::ExitApp()`,
    `${hotkeyDef(settings.toggleHotkey)}::ToggleMacros()`,
    '',
  )

  const cond = settings.robloxOnly
    ? `MacrosEnabled && WinActive("ahk_exe ${ROBLOX_EXE}")`
    : 'MacrosEnabled'
  out.push(`#HotIf ${cond}`)
  enabled.forEach((m, i) => {
    const prefix = m.passThrough ? '~' : '$'
    out.push(`${prefix}${hotkeyDef(m.hotkey)}::Macro${i + 1}()  ; ${cleanComment(m.name)}`)
  })
  out.push('#HotIf', '')

  enabled.forEach((m, i) => {
    out.push(`; ${cleanComment(m.name)}`)
    if (m.note) out.push(`; ${cleanComment(m.note)}`)
    out.push(`Macro${i + 1}(*) {`, `    PauseChecks(${pauseMs(m.steps)})`)
    const blocks = m.steps.some((s) => s.type === 'block')
    const indent = blocks ? '        ' : '    '
    if (blocks) out.push('    try {')
    const held: string[] = []
    for (const s of m.steps) {
      for (const line of stepLines(s, settings, held)) out.push(`${indent}${line}`)
      if (s.type === 'down' || s.type === 'up') {
        const k = normalizeKey(s.key) ?? s.key
        const at = held.indexOf(k)
        if (s.type === 'down' && at < 0) held.push(k)
        if (s.type === 'up' && at >= 0) held.splice(at, 1)
      }
    }
    if (blocks) out.push('    } finally {', '        UnblockAll()', '    }')
    out.push('}', '')
  })

  out.push(HELPERS, '')
  return { script: out.join('\r\n'), problems }
}
