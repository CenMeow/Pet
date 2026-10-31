import type { HTMLAttributes, ReactNode } from 'react'
import type { BlockTarget, Settings, Step } from '../lib/types'
import { turnCounts } from '../lib/generator'
import { KeyCapture } from './KeyCapture'

export const STEP_LABELS: Record<Step['type'], string> = {
  tap: '按一下',
  down: '按住',
  up: '放開',
  wait: '等待',
  turn: '轉視角',
  moveTo: '滑鼠移到',
  block: '封鎖輸入',
}

const FRAME_MS = 1000 / 60

interface Props {
  step: Step
  index: number
  total: number
  settings: Settings
  hasError: boolean
  onChange: (s: Step) => void
  onMove: (delta: number) => void
  onDuplicate: () => void
  onDelete: () => void
  handleProps: HTMLAttributes<HTMLSpanElement>
  dragging: boolean
}

function NumberField({ value, onChange, step = 1, min, width = 70 }: {
  value: number; onChange: (n: number) => void; step?: number; min?: number; width?: number
}) {
  return (
    <input
      type="number"
      value={Number.isFinite(value) ? value : ''}
      step={step}
      min={min}
      style={{ width }}
      onChange={(e) => onChange(e.target.value === '' ? NaN : Number(e.target.value))}
    />
  )
}

export function StepRow({ step, index, total, settings, hasError, onChange, onMove, onDuplicate, onDelete, handleProps, dragging }: Props) {
  let body: ReactNode
  switch (step.type) {
    case 'tap':
      body = (
        <>
          <KeyCapture value={step.key} onChange={(key) => onChange({ ...step, key })} />
          <span className="unit">按住</span>
          <NumberField value={step.holdMs ?? 0} min={0} width={60} onChange={(holdMs) => onChange({ ...step, holdMs })} />
          <span className="unit">毫秒</span>
          <span className="hint">0 = 一按就放</span>
        </>
      )
      break
    case 'down':
    case 'up':
      body = <KeyCapture value={step.key} onChange={(key) => onChange({ ...step, key })} />
      break
    case 'wait':
      body = (
        <>
          <NumberField value={step.ms} min={0} onChange={(ms) => onChange({ ...step, ms })} />
          <span className="unit">毫秒</span>
          <span className="hint">≈ {(step.ms / FRAME_MS).toFixed(1)} 格（60 FPS）</span>
        </>
      )
      break
    case 'turn':
      body = (
        <>
          <NumberField value={step.degrees} onChange={(degrees) => onChange({ ...step, degrees })} />
          <span className="unit">度（正數向右）</span>
          <span className="unit">分</span>
          <NumberField value={step.parts} min={1} width={50} onChange={(parts) => onChange({ ...step, parts })} />
          <span className="unit">段，每段間隔</span>
          <NumberField value={step.partDelayMs} min={0} width={55} onChange={(partDelayMs) => onChange({ ...step, partDelayMs })} />
          <span className="unit">毫秒</span>
          <span className="hint">= 移動 {Number.isFinite(step.degrees) && settings.sensitivity > 0 ? turnCounts(step.degrees, settings) : '?'}</span>
        </>
      )
      break
    case 'block':
      body = (
        <>
          <select value={step.on ? 'on' : 'off'} onChange={(e) => onChange({ ...step, on: e.target.value === 'on' })}>
            <option value="on">開始封鎖</option>
            <option value="off">解除封鎖</option>
          </select>
          <select value={step.target} onChange={(e) => onChange({ ...step, target: e.target.value as BlockTarget })}>
            <option value="all">全部（鍵盤＋滑鼠）</option>
            <option value="keyboard">鍵盤</option>
            <option value="mouse">滑鼠</option>
          </select>
          <span className="hint">只擋你自己的輸入，巨集送出的照常；巨集結束會自動解除</span>
        </>
      )
      break
    case 'moveTo':
      body = (
        <>
          <span className="unit">X</span>
          <NumberField value={step.x} onChange={(x) => onChange({ ...step, x })} />
          <span className="unit">Y</span>
          <NumberField value={step.y} onChange={(y) => onChange({ ...step, y })} />
          <span className="hint">螢幕座標，解析度不同會失準</span>
        </>
      )
      break
  }

  return (
    <div className={`step-row type-${step.type} ${hasError ? 'has-error' : ''} ${dragging ? 'dragging' : ''}`}>
      <span className="drag-handle" title="按住拖曳排序" {...handleProps}>⋮⋮</span>
      <span className="step-index">{index + 1}</span>
      <span className={`step-badge badge-${step.type}`}>{STEP_LABELS[step.type]}</span>
      <div className="step-body">{body}</div>
      <div className="step-actions">
        <button type="button" disabled={index === 0} onClick={() => onMove(-1)} title="上移">↑</button>
        <button type="button" disabled={index === total - 1} onClick={() => onMove(1)} title="下移">↓</button>
        <button type="button" onClick={onDuplicate} title="複製這一步">⧉</button>
        <button type="button" className="danger" onClick={onDelete} title="刪除">✕</button>
      </div>
    </div>
  )
}
