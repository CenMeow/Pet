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
          <h2>從範本新增巨集</h2>
          <button type="button" onClick={onClose}>關閉</button>
        </div>
        <p className="hint">時間數值是起點，實際要依你的 FPS 和延遲微調。</p>
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
