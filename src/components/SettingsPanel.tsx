import type { Settings } from '../lib/types'
import { ROBLOX_EXE } from '../lib/generator'
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
        <p className="hint">填你在 Roblox 設定裡的 Camera Sensitivity。改了靈敏度，所有轉視角步驟會自動換算。</p>
        <label>
          靈敏度 1 時轉 360° 的移動量
          <input type="number" min={1} value={settings.countsPer360}
            onChange={(e) => set('countsPer360', Number(e.target.value))} />
        </label>
        <p className="hint">預設 720。如果「轉 360°」實際上轉不到一圈或轉過頭，再調整這個數字校正。</p>
      </section>

      <section>
        <h3>快捷鍵</h3>
        <label>開／關所有巨集 <KeyCapture value={settings.toggleHotkey} onChange={(k) => set('toggleHotkey', k)} /></label>
        <label>結束巨集程式 <KeyCapture value={settings.exitHotkey} onChange={(k) => set('exitHotkey', k)} /></label>
        <label className="check">
          <input type="checkbox" checked={settings.robloxOnly} onChange={(e) => set('robloxOnly', e.target.checked)} />
          只在 Roblox 視窗（{ROBLOX_EXE}）在前景時觸發
        </label>
      </section>

      <section>
        <h3>AutoHotkey</h3>
        <label>
          AutoHotkey v2 執行檔路徑
          <input type="text" className="wide" placeholder="留空會自動尋找，例如 C:\Program Files\AutoHotkey\v2\AutoHotkey64.exe"
            value={settings.ahkPath} onChange={(e) => set('ahkPath', e.target.value)} />
        </label>
        <p className="hint">
          還沒安裝的話，到 <a href="https://www.autohotkey.com/" target="_blank" rel="noreferrer">autohotkey.com</a> 下載 v2 版（免費）。
        </p>
      </section>

      <section className="warning-box">
        <h3>使用風險</h3>
        <p>
          AHK 只是模擬鍵盤滑鼠，一般不會被 Roblox 反作弊當成外掛，但遊戲或社群規則仍可能禁止巨集或利用 bug，
          被檢舉可能遭到處罰。建議先看 TSB 的 Discord 規則，並在私人伺服器練習。
        </p>
      </section>
    </div>
  )
}
