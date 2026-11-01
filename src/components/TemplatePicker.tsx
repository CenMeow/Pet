import { useEffect, useState } from 'react'
import {
  TEMPLATES, TEMPLATE_GROUPS, defaultChoices, templateDescription, templateHotkey, templateName, visibleOptions,
  type Choices, type Template,
} from '../lib/templates'
import { keyLabel } from '../lib/keys'
import { Icon } from './ui'

interface Props {
  onPick: (t: Template, choices: Choices) => void
  onClose: () => void
}

function TemplateCard({ t, onPick }: { t: Template; onPick: (t: Template, choices: Choices) => void }) {
  const [choices, setChoices] = useState<Choices>(() => defaultChoices(t))
  const hotkey = templateHotkey(t, choices)
  return (
    <div className="template-card">
      <strong>{templateName(t, choices)}</strong>
      <span className="template-desc">{templateDescription(t, choices)}</span>
      {visibleOptions(t, choices).map((opt) => (
        <div key={opt.key} className="segmented sm" role="radiogroup" aria-label={opt.label}>
          {opt.choices.map((c) => (
            <button
              key={c.value}
              type="button"
              role="radio"
              aria-checked={choices[opt.key] === c.value}
              className={choices[opt.key] === c.value ? 'on' : ''}
              onClick={() => setChoices({ ...choices, [opt.key]: c.value })}
            >
              {c.label}
            </button>
          ))}
        </div>
      ))}
      <div className="template-foot">
        {hotkey && <span className="template-hotkey">觸發鍵 <kbd>{keyLabel(hotkey)}</kbd></span>}
        <span className="spacer" />
        <button type="button" className="primary" onClick={() => onPick(t, choices)}>
          <Icon name="plus" size={14} />新增
        </button>
      </div>
    </div>
  )
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
        {TEMPLATE_GROUPS.map((g) => (
          <section key={g} className="template-group">
            <h3>{g}</h3>
            <div className="template-grid">
              {TEMPLATES.filter((t) => t.group === g).map((t) => (
                <TemplateCard key={t.key} t={t} onPick={onPick} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
