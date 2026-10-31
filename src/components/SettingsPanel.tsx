import { useEffect, useState, type ReactNode } from 'react'
import type { Settings } from '../lib/types'
import { ACCENTS, type Appearance } from '../lib/appearance'
import { detectAhk, isTauri, openUrl, pickExe } from '../lib/native'
import { KeyCapture } from './KeyCapture'
import { Icon, Segmented, Switch, type IconName } from './ui'

const AHK_SITE = 'https://www.autohotkey.com/'

interface Props {
  settings: Settings
  onChange: (s: Settings) => void
  appearance: Appearance
  onAppearanceChange: (a: Appearance) => void
}

function Section({ icon, title, children }: { icon: IconName; title: string; children: ReactNode }) {
  return (
    <section className="card settings-section">
      <h3><Icon name={icon} />{title}</h3>
      <div className="form">{children}</div>
    </section>
  )
}

function Row({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="form-row">
      <div className="form-label">{label}</div>
      <div className="form-control">{children}</div>
    </div>
  )
}

export function SettingsPanel({ settings, onChange, appearance, onAppearanceChange }: Props) {
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => onChange({ ...settings, [k]: v })
  const look = <K extends keyof Appearance>(k: K, v: Appearance[K]) => onAppearanceChange({ ...appearance, [k]: v })
  const custom = !ACCENTS.some((a) => a.value.toLowerCase() === appearance.accent.toLowerCase())

  // 偵測 AutoHotkey 裝在哪
  const [ahk, setAhk] = useState<{ ok: boolean; text: string } | null>(null)
  useEffect(() => {
    if (!isTauri) return
    let alive = true
    const t = window.setTimeout(() => {
      detectAhk(settings.ahkPath)
        .then((p) => alive && setAhk({ ok: true, text: p }))
        .catch((e) => alive && setAhk({ ok: false, text: e instanceof Error ? e.message : String(e) }))
    }, 300)
    return () => {
      alive = false
      window.clearTimeout(t)
    }
  }, [settings.ahkPath])

  return (
    <div className="page settings-panel">
      <h2 className="page-title">設定</h2>

      <Section icon="palette" title="外觀">
        <Row label="主題">
          <Segmented
            value={appearance.theme}
            onChange={(v) => look('theme', v)}
            options={[
              { value: 'dark', label: '深色', icon: 'moon' },
              { value: 'light', label: '淺色', icon: 'sun' },
              { value: 'system', label: '跟隨系統', icon: 'monitor' },
            ]}
          />
        </Row>
        <Row label="主題色">
          <div className="swatches">
            {ACCENTS.map((a) => (
              <button
                key={a.value}
                type="button"
                className={`swatch ${a.value.toLowerCase() === appearance.accent.toLowerCase() ? 'on' : ''}`}
                style={{ background: a.value }}
                title={a.name}
                aria-label={a.name}
                onClick={() => look('accent', a.value)}
              />
            ))}
            <label className={`swatch custom ${custom ? 'on' : ''}`} title="自訂" style={custom ? { background: appearance.accent } : undefined}>
              <input type="color" value={appearance.accent} onChange={(e) => look('accent', e.target.value)} />
              {!custom && <Icon name="plus" size={14} />}
            </label>
          </div>
        </Row>
        <Row label="介面大小">
          <Segmented
            value={appearance.size}
            onChange={(v) => look('size', v)}
            options={[
              { value: 'sm', label: '小' },
              { value: 'md', label: '中' },
              { value: 'lg', label: '大' },
            ]}
          />
        </Row>
      </Section>

      <Section icon="crosshair" title="轉視角">
        <Row label="自動讀取 Roblox 靈敏度">
          <Switch checked={settings.autoSensitivity} onChange={(v) => set('autoSensitivity', v)} />
        </Row>
        <Row label={<>靈敏度<span className="sub">讀不到時用</span></>}>
          <input type="number" step={0.01} min={0.01} value={settings.sensitivity}
            onChange={(e) => set('sensitivity', Number(e.target.value))} />
        </Row>
        <Row label={<>360° 移動量<span className="sub">校正用</span></>}>
          <input type="number" min={1} value={settings.countsPer360}
            onChange={(e) => set('countsPer360', Number(e.target.value))} />
        </Row>
      </Section>

      <Section icon="keyboard" title="快捷鍵">
        <Row label="開／關所有巨集">
          <KeyCapture value={settings.toggleHotkey} onChange={(k) => set('toggleHotkey', k)} />
        </Row>
        <Row label="結束巨集程式">
          <KeyCapture value={settings.exitHotkey} onChange={(k) => set('exitHotkey', k)} />
        </Row>
        <Row label="只在 Roblox 視窗觸發">
          <Switch checked={settings.robloxOnly} onChange={(v) => set('robloxOnly', v)} />
        </Row>
      </Section>

      <Section icon="terminal" title="AutoHotkey">
        {ahk && (
          <Row label="狀態">
            <span className={`status-chip ${ahk.ok ? 'ok' : 'bad'}`} title={ahk.text}>
              <Icon name={ahk.ok ? 'checkCircle' : 'alert'} size={14} />
              {ahk.ok ? '已找到' : '找不到 AutoHotkey v2'}
            </span>
            {ahk.ok && <span className="path-text" title={ahk.text}>{ahk.text}</span>}
          </Row>
        )}
        <Row label="執行檔路徑">
          <input type="text" className="grow" placeholder="留空自動尋找"
            value={settings.ahkPath} onChange={(e) => set('ahkPath', e.target.value)} />
          {isTauri && (
            <button type="button" onClick={() => pickExe().then((p) => p && set('ahkPath', p))}>
              <Icon name="folder" />瀏覽
            </button>
          )}
        </Row>
        <Row label="官網">
          <button type="button" className="link-btn" onClick={() => openUrl(AHK_SITE)}>
            autohotkey.com<Icon name="link" size={13} />
          </button>
        </Row>
      </Section>
    </div>
  )
}
