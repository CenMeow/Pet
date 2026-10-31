// 內建技巧範本。時間數值參考社群腳本 Jaharia TSB Macro（作者 Sedz）與使用者提供的 .mgp，
// 遊戲更新或電腦延遲不同時需要自己微調。
import type { Macro, Step } from './types'
import { newId } from './types'

type StepSpec =
  | ['tap', string, number?]
  | ['down' | 'up', string]
  | ['wait', number]
  | ['turn', number, number?, number?]
  | ['moveTo', number, number]

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
    }
  })
}

export interface Template {
  key: string
  name: string
  hotkey: string
  description: string
  steps: StepSpec[]
}

export const TEMPLATES: Template[] = [
  {
    key: 'backdash-cancel',
    name: 'Backdash cancel（技能 1）',
    hotkey: 'z',
    description: '切到技能 1，按住 S 往後，點左鍵後馬上 Q 側閃取消，再切回。要用其他技能就把兩個「1」改成 2、3、4。',
    steps: [['tap', '1'], ['down', 's'], ['wait', 5], ['tap', 'LButton'], ['wait', 10], ['tap', 'q'], ['up', 's'], ['tap', '1']],
  },
  {
    key: 'emote-backdash-rachan',
    name: 'Emote backdash（Rachan）',
    hotkey: 'c',
    description: '來自你上傳的「Rachan emote backdash 2.mgp」。B 開表情、左鍵選表情，接著 S+Q 後閃、左鍵、跳。滑鼠需停在表情的位置上。',
    steps: [
      ['tap', 'b'], ['down', 'LButton'], ['wait', 10], ['up', 'LButton'],
      ['down', 's'], ['wait', 10], ['tap', 'q'], ['up', 's'],
      ['tap', 'LButton'], ['wait', 30], ['down', 'Space'], ['wait', 30], ['up', 'Space'],
    ],
  },
  {
    key: 'emote-backdash-auto',
    name: 'Emote backdash（自動點 Drum Major）',
    hotkey: 'c',
    description: '照 Rachan 的按法，但先按 Shift 解除 shift lock，再把滑鼠移到表情輪盤正下方的 Drum Major（957, 700，以 1920×1080 全螢幕為準）點選，最後按 Shift 開回 shift lock。S 按多久用第 14 步的等待時間調整（預設 40 毫秒）。',
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
    key: 'twist-v2',
    name: 'Twist tech（兩段轉向）',
    hotkey: 'e',
    description: '需要 shift lock。先往左轉 60° 再側閃，等 190 ms 後往右轉 86°。角度依你的靈敏度換算，靈敏度在「設定」裡填。',
    steps: [['turn', -60], ['tap', 'q'], ['wait', 190], ['turn', 86]],
  },
  {
    key: 'twist-v1',
    name: 'Twist tech（三段轉向）',
    hotkey: 'e',
    description: '需要 shift lock。左轉 50°、側閃、等 170 ms 右轉 100°、再等 90 ms 左轉 55°。',
    steps: [['turn', -50], ['tap', 'q'], ['wait', 170], ['turn', 100], ['wait', 90], ['turn', -55]],
  },
  {
    key: 'lethal-v1',
    name: 'Lethal dash（跳躍版）',
    hotkey: 'r',
    description: '需要 shift lock。側閃同時按住跳，220 ms 後瞬間轉 180°。',
    steps: [['tap', 'q'], ['down', 'Space'], ['wait', 220], ['turn', 180], ['up', 'Space']],
  },
  {
    key: 'side-front-dash',
    name: 'Side front dash（往右）',
    hotkey: 't',
    description: '前閃後馬上按住 D 再閃一次。往左就把 D 改成 A。',
    steps: [['tap', 'q'], ['down', 'd'], ['wait', 10], ['tap', 'q'], ['up', 'd']],
  },
  {
    key: 'super-jump',
    name: 'Super jump（往右）',
    hotkey: 'z',
    description: '按住 D、側閃後立刻跳。往左就把 D 改成 A。',
    steps: [['down', 'd'], ['wait', 3], ['tap', 'q'], ['down', 'Space'], ['wait', 10], ['up', 'Space'], ['up', 'd']],
  },
  {
    key: 'true-downslam',
    name: 'True downslam',
    hotkey: 'h',
    description: '按住左鍵，50 ms 後按住跳 700 ms。',
    steps: [['wait', 200], ['down', 'LButton'], ['wait', 50], ['down', 'Space'], ['wait', 700], ['up', 'Space'], ['up', 'LButton']],
  },
  {
    key: 'blank',
    name: '空白巨集',
    hotkey: 'F5',
    description: '從零開始自己排步驟。',
    steps: [],
  },
]

export function macroFromTemplate(t: Template): Macro {
  return {
    id: newId('m'),
    name: t.name,
    hotkey: t.hotkey,
    enabled: true,
    passThrough: false,
    note: t.description,
    steps: build(t.steps),
  }
}
