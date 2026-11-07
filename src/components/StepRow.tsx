import { useEffect, useRef, useState, type HTMLAttributes, type ReactNode } from 'react'
import type { BlockTarget, ColorPoint, Settings, Step, TabTarget } from '../lib/types'
import { KeyCapture } from './KeyCapture'
import { Icon, type IconName } from './ui'
import { cancelPick, pickPixel, type PickedPixel } from '../lib/native'

export const STEP_LABELS: Record<Step['type'], string> = {
  tap: '按一下',
  down: '按住',
  up: '放開',
  wait: '等待',
  turn: '轉視角',
  moveTo: '滑鼠移到',
  block: '封鎖輸入',
  waitColor: '等顏色',
  tab: 'Tab',
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
      style={{ width: `${width / 14}rem` }}
      onChange={(e) => onChange(e.target.value === '' ? NaN : Number(e.target.value))}
    />
  )
}

/** 取色／取位置：切到遊戲，滑鼠移到要的地方按 F8 */
function PickButton({ label, onPicked, icon = 'pipette', hint = '' }: {
  label: string; onPicked: (p: PickedPixel) => void; icon?: IconName; hint?: string
}) {
  const [waiting, setWaiting] = useState(false)
  const [error, setError] = useState('')
  // 取色要等使用者操作，完成時用最新的 onPicked，才不會蓋掉期間的其他修改
  const latest = useRef(onPicked)
  const waitingRef = useRef(false)
  useEffect(() => {
    latest.current = onPicked
  }, [onPicked])
  useEffect(() => () => {
    if (waitingRef.current) cancelPick()
  }, [])

  const click = () => {
    if (waiting) {
      cancelPick()
      return
    }
    setError('')
    setWaiting(true)
    waitingRef.current = true
    pickPixel()
      .then((p) => p && latest.current(p))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => {
        waitingRef.current = false
        setWaiting(false)
      })
  }

  return (
    <>
      <button
        type="button"
        className={`pick-btn ${waiting ? 'picking' : ''}`}
        onClick={click}
        title={waiting ? '再按一次取消' : `${hint}切到遊戲，滑鼠移到要的地方按 F8（Esc 取消）`}
      >
        <Icon name={icon} size={14} />
        {waiting ? '到遊戲按 F8…' : label}
      </button>
      {error && <span className="pick-error">{error}</span>}
    </>
  )
}

/** 顏色方塊，點一下可以手動選顏色 */
function ColorChip({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  return (
    <label className="color-chip" title="點一下可以手動選顏色">
      <input
        type="color"
        value={/^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : '#ffffff'}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
      />
      <span className="color-dot" style={{ background: value }} />
      <span className="color-hex">{value}</span>
    </label>
  )
}

export function StepRow({ step, index, total, hasError, onChange, onMove, onDuplicate, onDelete, handleProps, dragging }: Props) {
  let body: ReactNode
  switch (step.type) {
    case 'tap':
      body = (
        <>
          <KeyCapture value={step.key} onChange={(key) => onChange({ ...step, key })} />
          <span className="unit">按住</span>
          <NumberField value={step.holdMs ?? 0} min={0} width={60} onChange={(holdMs) => onChange({ ...step, holdMs })} />
          <span className="unit">毫秒</span>
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
          {Number.isFinite(step.ms) && <span className="hint">{(step.ms / FRAME_MS).toFixed(1)} 格</span>}
        </>
      )
      break
    case 'turn':
      body = (
        <>
          <select value={step.degrees < 0 ? 'left' : 'right'} onChange={(e) => {
            const abs = Math.abs(step.degrees)
            onChange({ ...step, degrees: e.target.value === 'left' ? -abs : abs })
          }}>
            <option value="left">向左</option>
            <option value="right">向右</option>
          </select>
          <NumberField value={Math.abs(step.degrees)} min={0} onChange={(n) => onChange({ ...step, degrees: step.degrees < 0 ? -Math.abs(n) : Math.abs(n) })} />
          <span className="unit">度</span>
          <span className="unit">分</span>
          <NumberField value={step.parts} min={1} width={50} onChange={(parts) => onChange({ ...step, parts })} />
          <span className="unit">段，間隔</span>
          <NumberField value={step.partDelayMs} min={0} width={55} onChange={(partDelayMs) => onChange({ ...step, partDelayMs })} />
          <span className="unit">毫秒</span>
        </>
      )
      break
    case 'block':
      body = (
        <>
          <select value={step.on ? 'on' : 'off'} onChange={(e) => onChange({ ...step, on: e.target.value === 'on' })}>
            <option value="on">開始</option>
            <option value="off">解除</option>
          </select>
          <select value={step.target} onChange={(e) => onChange({ ...step, target: e.target.value as BlockTarget })}>
            <option value="all">全部</option>
            <option value="keyboard">鍵盤</option>
            <option value="mouse">滑鼠</option>
          </select>
        </>
      )
      break
    case 'tab':
      body = (
        <>
          <select value={step.target} onChange={(e) => onChange({ ...step, target: e.target.value as TabTarget })}>
            <option value="title">正上・左鍵按標題列</option>
            <option value="minimize">右上・右鍵按最小化</option>
          </select>
          <span className="unit">按住</span>
          <NumberField value={step.holdMs} min={0} onChange={(holdMs) => onChange({ ...step, holdMs })} />
          <span className="unit">毫秒</span>
          <span className="hint" title="Roblox 是全螢幕時會先按 F11 退出，按完游標回到畫面正中間">全螢幕會自動 F11</span>
        </>
      )
      break
    case 'waitColor': {
      // 可以有好幾個點，任一個對了就通過
      const setPoint = (i: number, p: ColorPoint) => onChange({ ...step, points: step.points.map((q, j) => (j === i ? p : q)) })
      body = (
        <>
          {step.points.map((p, i) => (
            <div className="line" key={i}>
              <PickButton label="取色" onPicked={(q) => setPoint(i, { x: q.x, y: q.y, color: q.color })} />
              <span className="unit">X</span>
              <NumberField value={p.x} onChange={(x) => setPoint(i, { ...p, x })} />
              <span className="unit">Y</span>
              <NumberField value={p.y} onChange={(y) => setPoint(i, { ...p, y })} />
              <ColorChip value={p.color} onChange={(color) => setPoint(i, { ...p, color })} />
              {step.points.length > 1 && (
                <button type="button" className="ghost icon-only point-remove" title="刪掉這個顏色" onClick={() => onChange({ ...step, points: step.points.filter((_, j) => j !== i) })}>
                  <Icon name="x" size={14} />
                </button>
              )}
              {i === 0 && step.points.length > 1 && <span className="hint">任一個對就通過</span>}
            </div>
          ))}
          <div className="line">
            <PickButton
              label="加顏色"
              icon="plus"
              hint="再加一個顏色，任一個對就通過。"
              onPicked={(q) => onChange({ ...step, points: [...step.points, { x: q.x, y: q.y, color: q.color }] })}
            />
            <span className="unit">誤差</span>
            <NumberField value={step.tolerance} min={0} width={50} onChange={(tolerance) => onChange({ ...step, tolerance })} />
            <span className="unit">最多等</span>
            <NumberField value={step.timeoutMs} min={1} width={65} onChange={(timeoutMs) => onChange({ ...step, timeoutMs })} />
            <span className="unit">毫秒</span>
            <select value={step.stopOnTimeout ? 'stop' : 'go'} onChange={(e) => onChange({ ...step, stopOnTimeout: e.target.value === 'stop' })}>
              <option value="stop">沒等到就停止</option>
              <option value="go">沒等到也繼續</option>
            </select>
          </div>
        </>
      )
      break
    }
    case 'moveTo':
      body = (
        <>
          <PickButton label="取位置" onPicked={(p) => onChange({ ...step, x: p.x, y: p.y })} />
          <span className="unit">X</span>
          <NumberField value={step.x} onChange={(x) => onChange({ ...step, x })} />
          <span className="unit">Y</span>
          <NumberField value={step.y} onChange={(y) => onChange({ ...step, y })} />
        </>
      )
      break
  }

  return (
    <div className={`step-row type-${step.type} ${hasError ? 'has-error' : ''} ${dragging ? 'dragging' : ''}`}>
      <span className="drag-handle" title="按住拖曳排序" {...handleProps}><Icon name="grip" size={15} /></span>
      <span className="step-index">{index + 1}</span>
      <span className={`step-badge badge-${step.type}`}>{STEP_LABELS[step.type]}</span>
      <div className="step-body">{body}</div>
      <div className="step-actions">
        <button type="button" className="ghost icon-only" disabled={index === 0} onClick={() => onMove(-1)} title="上移"><Icon name="up" /></button>
        <button type="button" className="ghost icon-only" disabled={index === total - 1} onClick={() => onMove(1)} title="下移"><Icon name="down" /></button>
        <button type="button" className="ghost icon-only" onClick={onDuplicate} title="複製這一步"><Icon name="copy" size={14} /></button>
        <button type="button" className="ghost icon-only danger" onClick={onDelete} title="刪除"><Icon name="trash" size={14} /></button>
      </div>
    </div>
  )
}
