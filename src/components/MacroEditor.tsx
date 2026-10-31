import { useState } from 'react'
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
  }
}

const ADDABLE: StepType[] = ['tap', 'down', 'up', 'wait', 'turn', 'moveTo']

export function MacroEditor({ macro, settings, problems, onChange, onDuplicate, onDelete }: Props) {
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)

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
            觸發鍵照常輸入
          </label>
          <span className="spacer" />
          <button type="button" onClick={onDuplicate}>複製巨集</button>
          <button type="button" className="danger" onClick={onDelete}>刪除巨集</button>
        </div>
        <textarea
          className="macro-note"
          value={macro.note ?? ''}
          placeholder="備註（例如這招的用途、要先開 shift lock 等）"
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
        <span className="hint">共 {macro.steps.length} 步，約 {Math.round(estimateDuration(macro.steps))} 毫秒</span>
      </div>

      <div className="steps-list">
        {macro.steps.length === 0 && <div className="empty">還沒有步驟。用上面的按鈕新增，步驟會由上往下依序執行。</div>}
        {macro.steps.map((s, i) => (
          <div key={s.id} className={`drop-slot ${overIndex === i && dragIndex !== null && dragIndex !== i ? 'drop-target' : ''}`}>
            <StepRow
              step={s}
              index={i}
              total={macro.steps.length}
              settings={settings}
              hasError={errorSteps.has(s.id)}
              onChange={(ns) => updateStep(i, ns)}
              onMove={(d) => moveStep(i, i + d)}
              onDuplicate={() => {
                const steps = [...macro.steps]
                steps.splice(i + 1, 0, { ...s, id: newId() })
                setSteps(steps)
              }}
              onDelete={() => setSteps(macro.steps.filter((_, j) => j !== i))}
              dragProps={{
                draggable: true,
                onDragStart: (e) => {
                  setDragIndex(i)
                  e.dataTransfer.effectAllowed = 'move'
                },
                onDragOver: (e) => {
                  e.preventDefault()
                  setOverIndex(i)
                },
                onDrop: (e) => {
                  e.preventDefault()
                  if (dragIndex !== null) moveStep(dragIndex, i)
                  setDragIndex(null)
                  setOverIndex(null)
                },
                onDragEnd: () => {
                  setDragIndex(null)
                  setOverIndex(null)
                },
              }}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
