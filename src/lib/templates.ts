// 內建技巧範本。時間和角度照社群腳本 Jaharia TSB Macro（作者 Sedz）與使用者提供的 .mgp。
// 角度換算：Jaharia 的移動量 r（靈敏度 1 時）= r / 2 度。遊戲更新或電腦延遲不同時需要自己微調。
import type { Macro, Step, TabTarget } from './types'
import { newId } from './types'

type StepSpec =
  | ['tap', string, number?]
  | ['down' | 'up', string]
  | ['wait', number]
  | ['turn', number, number?, number?]
  | ['moveTo', number, number]
  | ['tab', TabTarget, number]

function build(specs: StepSpec[]): Step[] {
  return specs.map((s): Step => {
    const id = newId()
    switch (s[0]) {
      case 'tap':
        return s[2] ? { id, type: 'tap', key: s[1], holdMs: s[2] } : { id, type: 'tap', key: s[1] }
      case 'down':
      case 'up':
        return { id, type: s[0], key: s[1] }
      case 'wait':
        return { id, type: 'wait', ms: s[1] }
      case 'turn':
        return { id, type: 'turn', degrees: s[1], parts: s[2] ?? 1, partDelayMs: s[3] ?? 0 }
      case 'moveTo':
        return { id, type: 'moveTo', x: s[1], y: s[2] }
      case 'tab':
        return { id, type: 'tab', target: s[1], holdMs: s[2] }
    }
  })
}

export type Choices = Record<string, string>

export interface TemplateOption {
  key: string
  label: string
  choices: { value: string; label: string }[]
  /** 選到的值一定寫進巨集名稱（例如技能幾） */
  alwaysInName?: boolean
  /** 只有條件成立才需要選（例如沒開 shift lock 就不用選轉法） */
  when?: (o: Choices) => boolean
}

type Dyn<T> = T | ((o: Choices) => T)

export interface Template {
  key: string
  group: string
  name: string
  hotkey: Dyn<string>
  description: Dyn<string>
  options?: TemplateOption[]
  steps: Dyn<StepSpec[]>
}

const val = <T,>(v: Dyn<T>, o: Choices): T => (typeof v === 'function' ? (v as (o: Choices) => T)(o) : v)

const SIDE: Record<string, string> = { right: 'd', left: 'a' }
const BACKDASH_HOTKEY: Record<string, string> = { '1': 'z', '2': 'x', '3': 'c', '4': 'v' }

const shiftOpt: TemplateOption = { key: 'shift', label: 'Shift lock', choices: [{ value: 'on', label: '有開 shift lock' }, { value: 'off', label: '沒開 shift lock' }] }
const jumpOpt: TemplateOption = { key: 'jump', label: '跳', choices: [{ value: 'on', label: '跳' }, { value: 'off', label: '不跳' }] }
const styleOpt: TemplateOption = { key: 'style', label: '轉法', choices: [{ value: 'once', label: '一次轉' }, { value: 'split', label: '分段轉' }] }
const sideOpt: TemplateOption = { key: 'side', label: '方向', alwaysInName: true, choices: [{ value: 'right', label: '往右' }, { value: 'left', label: '往左' }] }

export const TEMPLATES: Template[] = [
  {
    key: 'backdash-cancel',
    group: 'Backdash',
    name: 'Backdash cancel',
    hotkey: (o) => BACKDASH_HOTKEY[o.skill],
    description: (o) => `技能 ${o.skill} + 後閃取消`,
    options: [{ key: 'skill', label: '技能', alwaysInName: true, choices: ['1', '2', '3', '4'].map((v) => ({ value: v, label: `技能 ${v}` })) }],
    steps: (o) => [['tap', o.skill], ['down', 's'], ['wait', 5], ['tap', 'LButton'], ['wait', 10], ['tap', 'q'], ['up', 's'], ['tap', o.skill]],
  },
  {
    key: 'lethal-v1',
    group: 'Lethal',
    name: 'Lethal V1',
    hotkey: 'r',
    description: (o) => {
      const jump = o.jump === 'on' ? '閃 + 跳' : '閃'
      if (o.shift === 'off') return `${jump}，按 Shift 轉向`
      return o.style === 'split' ? `${jump}，分 4 段左轉 202°` : `${jump}，右轉 180°`
    },
    options: [shiftOpt, jumpOpt, { ...styleOpt, when: (o) => o.shift === 'on' }],
    steps: (o) => {
      const jump = o.jump === 'on'
      const flick: StepSpec[] =
        o.shift === 'off' ? [['wait', 220], ['tap', 'Shift']]
          : o.style === 'split' ? [['wait', 200], ['turn', -202.4, 4, 15], ['wait', 15]]
            : [['wait', 220], ['turn', 180]]
      return jump ? [['tap', 'q'], ['down', 'Space'], ...flick, ['up', 'Space']] : [['tap', 'q'], ...flick]
    },
  },
  {
    key: 'lethal-v2',
    group: 'Lethal',
    name: 'Lethal V2',
    hotkey: 'r',
    description: (o) => {
      const jump = o.jump === 'on' ? '跳 + 閃' : '閃'
      return o.style === 'split' ? `${jump}，分段轉兩次` : `右轉 180°、${jump}、再轉 175°`
    },
    options: [jumpOpt, styleOpt],
    steps: (o) => {
      const jump = o.jump === 'on'
      if (o.style === 'split') {
        const body: StepSpec[] = [['tap', 'q'], ['wait', 30], ['turn', 180, 10, 8], ['wait', 78], ['turn', 194, 10, 5], ['wait', 5]]
        return jump ? [['down', 'Space'], ...body, ['up', 'Space']] : body
      }
      return jump
        ? [['turn', 180], ['down', 'Space'], ['tap', 'q'], ['wait', 190], ['turn', 175], ['up', 'Space']]
        : [['turn', 180], ['tap', 'q'], ['wait', 190], ['turn', 175]]
    },
  },
  {
    key: 'twist-v1',
    group: 'Twist',
    name: 'Twist V1',
    hotkey: 'e',
    description: (o) => (o.style === 'split' ? '閃，分段左、右、左轉' : '左轉 50°、閃、右轉 100°、左轉 55°'),
    options: [styleOpt],
    steps: (o) =>
      o.style === 'split'
        ? [['tap', 'q'], ['wait', 110], ['turn', -90, 15, 2], ['wait', 12], ['turn', 180, 10, 8], ['wait', 18], ['turn', -88, 10, 3], ['wait', 3]]
        : [['turn', -50], ['tap', 'q'], ['wait', 170], ['turn', 100], ['wait', 90], ['turn', -55]],
  },
  {
    key: 'twist-v2',
    group: 'Twist',
    name: 'Twist V2',
    hotkey: 'e',
    description: '左轉 60°、閃、右轉 86°',
    steps: [['turn', -60], ['tap', 'q'], ['wait', 190], ['turn', 86]],
  },
  {
    key: 'side-front-dash',
    group: 'Dash',
    name: 'Side front dash',
    hotkey: 't',
    description: (o) => (o.side === 'left' ? '前閃接左閃' : '前閃接右閃'),
    options: [sideOpt],
    steps: (o) => [['tap', 'q'], ['down', SIDE[o.side]], ['wait', 10], ['tap', 'q'], ['up', SIDE[o.side]]],
  },
  {
    key: 'super-jump',
    group: 'Dash',
    name: 'Super jump',
    hotkey: 'z',
    description: (o) => `${o.side === 'left' ? '左' : '右'}閃接跳${o.tab === 'on' ? '，Tab 卡 0.8 秒' : ''}`,
    options: [sideOpt, { key: 'tab', label: 'Tab', choices: [{ value: 'off', label: '不用 Tab' }, { value: 'on', label: '用 Tab' }] }],
    steps: (o) => {
      const k = SIDE[o.side]
      return o.tab === 'on'
        ? [['down', k], ['wait', 3], ['tap', 'q'], ['down', 'Space'], ['wait', 50], ['tab', 'title', 800], ['up', 'Space'], ['up', k]]
        : [['down', k], ['wait', 3], ['tap', 'q'], ['down', 'Space'], ['wait', 10], ['up', 'Space'], ['up', k]]
    },
  },
  {
    key: 'solitude',
    group: 'Solitude',
    name: 'Solitude',
    hotkey: 't',
    description: (o) => `左鍵、跳、左鍵、閃，${o.style === 'split' ? '分 4 段轉' : '轉 180°'}`,
    options: [styleOpt],
    steps: (o) =>
      o.style === 'split'
        ? [['wait', 120], ['tap', 'LButton'], ['wait', 100], ['down', 'Space'], ['wait', 420], ['tap', 'LButton'], ['wait', 357], ['up', 'Space'], ['tap', 'q'], ['wait', 232], ['turn', -204.8, 4, 20], ['wait', 20]]
        : [['wait', 120], ['tap', 'LButton'], ['wait', 110], ['down', 'Space'], ['wait', 420], ['tap', 'LButton'], ['wait', 357], ['up', 'Space'], ['tap', 'q'], ['wait', 232], ['turn', -180]],
  },
  {
    key: 'true-downslam',
    group: 'Downslam',
    name: 'True downslam',
    hotkey: 'h',
    description: (o) => (o.mode === 'hit' ? '左鍵後跳' : '按住左鍵 + 跳'),
    options: [{ key: 'mode', label: '模式', choices: [{ value: 'hold', label: '按住' }, { value: 'hit', label: '打擊 + 跳' }] }],
    steps: (o) =>
      o.mode === 'hit'
        ? [['tap', 'LButton'], ['wait', 60], ['down', 'Space'], ['wait', 50], ['up', 'Space']]
        : [['wait', 200], ['down', 'LButton'], ['wait', 50], ['down', 'Space'], ['wait', 700], ['up', 'Space'], ['up', 'LButton']],
  },
  {
    key: 'emote-backdash-auto',
    group: 'Emote',
    name: 'Emote backdash（自動點 Drum Major）',
    hotkey: 'c',
    description: '解除 shift、自動點 Drum Major、後閃、跳',
    steps: [
      ['tap', 'Shift'], ['wait', 20],
      ['moveTo', 957, 700], ['moveTo', 955, 701], ['moveTo', 957, 701], ['wait', 10],
      ['tap', 'b'], ['down', 'LButton'], ['wait', 10], ['up', 'LButton'],
      ['down', 's'], ['wait', 10], ['tap', 'q'], ['wait', 40], ['up', 's'],
      ['tap', 'LButton'], ['wait', 30], ['tap', 'Space', 30],
      ['wait', 20], ['tap', 'Shift'],
    ],
  },
  {
    key: 'emote-backdash-rachan',
    group: 'Emote',
    name: 'Emote backdash（Rachan）',
    hotkey: 'c',
    description: 'B 開表情、左鍵選、後閃、跳',
    steps: [
      ['tap', 'b'], ['down', 'LButton'], ['wait', 10], ['up', 'LButton'],
      ['down', 's'], ['wait', 10], ['tap', 'q'], ['up', 's'],
      ['tap', 'LButton'], ['wait', 30], ['down', 'Space'], ['wait', 30], ['up', 'Space'],
    ],
  },
  {
    key: 'blank',
    group: '其他',
    name: '空白巨集',
    hotkey: 'F5',
    description: '自己加步驟',
    steps: [],
  },
]

export const TEMPLATE_GROUPS = [...new Set(TEMPLATES.map((t) => t.group))]

/** 每個選項預設選第一個 */
export function defaultChoices(t: Template): Choices {
  return Object.fromEntries((t.options ?? []).map((o) => [o.key, o.choices[0].value]))
}

/** 目前要顯示的選項（有些選項只在特定情況需要） */
export function visibleOptions(t: Template, o: Choices): TemplateOption[] {
  return (t.options ?? []).filter((opt) => !opt.when || opt.when(o))
}

/** 所有不同的選項組合（測試用）；被隱藏的選項不影響結果，只留一種 */
export function allChoices(t: Template): Choices[] {
  let combos: Choices[] = [{}]
  for (const opt of t.options ?? []) {
    combos = combos.flatMap((c) => opt.choices.map((ch) => ({ ...c, [opt.key]: ch.value })))
  }
  const seen = new Set<string>()
  return combos.filter((c) => {
    const name = templateName(t, c)
    if (seen.has(name)) return false
    seen.add(name)
    return true
  })
}

export function templateName(t: Template, o: Choices): string {
  const parts = visibleOptions(t, o)
    .filter((opt) => opt.alwaysInName || o[opt.key] !== opt.choices[0].value)
    .map((opt) => opt.choices.find((c) => c.value === o[opt.key])?.label ?? '')
    .filter(Boolean)
  return parts.length ? `${t.name}（${parts.join('、')}）` : t.name
}

export function templateDescription(t: Template, o: Choices = defaultChoices(t)): string {
  return val(t.description, o)
}

export function templateHotkey(t: Template, o: Choices = defaultChoices(t)): string {
  return val(t.hotkey, o)
}

export function macroFromTemplate(t: Template, choices?: Choices): Macro {
  const o = { ...defaultChoices(t), ...choices }
  return {
    id: newId('m'),
    name: templateName(t, o),
    hotkey: val(t.hotkey, o),
    enabled: true,
    passThrough: false,
    note: val(t.description, o),
    steps: build(val(t.steps, o)),
  }
}
