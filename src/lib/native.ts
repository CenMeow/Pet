// 與 Tauri 後端（Rust）溝通。在一般瀏覽器裡開發時，這些功能會改用替代做法或提示。
import { invoke } from '@tauri-apps/api/core'
import { open, save } from '@tauri-apps/plugin-dialog'

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
