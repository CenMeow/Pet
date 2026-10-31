import { useEffect } from 'react'
import { TEMPLATES, type Template } from '../lib/templates'
import { keyLabel } from '../lib/keys'
import { Icon } from './ui'

interface Props {
  onPick: (t: Template) => void
  onClose: () => void
}

export function TemplatePicker({ onPick, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>新增巨集</h2>
          <button type="button" className="ghost icon-only" onClick={onClose} title="關閉"><Icon name="x" size={18} /></button>
        </div>
        <div className="template-grid">
          {TEMPLATES.map((t) => (
            <button key={t.key} type="button" className="template-card" onClick={() => onPick(t)}>
              <strong>{t.name}</strong>
              <span className="template-desc">{t.description}</span>
              {t.hotkey && <span className="template-hotkey">觸發鍵 <kbd>{keyLabel(t.hotkey)}</kbd></span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
