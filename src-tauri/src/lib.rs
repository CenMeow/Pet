use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Child, Command};
use std::sync::Mutex;
use std::time::{Duration, SystemTime};

use tauri::{Manager, RunEvent, State};

/// 目前執行中的 AutoHotkey 行程
#[derive(Default)]
struct Runner(Mutex<Option<Child>>);

const SCRIPT_NAME: &str = "tsb-macros.ahk";
/// 腳本看到這個檔案就會自己結束（系統管理員模式下編輯器不能直接關閉它）
const STOP_FLAG: &str = "stop.flag";
/// 腳本大約每秒更新一次這個檔案，用來判斷是否還在執行
const HEARTBEAT: &str = "heartbeat";

fn script_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("找不到資料夾：{e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("建立資料夾失敗：{e}"))?;
    Ok(dir)
}

fn heartbeat_fresh(dir: &Path) -> bool {
    fs::metadata(dir.join(HEARTBEAT))
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| SystemTime::now().duration_since(t).ok())
        .map(|age| age < Duration::from_millis(2500))
        .unwrap_or(false)
}

/// 請腳本自己結束，並等它停下來（最多約 1.5 秒）
fn request_stop(dir: &Path) {
    let _ = fs::write(dir.join(STOP_FLAG), b"stop");
    for _ in 0..15 {
        if !heartbeat_fresh(dir) {
            break;
        }
        std::thread::sleep(Duration::from_millis(100));
        // 腳本結束後不再更新 heartbeat；直接刪掉以免誤判
        if let Ok(m) = fs::metadata(dir.join(HEARTBEAT)).and_then(|m| m.modified()) {
            if SystemTime::now().duration_since(m).map(|a| a > Duration::from_millis(1200)).unwrap_or(false) {
                break;
            }
        }
    }
    let _ = fs::remove_file(dir.join(HEARTBEAT));
}

/// 常見的 AutoHotkey v2 安裝位置
fn ahk_candidates() -> Vec<PathBuf> {
    let mut roots: Vec<PathBuf> = Vec::new();
    for var in ["ProgramFiles", "ProgramW6432", "ProgramFiles(x86)", "LOCALAPPDATA"] {
        if let Ok(v) = std::env::var(var) {
            roots.push(PathBuf::from(&v).join("AutoHotkey"));
            roots.push(PathBuf::from(&v).join("Programs").join("AutoHotkey"));
        }
    }
    let mut out = Vec::new();
    for root in roots {
        for rel in [
            "v2/AutoHotkey64.exe",
            "v2/AutoHotkey32.exe",
            "v2/AutoHotkey.exe",
            "AutoHotkey64.exe",
            "AutoHotkey.exe",
        ] {
            out.push(root.join(rel));
        }
    }
    out
}

fn find_ahk(custom: &str) -> Result<PathBuf, String> {
    let custom = custom.trim().trim_matches('"');
    if !custom.is_empty() {
        let p = PathBuf::from(custom);
        return if p.is_file() {
            Ok(p)
        } else {
            Err(format!("找不到你設定的 AutoHotkey 路徑：{custom}"))
        };
    }
    ahk_candidates()
        .into_iter()
        .find(|p| p.is_file())
        .ok_or_else(|| {
            "找不到 AutoHotkey v2。請到 autohotkey.com 安裝 v2，或在「設定」填入 AutoHotkey64.exe 的路徑".to_string()
        })
}

fn write_utf8_bom(path: &Path, contents: &str) -> Result<(), String> {
    let mut bytes = vec![0xEF, 0xBB, 0xBF];
    bytes.extend_from_slice(contents.as_bytes());
    fs::write(path, bytes).map_err(|e| format!("寫入 {} 失敗：{e}", path.display()))
}

fn kill_child(runner: &Runner) {
    if let Ok(mut guard) = runner.0.lock() {
        if let Some(mut child) = guard.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

#[tauri::command]
fn run_script(
    app: tauri::AppHandle,
    runner: State<'_, Runner>,
    script: String,
    ahk_path: String,
) -> Result<String, String> {
    if !cfg!(target_os = "windows") {
        return Err("AutoHotkey 只能在 Windows 上執行".into());
    }
    let ahk = find_ahk(&ahk_path)?;
    let dir = script_dir(&app)?;

    // 先停掉上一次的（包含系統管理員模式下跑的），再啟動新的
    request_stop(&dir);
    kill_child(&runner);
    let _ = fs::remove_file(dir.join(STOP_FLAG));

    let script_path = dir.join(SCRIPT_NAME);
    write_utf8_bom(&script_path, &script)?;
    let child = Command::new(&ahk)
        .arg("/ErrorStdOut")
        .arg(&script_path)
        .spawn()
        .map_err(|e| format!("啟動 AutoHotkey 失敗：{e}"))?;
    *runner.0.lock().map_err(|_| "內部錯誤")? = Some(child);
    Ok("巨集已啟動，切到 Roblox 就能用".into())
}

#[tauri::command]
fn stop_script(app: tauri::AppHandle, runner: State<'_, Runner>) -> bool {
    let was_running = script_running(app.clone(), runner.clone());
    if let Ok(dir) = script_dir(&app) {
        request_stop(&dir);
    }
    kill_child(&runner);
    was_running
}

#[tauri::command]
fn script_running(app: tauri::AppHandle, runner: State<'_, Runner>) -> bool {
    if script_dir(&app).map(|d| heartbeat_fresh(&d)).unwrap_or(false) {
        return true;
    }
    let Ok(mut guard) = runner.0.lock() else {
        return false;
    };
    match guard.as_mut() {
        Some(child) => match child.try_wait() {
            Ok(None) => true,
            _ => {
                // 已經結束（例如按了結束鍵或腳本出錯）
                *guard = None;
                false
            }
        },
        None => false,
    }
}

#[tauri::command]
fn write_text_file(path: String, contents: String, bom: bool) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if bom {
        write_utf8_bom(&p, &contents)
    } else {
        fs::write(&p, contents).map_err(|e| format!("寫入 {path} 失敗：{e}"))
    }
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    let bytes = fs::read(&path).map_err(|e| format!("讀取 {path} 失敗：{e}"))?;
    let bytes = bytes.strip_prefix(&[0xEF, 0xBB, 0xBF]).unwrap_or(&bytes);
    Ok(String::from_utf8_lossy(bytes).into_owned())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(Runner::default())
        .invoke_handler(tauri::generate_handler![
            run_script,
            stop_script,
            script_running,
            write_text_file,
            read_text_file
        ])
        .build(tauri::generate_context!())
        .expect("啟動應用程式失敗");

    app.run(|handle, event| {
        // 關掉編輯器時一併停止巨集
        if let RunEvent::Exit = event {
            if let Ok(dir) = script_dir(handle) {
                let _ = fs::write(dir.join(STOP_FLAG), b"stop");
            }
            kill_child(&handle.state::<Runner>());
        }
    });
}
