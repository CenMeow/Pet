import { TEMPLATES, type Template } from '../lib/templates'

interface Props {
  onPick: (t: Template) => void
  onClose: () => void
}

export function TemplatePicker({ onPick, onClose }: Props) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>新增巨集</h2>
          <button type="button" onClick={onClose}>關閉</button>
        </div>
        <div className="template-grid">
          {TEMPLATES.map((t) => (
            <button key={t.key} type="button" className="template-card" onClick={() => onPick(t)}>
              <strong>{t.name}</strong>
              <span className="template-hotkey">預設觸發鍵：{t.hotkey}</span>
              <span>{t.description}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
