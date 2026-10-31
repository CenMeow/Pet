import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Macro, Settings } from './lib/types'
import { newId } from './lib/types'
import { generate } from './lib/generator'
import { keyLabel } from './lib/keys'
import { macroFromTemplate } from './lib/templates'
import { parseMgp } from './lib/mgp'
import { parseAhk } from './lib/ahkImport'
import { loadLibrary, parseLibraryJson, saveLibrary, serializeLibrary } from './lib/storage'
import { checkUpdate, installUpdate, isScriptRunning, isTauri, openTextFile, runScript, saveTextFile, setWindowTheme, stopScript } from './lib/native'
import { applyAppearance, loadAppearance, saveAppearance, type Appearance } from './lib/appearance'
import type { Update } from '@tauri-apps/plugin-updater'
import { MacroEditor } from './components/MacroEditor'
import { SettingsPanel } from './components/SettingsPanel'
import { TemplatePicker } from './components/TemplatePicker'
import { Icon, Switch } from './components/ui'
import './App.css'

type Toast = { kind: 'info' | 'error'; text: string } | null

export default function App() {
  const initial = useMemo(() => loadLibrary(), [])
  const [settings, setSettings] = useState<Settings>(initial.settings)
  const [macros, setMacros] = useState<Macro[]>(initial.macros)
  const [selectedId, setSelectedId] = useState<string | null>(initial.macros[0]?.id ?? null)
  const [view, setView] = useState<'macro' | 'settings'>('macro')
  const [showTemplates, setShowTemplates] = useState(false)
  const [showScript, setShowScript] = useState(false)
  const [running, setRunning] = useState(false)
  const [toast, setToast] = useState<Toast>(null)
  const [update, setUpdate] = useState<Update | null>(null)
  const [updating, setUpdating] = useState(false)
  const [appearance, setAppearance] = useState<Appearance>(loadAppearance)

  useEffect(() => {
    saveAppearance(appearance)
    applyAppearance(appearance)
    setWindowTheme(appearance.theme === 'system' ? null : appearance.theme)
    if (appearance.theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: light)')
    const onChange = () => applyAppearance(appearance)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [appearance])

  useEffect(() => {
    checkUpdate().then(setUpdate)
  }, [])

  const handleUpdate = async () => {
    if (!update) return
    setUpdating(true)
    try {
      await installUpdate(update)
    } catch (e) {
      setUpdating(false)
      setToast({ kind: 'error', text: `更新失敗：${e instanceof Error ? e.message : String(e)}` })
    }
  }

  useEffect(() => saveLibrary(settings, macros), [settings, macros])

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), toast.kind === 'error' ? 7000 : 3500)
    return () => window.clearTimeout(t)
  }, [toast])

  useEffect(() => {
    if (!isTauri) return
    const t = window.setInterval(() => {
      isScriptRunning().then(setRunning).catch(() => setRunning(false))
    }, 2000)
    return () => window.clearInterval(t)
  }, [])

  const { script, problems } = useMemo(() => generate(macros, settings), [macros, settings])
  const errors = problems.filter((p) => p.level === 'error')
  const selected = macros.find((m) => m.id === selectedId) ?? null

  const updateMacro = useCallback((m: Macro) => setMacros((ms) => ms.map((x) => (x.id === m.id ? m : x))), [])

  const addMacros = (added: Macro[]) => {
    if (added.length === 0) return
    // 觸發鍵和已啟用的巨集衝突時，新加的先停用，避免整份腳本無法產生
    const used = new Set([settings.toggleHotkey, settings.exitHotkey, ...macros.filter((m) => m.enabled).map((m) => m.hotkey)].map((k) => k.toLowerCase()))
    let disabled = 0
    added = added.map((m) => {
      const key = m.hotkey.toLowerCase()
      if (m.enabled && used.has(key)) {
        disabled += 1
        return { ...m, enabled: false }
      }
      used.add(key)
      return m
    })
    if (disabled > 0) setToast({ kind: 'info', text: '新巨集的觸發鍵已被使用，先幫你停用了，換一個觸發鍵後再勾選啟用' })
    setMacros((ms) => [...ms, ...added])
    setSelectedId(added[0].id)
    setView('macro')
  }

  const fail = (e: unknown) => setToast({ kind: 'error', text: e instanceof Error ? e.message : String(e) })

  const handleRun = async () => {
    if (errors.length > 0) {
      setToast({ kind: 'error', text: `還有 ${errors.length} 個問題要先修正` })
      return
    }
    try {
      const msg = await runScript(script, settings.ahkPath)
      setRunning(true)
      setToast({ kind: 'info', text: msg })
    } catch (e) {
      fail(e)
    }
  }

  const handleStop = async () => {
    try {
      await stopScript()
      setRunning(false)
      setToast({ kind: 'info', text: '巨集已停止' })
    } catch (e) {
      fail(e)
    }
  }

  const handleImport = async () => {
    try {
      const file = await openTextFile(['ahk', 'mgp', 'json'], '巨集檔')
      if (!file) return
      const lower = file.name.toLowerCase()
      if (lower.endsWith('.mgp') || lower.endsWith('.ahk')) {
        const { macros: imported, warnings } = lower.endsWith('.ahk')
          ? parseAhk(file.text, settings, file.name)
          : parseMgp(file.text, file.name)
        addMacros(imported)
        setToast({
          kind: warnings.length ? 'error' : 'info',
          text: `匯入 ${imported.length} 個巨集${warnings.length ? `；${warnings.slice(0, 5).join('；')}${warnings.length > 5 ? `…等 ${warnings.length} 項` : ''}` : ''}`,
        })
      } else {
        const parsed = parseLibraryJson(file.text)
        addMacros(parsed.macros)
        setToast({ kind: 'info', text: `匯入 ${parsed.macros.length} 個巨集` })
      }
    } catch (e) {
      fail(e)
    }
  }

  const handleExportJson = async () => {
    try {
      const path = await saveTextFile(serializeLibrary(settings, macros), 'tsb-macros.json', 'json', '巨集庫')
      if (path) setToast({ kind: 'info', text: `已匯出到 ${path}` })
    } catch (e) {
      fail(e)
    }
  }

  const handleExportAhk = async () => {
    if (errors.length > 0) {
      setToast({ kind: 'error', text: `還有 ${errors.length} 個問題要先修正` })
      return
    }
    try {
      const path = await saveTextFile(script, 'tsb-macros.ahk', 'ahk', 'AutoHotkey 腳本')
      if (path) setToast({ kind: 'info', text: `已匯出到 ${path}` })
    } catch (e) {
      fail(e)
    }
  }

  const deleteMacro = (id: string) => {
    const m = macros.find((x) => x.id === id)
    if (!m || !window.confirm(`確定刪除「${m.name}」？`)) return
    const rest = macros.filter((x) => x.id !== id)
    setMacros(rest)
    setSelectedId(rest[0]?.id ?? null)
  }

  const duplicateMacro = (m: Macro) => {
    const copy: Macro = { ...m, id: newId('m'), name: `${m.name}（複製）`, enabled: false, steps: m.steps.map((s) => ({ ...s, id: newId() })) }
    addMacros([copy])
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark"><Icon name="zap" size={15} /></span>
          <h1>TSB 巨屌編輯器</h1>
        </div>
        <div className={`run-status ${running ? 'on' : ''}`}>
          <span className="dot" />
          {running ? (
            <>執行中<span className="run-keys"><kbd>{keyLabel(settings.toggleHotkey)}</kbd> 開關 <kbd>{keyLabel(settings.exitHotkey)}</kbd> 結束</span></>
          ) : '未執行'}
        </div>
        <span className="spacer" />
        {update && (
          <button type="button" className="update" onClick={handleUpdate} disabled={updating}>
            <Icon name="sparkle" />{updating ? '更新中…' : `更新到 ${update.version}`}
          </button>
        )}
        <button type="button" className={`ghost ${showScript ? 'pressed' : ''}`} onClick={() => setShowScript((v) => !v)} title="查看產生的腳本">
          <Icon name="code" /><span className="btn-text">腳本</span>
        </button>
        <button type="button" className="ghost" onClick={handleExportAhk} title="存成 .ahk 檔">
          <Icon name="file" /><span className="btn-text">匯出 .ahk</span>
        </button>
        <span className="divider" />
        {running && (
          <button type="button" className="stop" onClick={handleStop}>
            <Icon name="stop" size={14} />停止
          </button>
        )}
        <button type="button" className="primary run" onClick={handleRun} disabled={errors.length > 0}>
          {running ? <><Icon name="refresh" />套用變更</> : <><Icon name="play" size={14} />執行</>}
        </button>
      </header>

      <div className="main">
        <aside className="sidebar">
          <div className="sidebar-top">
            <button type="button" className="primary block" onClick={() => setShowTemplates(true)}>
              <Icon name="plus" />新增巨集
            </button>
            <div className="sidebar-io">
              <button type="button" className="ghost" onClick={handleImport} title="支援 .ahk、.mgp、.json">
                <Icon name="import" />匯入
              </button>
              <button type="button" className="ghost" onClick={handleExportJson} title="所有巨集存成 .json">
                <Icon name="export" />匯出
              </button>
            </div>
          </div>
          <div className="sidebar-label">巨集<span className="count">{macros.length}</span></div>
          <ul className="macro-list">
            {macros.map((m) => {
              const hasError = errors.some((p) => p.macroId === m.id)
              return (
                <li
                  key={m.id}
                  className={`${m.id === selectedId && view === 'macro' ? 'active' : ''} ${m.enabled ? '' : 'disabled'}`}
                  onClick={() => { setSelectedId(m.id); setView('macro') }}
                >
                  <Switch small checked={m.enabled} title="啟用／停用" onChange={(enabled) => updateMacro({ ...m, enabled })} />
                  <span className="macro-list-name">{hasError && <span className="err-dot" title="有問題">!</span>}{m.name || '(未命名)'}</span>
                  <kbd>{m.hotkey ? keyLabel(m.hotkey) : '—'}</kbd>
                </li>
              )
            })}
            {macros.length === 0 && <li className="list-empty">還沒有巨集</li>}
          </ul>
          <button type="button" className={`nav-item ${view === 'settings' ? 'active' : ''}`} onClick={() => setView('settings')}>
            <Icon name="settings" />設定
          </button>
        </aside>

        <main className="content">
          {view === 'settings' ? (
            <SettingsPanel settings={settings} onChange={setSettings} appearance={appearance} onAppearanceChange={setAppearance} />
          ) : selected ? (
            <MacroEditor
              key={selected.id}
              macro={selected}
              settings={settings}
              problems={problems.filter((p) => p.macroId === selected.id)}
              onChange={updateMacro}
              onDuplicate={() => duplicateMacro(selected)}
              onDelete={() => deleteMacro(selected.id)}
            />
          ) : (
            <div className="empty-state">
              <Icon name="zap" size={28} />
              <p>還沒有巨集</p>
              <button type="button" className="primary" onClick={() => setShowTemplates(true)}><Icon name="plus" />新增巨集</button>
            </div>
          )}

          {problems.length > 0 && (
            <div className="page problems">
              {problems.map((p, i) => (
                <div key={i} className={`problem ${p.level}`}>
                  <Icon name={p.level === 'error' ? 'alert' : 'warn'} size={15} />
                  <span>{p.message}</span>
                </div>
              ))}
            </div>
          )}
        </main>

        {showScript && (
          <aside className="script-panel">
            <div className="script-head">
              <h3><Icon name="code" />AHK v2 腳本</h3>
              <button type="button" className="ghost" onClick={() => navigator.clipboard.writeText(script).then(() => setToast({ kind: 'info', text: '已複製' }))} disabled={!script}>
                <Icon name="copy" />複製
              </button>
              <button type="button" className="ghost icon-only" onClick={() => setShowScript(false)} title="關閉">
                <Icon name="x" />
              </button>
            </div>
            <pre>{script || '修正錯誤後才會產生腳本'}</pre>
          </aside>
        )}
      </div>

      {!isTauri && <div className="browser-note">預覽模式，不能執行</div>}
      {toast && (
        <div className={`toast ${toast.kind}`} onClick={() => setToast(null)}>
          <Icon name={toast.kind === 'error' ? 'alert' : 'checkCircle'} size={17} />
          <span>{toast.text}</span>
        </div>
      )}
      {showTemplates && (
        <TemplatePicker
          onClose={() => setShowTemplates(false)}
          onPick={(t) => { addMacros([macroFromTemplate(t)]); setShowTemplates(false) }}
        />
      )}
    </div>
  )
}
