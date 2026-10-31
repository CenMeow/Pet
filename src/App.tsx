import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Macro, Settings } from './lib/types'
import { newId } from './lib/types'
import { generate } from './lib/generator'
import { keyLabel } from './lib/keys'
import { macroFromTemplate } from './lib/templates'
import { parseMgp } from './lib/mgp'
import { loadLibrary, parseLibraryJson, saveLibrary, serializeLibrary } from './lib/storage'
import { isScriptRunning, isTauri, openTextFile, runScript, saveTextFile, stopScript } from './lib/native'
import { MacroEditor } from './components/MacroEditor'
import { SettingsPanel } from './components/SettingsPanel'
import { TemplatePicker } from './components/TemplatePicker'
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
      const file = await openTextFile(['mgp', 'json'], '巨集檔')
      if (!file) return
      if (file.name.toLowerCase().endsWith('.mgp')) {
        const { macros: imported, warnings } = parseMgp(file.text, file.name)
        addMacros(imported)
        setToast({
          kind: warnings.length ? 'error' : 'info',
          text: `匯入 ${imported.length} 個巨集${warnings.length ? `；${warnings.join('；')}` : ''}`,
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
        <h1>TSB 巨集編輯器</h1>
        <div className="run-status">
          <span className={`dot ${running ? 'on' : ''}`} />
          {running ? `執行中（${keyLabel(settings.toggleHotkey)} 開關、${keyLabel(settings.exitHotkey)} 結束）` : '未執行'}
        </div>
        <span className="spacer" />
        <button type="button" className="primary" onClick={handleRun} disabled={errors.length > 0}>
          {running ? '套用變更' : '▶ 執行'}
        </button>
        <button type="button" onClick={handleStop} disabled={!running}>■ 停止</button>
        <button type="button" onClick={handleExportAhk}>匯出 .ahk</button>
        <button type="button" onClick={() => setShowScript((v) => !v)}>{showScript ? '隱藏腳本' : '查看腳本'}</button>
      </header>

      <div className="main">
        <aside className="sidebar">
          <div className="sidebar-actions">
            <button type="button" className="primary" onClick={() => setShowTemplates(true)}>+ 新增巨集</button>
            <button type="button" onClick={handleImport} title="支援 .mgp 和本編輯器匯出的 .json">匯入</button>
            <button type="button" onClick={handleExportJson} title="把所有巨集存成 .json，可以分享">匯出</button>
          </div>
          <ul className="macro-list">
            {macros.map((m) => {
              const hasError = errors.some((p) => p.macroId === m.id)
              return (
                <li
                  key={m.id}
                  className={`${m.id === selectedId && view === 'macro' ? 'active' : ''} ${m.enabled ? '' : 'disabled'}`}
                  onClick={() => { setSelectedId(m.id); setView('macro') }}
                >
                  <input
                    type="checkbox"
                    checked={m.enabled}
                    title="啟用／停用"
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => updateMacro({ ...m, enabled: e.target.checked })}
                  />
                  <span className="macro-list-name">{hasError && <span className="err-dot" title="有問題">!</span>}{m.name || '(未命名)'}</span>
                  <kbd>{m.hotkey ? keyLabel(m.hotkey) : '—'}</kbd>
                </li>
              )
            })}
          </ul>
          <button type="button" className={`settings-link ${view === 'settings' ? 'active' : ''}`} onClick={() => setView('settings')}>
            ⚙ 設定（靈敏度、快捷鍵）
          </button>
        </aside>

        <main className="content">
          {view === 'settings' ? (
            <SettingsPanel settings={settings} onChange={setSettings} />
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
            <div className="empty big">按左上角「新增巨集」開始，可以從範本挑一個。</div>
          )}

          {problems.length > 0 && (
            <div className="problems">
              {problems.map((p, i) => (
                <div key={i} className={`problem ${p.level}`}>{p.level === 'error' ? '錯誤' : '提醒'}：{p.message}</div>
              ))}
            </div>
          )}
        </main>

        {showScript && (
          <aside className="script-panel">
            <div className="script-head">
              <h3>產生的 AHK v2 腳本</h3>
              <button type="button" onClick={() => navigator.clipboard.writeText(script).then(() => setToast({ kind: 'info', text: '已複製' }))} disabled={!script}>
                複製
              </button>
            </div>
            <pre>{script || '修正錯誤後才會產生腳本'}</pre>
          </aside>
        )}
      </div>

      {!isTauri && <div className="browser-note">瀏覽器預覽模式：可以編輯和匯出，但「執行」只能在桌面版使用。</div>}
      {toast && <div className={`toast ${toast.kind}`} onClick={() => setToast(null)}>{toast.text}</div>}
      {showTemplates && (
        <TemplatePicker
          onClose={() => setShowTemplates(false)}
          onPick={(t) => { addMacros([macroFromTemplate(t)]); setShowTemplates(false) }}
        />
      )}
    </div>
  )
}
