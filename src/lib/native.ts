// 與 Tauri 後端（Rust）溝通。在一般瀏覽器裡開發時，這些功能會改用替代做法或提示。
import { invoke } from '@tauri-apps/api/core'
import { open, save } from '@tauri-apps/plugin-dialog'
import { check, type Update } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import { getCurrentWindow } from '@tauri-apps/api/window'

export const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

export async function runScript(script: string, ahkPath: string): Promise<string> {
  if (!isTauri) throw new Error('瀏覽器預覽模式不能執行腳本，請用桌面版')
  return invoke<string>('run_script', { script, ahkPath })
}

export async function stopScript(): Promise<boolean> {
  if (!isTauri) return false
  return invoke<boolean>('stop_script')
}

export async function isScriptRunning(): Promise<boolean> {
  if (!isTauri) return false
  return invoke<boolean>('script_running')
}

function browserDownload(text: string, fileName: string) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
}

/** 另存檔案，回傳存檔路徑；使用者取消則回傳 null */
export async function saveTextFile(text: string, defaultName: string, ext: string, label: string): Promise<string | null> {
  if (!isTauri) {
    browserDownload(text, defaultName)
    return defaultName
  }
  const path = await save({ defaultPath: defaultName, filters: [{ name: label, extensions: [ext] }] })
  if (!path) return null
  await invoke('write_text_file', { path, contents: text, bom: ext === 'ahk' })
  return path
}

function browserPick(exts: string[]): Promise<{ name: string; text: string } | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = exts.map((e) => `.${e}`).join(',')
    input.onchange = async () => {
      const f = input.files?.[0]
      resolve(f ? { name: f.name, text: await f.text() } : null)
    }
    input.click()
  })
}

/** 開啟檔案，回傳檔名與內容；使用者取消則回傳 null */
export async function openTextFile(exts: string[], label: string): Promise<{ name: string; text: string } | null> {
  if (!isTauri) return browserPick(exts)
  const path = await open({ multiple: false, directory: false, filters: [{ name: label, extensions: exts }] })
  if (!path || Array.isArray(path)) return null
  const text = await invoke<string>('read_text_file', { path })
  const name = path.split(/[\\/]/).pop() ?? path
  return { name, text }
}

/** 檢查 GitHub Releases 有沒有新版 */
export async function checkUpdate(): Promise<Update | null> {
  if (!isTauri) return null
  try {
    return await check()
  } catch {
    return null
  }
}

/** 停掉巨集、下載安裝新版並重新啟動 */
export async function installUpdate(update: Update): Promise<void> {
  await stopScript().catch(() => false)
  await update.downloadAndInstall()
  await relaunch()
}

/** 用預設瀏覽器開網址 */
export async function openUrl(url: string): Promise<void> {
  if (!isTauri) {
    window.open(url, '_blank', 'noopener')
    return
  }
  await invoke('open_url', { url })
}

/** 找 AutoHotkey v2，回傳找到的路徑；找不到會丟出錯誤訊息 */
export async function detectAhk(ahkPath: string): Promise<string> {
  if (!isTauri) throw new Error('預覽模式無法偵測')
  return invoke<string>('detect_ahk', { ahkPath })
}

/** 選一個 .exe，回傳路徑 */
export async function pickExe(): Promise<string | null> {
  if (!isTauri) return null
  const path = await open({ multiple: false, directory: false, filters: [{ name: 'AutoHotkey', extensions: ['exe'] }] })
  return !path || Array.isArray(path) ? null : path
}

/** 讓視窗標題列跟著深色／淺色主題（null = 跟隨系統） */
export function setWindowTheme(theme: 'dark' | 'light' | null) {
  if (!isTauri) return
  getCurrentWindow().setTheme(theme).catch(() => {})
}

export interface PickedPixel {
  x: number
  y: number
  /** #RRGGBB */
  color: string
}

/** 等使用者在遊戲裡把滑鼠移到要的位置按 F8，回傳位置和顏色；取消（Esc）回傳 null */
export async function pickPixel(): Promise<PickedPixel | null> {
  if (!isTauri) throw new Error('預覽模式不能取色')
  return invoke<PickedPixel | null>('pick_pixel')
}

export function cancelPick() {
  if (isTauri) invoke('cancel_pick').catch(() => {})
}
