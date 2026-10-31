import type { Settings } from '../lib/types'
import { KeyCapture } from './KeyCapture'

interface Props {
  settings: Settings
  onChange: (s: Settings) => void
}

export function SettingsPanel({ settings, onChange }: Props) {
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => onChange({ ...settings, [k]: v })
  return (
    <div className="settings-panel">
      <h2>設定</h2>

      <section>
        <h3>轉視角</h3>
        <label>
          Roblox 滑鼠靈敏度
          <input type="number" step={0.01} min={0.01} value={settings.sensitivity}
            onChange={(e) => set('sensitivity', Number(e.target.value))} />
        </label>
        <label>
          360° 移動量（校正用）
          <input type="number" min={1} value={settings.countsPer360}
            onChange={(e) => set('countsPer360', Number(e.target.value))} />
        </label>
      </section>

      <section>
        <h3>快捷鍵</h3>
        <label>開／關所有巨集 <KeyCapture value={settings.toggleHotkey} onChange={(k) => set('toggleHotkey', k)} /></label>
        <label>結束巨集程式 <KeyCapture value={settings.exitHotkey} onChange={(k) => set('exitHotkey', k)} /></label>
        <label className="check">
          <input type="checkbox" checked={settings.robloxOnly} onChange={(e) => set('robloxOnly', e.target.checked)} />
          只在 Roblox 視窗觸發
        </label>
      </section>

      <section>
        <h3>AutoHotkey</h3>
        <label>
          AutoHotkey v2 執行檔路徑
          <input type="text" className="wide" placeholder="留空自動尋找"
            value={settings.ahkPath} onChange={(e) => set('ahkPath', e.target.value)} />
        </label>
      </section>
    </div>
  )
}
