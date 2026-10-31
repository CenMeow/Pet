import { useRef, useState } from 'react'
import type { Macro, Settings, Step, StepType } from '../lib/types'
import { newId } from '../lib/types'
import { estimateDuration, type Problem } from '../lib/generator'
import { KeyCapture } from './KeyCapture'
import { StepRow, STEP_LABELS } from './StepRow'

interface Props {
  macro: Macro
  settings: Settings
  problems: Problem[]
  onChange: (m: Macro) => void
  onDuplicate: () => void
  onDelete: () => void
}

function blankStep(type: StepType): Step {
  const id = newId()
  switch (type) {
    case 'tap':
    case 'down':
    case 'up':
      return { id, type, key: 'q' }
    case 'wait':
      return { id, type, ms: 10 }
    case 'turn':
      return { id, type, degrees: 90, parts: 1, partDelayMs: 0 }
    case 'moveTo':
      return { id, type, x: 960, y: 540 }
    case 'block':
      return { id, type, target: 'all', on: true }
  }
}

const ADDABLE: StepType[] = ['tap', 'down', 'up', 'wait', 'turn', 'moveTo', 'block']

export function MacroEditor({ macro, settings, problems, onChange, onDuplicate, onDelete }: Props) {
  // 用 pointer 事件自己做拖曳，不靠 HTML5 drag & drop（桌面版的 WebView2 會攔截它）
  const listRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<{ from: number; at: number } | null>(null)
  const dragRef = useRef<{ from: number; at: number } | null>(null)
  const updateDrag = (d: { from: number; at: number } | null) => {
    dragRef.current = d
    setDrag(d)
  }
  /** 指標所在位置對應的插入點（0 = 第一步之前，n = 最後一步之後） */
  const insertionAt = (y: number) => {
    const slots = listRef.current?.querySelectorAll<HTMLElement>('.drop-slot') ?? []
    for (let i = 0; i < slots.length; i++) {
      const r = slots[i].getBoundingClientRect()
      if (y < r.top + r.height / 2) return i
    }
    return slots.length
  }

  const setSteps = (steps: Step[]) => onChange({ ...macro, steps })
  const updateStep = (i: number, s: Step) => setSteps(macro.steps.map((x, j) => (j === i ? s : x)))
  const moveStep = (from: number, to: number) => {
    if (to < 0 || to >= macro.steps.length || from === to) return
    const steps = [...macro.steps]
    const [s] = steps.splice(from, 1)
    steps.splice(to, 0, s)
    setSteps(steps)
  }
  const errorSteps = new Set(problems.filter((p) => p.level === 'error' && p.stepId).map((p) => p.stepId))

  return (
    <div className="macro-editor">
      <div className="macro-header">
        <input
          className="macro-name"
          value={macro.name}
          placeholder="巨集名稱"
          onChange={(e) => onChange({ ...macro, name: e.target.value })}
        />
        <div className="macro-meta">
          <label>
            觸發鍵
            <KeyCapture value={macro.hotkey} onChange={(hotkey) => onChange({ ...macro, hotkey })} />
          </label>
          <label className="check">
            <input type="checkbox" checked={macro.enabled} onChange={(e) => onChange({ ...macro, enabled: e.target.checked })} />
            啟用
          </label>
          <label className="check" title="勾選後，觸發鍵本身也會照常送進遊戲">
            <input type="checkbox" checked={macro.passThrough} onChange={(e) => onChange({ ...macro, passThrough: e.target.checked })} />
            按鍵穿透
          </label>
          <span className="spacer" />
          <button type="button" onClick={onDuplicate}>複製巨集</button>
          <button type="button" className="danger" onClick={onDelete}>刪除巨集</button>
        </div>
        <textarea
          className="macro-note"
          value={macro.note ?? ''}
          placeholder="備註"
          rows={2}
          onChange={(e) => onChange({ ...macro, note: e.target.value || undefined })}
        />
      </div>

      <div className="steps-toolbar">
        <span>新增步驟：</span>
        {ADDABLE.map((t) => (
          <button key={t} type="button" onClick={() => setSteps([...macro.steps, blankStep(t)])}>
            + {STEP_LABELS[t]}
          </button>
        ))}
        <span className="spacer" />
        <span className="hint">{macro.steps.length} 步 · {Math.round(estimateDuration(macro.steps))} ms</span>
      </div>

      <div className="steps-list" ref={listRef}>
        {macro.steps.length === 0 && <div className="empty">還沒有步驟</div>}
        {macro.steps.map((s, i) => (
          <div
            key={s.id}
            className={`drop-slot ${drag && drag.at === i && drag.at !== drag.from && drag.at !== drag.from + 1 ? 'drop-target' : ''} ${drag && i === macro.steps.length - 1 && drag.at === macro.steps.length && drag.from !== i ? 'drop-target-after' : ''}`}
          >
            <StepRow
              step={s}
              index={i}
              total={macro.steps.length}
              settings={settings}
              hasError={errorSteps.has(s.id)}
              dragging={drag?.from === i}
              onChange={(ns) => updateStep(i, ns)}
              onMove={(d) => moveStep(i, i + d)}
              onDuplicate={() => {
                const steps = [...macro.steps]
                steps.splice(i + 1, 0, { ...s, id: newId() })
                setSteps(steps)
              }}
              onDelete={() => setSteps(macro.steps.filter((_, j) => j !== i))}
              handleProps={{
                onPointerDown: (e) => {
                  if (e.button !== 0) return
                  e.preventDefault()
                  e.currentTarget.setPointerCapture(e.pointerId)
                  updateDrag({ from: i, at: i })
                },
                onPointerMove: (e) => {
                  const d = dragRef.current
                  if (!d) return
                  const at = insertionAt(e.clientY)
                  if (at !== d.at) updateDrag({ ...d, at })
                },
                onPointerUp: () => {
                  const d = dragRef.current
                  updateDrag(null)
                  if (!d) return
                  moveStep(d.from, d.at > d.from ? d.at - 1 : d.at)
                },
                onPointerCancel: () => updateDrag(null),
              }}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
