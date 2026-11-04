// 復原／重做：記住巨集之前的樣子。連續快速的修改（例如打字、按住數字箭頭）算成同一步
import { useCallback, useState } from 'react'

export interface HistoryState<T> {
  past: T[]
  present: T
  future: T[]
  /** 上一次修改的時間；0 表示下一次修改一定是新的一步 */
  lastAt: number
}

/** 間隔小於這個毫秒數的修改併成同一步 */
export const MERGE_MS = 700
/** 最多記幾步 */
export const LIMIT = 100

export function startHistory<T>(present: T): HistoryState<T> {
  return { past: [], present, future: [], lastAt: 0 }
}

/** 內容完全一樣（例如重新取到同一個顏色）就不算修改，免得復原一次什麼都沒變 */
export function sameContent(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  const ka = Object.keys(a)
  const kb = Object.keys(b)
  if (ka.length !== kb.length) return false
  const ra = a as Record<string, unknown>
  const rb = b as Record<string, unknown>
  return ka.every((k) => Object.hasOwn(rb, k) && sameContent(ra[k], rb[k]))
}

export function record<T>(h: HistoryState<T>, next: T, now: number): HistoryState<T> {
  if (sameContent(next, h.present)) return h
  const merge = h.lastAt > 0 && now - h.lastAt < MERGE_MS && h.past.length > 0
  const past = merge ? h.past : [...h.past, h.present].slice(-LIMIT)
  return { past, present: next, future: [], lastAt: now }
}

export function undo<T>(h: HistoryState<T>): HistoryState<T> {
  if (h.past.length === 0) return h
  return { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future], lastAt: 0 }
}

export function redo<T>(h: HistoryState<T>): HistoryState<T> {
  if (h.future.length === 0) return h
  const [next, ...rest] = h.future
  return { past: [...h.past, h.present], present: next, future: rest, lastAt: 0 }
}

export function useHistory<T>(initial: T) {
  const [h, setH] = useState(() => startHistory(initial))
  const set = useCallback((next: T | ((prev: T) => T)) => {
    const now = Date.now()
    setH((cur) => record(cur, typeof next === 'function' ? (next as (prev: T) => T)(cur.present) : next, now))
  }, [])
  const doUndo = useCallback(() => setH(undo), [])
  const doRedo = useCallback(() => setH(redo), [])
  return {
    value: h.present,
    set,
    undo: doUndo,
    redo: doRedo,
    /** 復原／重做之後會變成的樣子；沒有就是 undefined */
    undoTarget: h.past.length > 0 ? h.past[h.past.length - 1] : undefined,
    redoTarget: h.future.length > 0 ? h.future[0] : undefined,
  }
}
