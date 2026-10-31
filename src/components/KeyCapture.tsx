import { useEffect, useRef, useState } from 'react'
import { keyFromCode, keyFromMouseButton, keyLabel } from '../lib/keys'

interface Props {
  value: string
  onChange: (key: string) => void
  title?: string
}

/** 點一下後按任意鍵盤鍵或滑鼠鍵，就會記錄成 AHK 按鍵名稱。Esc 取消。 */
export function KeyCapture({ value, onChange, title }: Props) {
  const [capturing, setCapturing] = useState(false)
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    if (!capturing) return
    const done = (key: string | null) => {
      if (key) onChangeRef.current(key)
      setCapturing(false)
    }
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.code === 'Escape') return done(null)
      done(keyFromCode(e.code))
    }
    const onMouse = (e: MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      done(keyFromMouseButton(e.button))
    }
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      done(e.deltaY < 0 ? 'WheelUp' : 'WheelDown')
    }
    const noMenu = (e: Event) => e.preventDefault()
    // effect 在這次點擊完全結束後才執行，所以不會把「點按鈕」本身記成左鍵
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('mousedown', onMouse, true)
    window.addEventListener('wheel', onWheel, { capture: true, passive: false })
    window.addEventListener('contextmenu', noMenu, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('mousedown', onMouse, true)
      window.removeEventListener('wheel', onWheel, true)
      window.removeEventListener('contextmenu', noMenu, true)
    }
  }, [capturing])

  return (
    <button
      type="button"
      className={`key-capture ${capturing ? 'capturing' : ''}`}
      onClick={() => setCapturing(true)}
      title={title ?? '點一下，再按你要的鍵（Esc 取消）'}
    >
      {capturing ? '請按鍵…' : value ? keyLabel(value) : '未設定'}
    </button>
  )
}
