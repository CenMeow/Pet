use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Child, Command};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
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
    if let Some(rest) = bytes.strip_prefix(&[0xFF, 0xFE]) {
        let units: Vec<u16> = rest.chunks_exact(2).map(|c| u16::from_le_bytes([c[0], c[1]])).collect();
        return Ok(String::from_utf16_lossy(&units));
    }
    let bytes = bytes.strip_prefix(&[0xEF, 0xBB, 0xBF]).unwrap_or(&bytes);
    Ok(String::from_utf8_lossy(bytes).into_owned())
}

/// 取色：目前這一次取色的編號。開始新的取色或取消時加一，舊的就會停下來
#[derive(Default)]
struct Picker(Arc<AtomicU64>);

#[derive(serde::Serialize)]
struct Picked {
    x: i32,
    y: i32,
    /// #RRGGBB
    color: String,
}

#[cfg(windows)]
mod screen {
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::{Duration, Instant};

    #[repr(C)]
    struct Point {
        x: i32,
        y: i32,
    }

    #[link(name = "user32")]
    unsafe extern "system" {
        fn GetCursorPos(point: *mut Point) -> i32;
        fn GetAsyncKeyState(vk: i32) -> i16;
        fn GetDC(hwnd: isize) -> isize;
        fn ReleaseDC(hwnd: isize, hdc: isize) -> i32;
        fn MessageBeep(kind: u32) -> i32;
    }

    #[link(name = "gdi32")]
    unsafe extern "system" {
        fn GetPixel(hdc: isize, x: i32, y: i32) -> u32;
    }

    const VK_ESCAPE: i32 = 0x1B;
    const VK_F8: i32 = 0x77;

    fn pressed(vk: i32) -> bool {
        (unsafe { GetAsyncKeyState(vk) } as u16 & 0x8000) != 0
    }

    /// 等使用者按 F8，回傳滑鼠位置和那一點的顏色（0xRRGGBB）。Esc、逾時或被取消回傳 None
    pub fn pick(current: &AtomicU64, id: u64) -> Result<Option<(i32, i32, u32)>, String> {
        let start = Instant::now();
        // F8 要先放開再按下才算，避免一開始就按著
        let mut armed = !pressed(VK_F8);
        loop {
            if current.load(Ordering::SeqCst) != id || pressed(VK_ESCAPE) || start.elapsed() > Duration::from_secs(120) {
                return Ok(None);
            }
            let f8 = pressed(VK_F8);
            if f8 && armed {
                let mut point = Point { x: 0, y: 0 };
                if unsafe { GetCursorPos(&mut point) } == 0 {
                    return Err("讀不到滑鼠位置".into());
                }
                let colorref = unsafe {
                    let hdc = GetDC(0);
                    if hdc == 0 {
                        return Err("讀不到螢幕".into());
                    }
                    let c = GetPixel(hdc, point.x, point.y);
                    ReleaseDC(0, hdc);
                    c
                };
                if colorref == 0xFFFF_FFFF {
                    return Err("讀不到這個位置的顏色".into());
                }
                unsafe { MessageBeep(0) };
                // COLORREF 是 0x00BBGGRR
                let rgb = ((colorref & 0xFF) << 16) | (colorref & 0xFF00) | ((colorref >> 16) & 0xFF);
                return Ok(Some((point.x, point.y, rgb)));
            }
            if !f8 {
                armed = true;
            }
            std::thread::sleep(Duration::from_millis(10));
        }
    }
}

#[cfg(not(windows))]
mod screen {
    use std::sync::atomic::AtomicU64;

    pub fn pick(_current: &AtomicU64, _id: u64) -> Result<Option<(i32, i32, u32)>, String> {
        Err("只能在 Windows 上取色".into())
    }
}

/// 在遊戲裡取色：滑鼠移到要的位置按 F8
#[tauri::command]
async fn pick_pixel(picker: State<'_, Picker>) -> Result<Option<Picked>, String> {
    let current = picker.0.clone();
    let id = current.fetch_add(1, Ordering::SeqCst) + 1;
    let found = tauri::async_runtime::spawn_blocking(move || screen::pick(&current, id))
        .await
        .map_err(|e| format!("取色失敗：{e}"))??;
    Ok(found.map(|(x, y, rgb)| Picked { x, y, color: format!("#{rgb:06X}") }))
}

#[tauri::command]
fn cancel_pick(picker: State<'_, Picker>) {
    picker.0.fetch_add(1, Ordering::SeqCst);
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct RobloxSens {
    value: f64,
    /// 設定檔最後存檔時間（Unix 毫秒）
    modified_ms: u64,
}

/// 最新的 Roblox 設定檔（%LOCALAPPDATA%\Roblox\GlobalBasicSettings_*.xml，不含 Studio 的）
fn roblox_settings_file() -> Option<PathBuf> {
    let dir = PathBuf::from(std::env::var_os("LOCALAPPDATA")?).join("Roblox");
    fs::read_dir(dir)
        .ok()?
        .filter_map(|e| e.ok())
        .filter(|e| {
            let name = e.file_name().to_string_lossy().to_string();
            name.starts_with("GlobalBasicSettings_") && name.ends_with(".xml") && !name.contains("Studio")
        })
        .filter_map(|e| Some((e.metadata().ok()?.modified().ok()?, e.path())))
        .max_by_key(|(t, _)| *t)
        .map(|(_, p)| p)
}

/// 遊戲設定選單改的是 MouseSensitivityThirdPerson／FirstPerson（Vector2），舊的 MouseSensitivity 不會跟著變
fn parse_roblox_sens(text: &str) -> Option<f64> {
    let positive = |v: &str| v.trim().parse::<f64>().ok().filter(|v| *v > 0.0);
    for name in ["MouseSensitivityThirdPerson", "MouseSensitivityFirstPerson"] {
        let tag = format!("<Vector2 name=\"{name}\">");
        let Some(at) = text.find(&tag) else { continue };
        let rest = &text[at + tag.len()..];
        let (Some(a), Some(b), Some(end)) = (rest.find("<X>"), rest.find("</X>"), rest.find("</Vector2>")) else { continue };
        if a < b && b < end {
            if let Some(v) = positive(&rest[a + 3..b]) {
                return Some(v);
            }
        }
    }
    let tag = "<float name=\"MouseSensitivity\">";
    let rest = &text[text.find(tag)? + tag.len()..];
    positive(&rest[..rest.find("</float>")?])
}

/// 讀 Roblox 設定檔裡的轉視角靈敏度（給設定頁顯示）
#[tauri::command]
fn read_roblox_sens() -> Option<RobloxSens> {
    let path = roblox_settings_file()?;
    let bytes = fs::read(&path).ok()?;
    let value = parse_roblox_sens(&String::from_utf8_lossy(&bytes))?;
    let modified_ms = fs::metadata(&path)
        .ok()?
        .modified()
        .ok()?
        .duration_since(SystemTime::UNIX_EPOCH)
        .ok()?
        .as_millis() as u64;
    Some(RobloxSens { value, modified_ms })
}

/// 回傳找到的 AutoHotkey v2 路徑
#[tauri::command]
fn detect_ahk(ahk_path: String) -> Result<String, String> {
    find_ahk(&ahk_path).map(|p| p.display().to_string())
}

/// 用預設瀏覽器開網址（只接受 https）
#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    if !url.starts_with("https://") || url.chars().any(|c| c.is_whitespace() || c == '"') {
        return Err("網址不正確".into());
    }
    #[cfg(target_os = "windows")]
    let result = Command::new("rundll32").arg("url.dll,FileProtocolHandler").arg(&url).spawn();
    #[cfg(target_os = "macos")]
    let result = Command::new("open").arg(&url).spawn();
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    let result = Command::new("xdg-open").arg(&url).spawn();
    result.map(|_| ()).map_err(|e| format!("開啟網址失敗：{e}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(Runner::default())
        .manage(Picker::default())
        .invoke_handler(tauri::generate_handler![
            run_script,
            stop_script,
            script_running,
            write_text_file,
            read_text_file,
            detect_ahk,
            open_url,
            pick_pixel,
            cancel_pick,
            read_roblox_sens
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

#[cfg(test)]
mod tests {
    use super::parse_roblox_sens;

    #[test]
    fn reads_third_person_sensitivity_first() {
        let xml = r#"<Item class="UserGameSettings"><Properties>
            <float name="MouseSensitivity">0.400000006</float>
            <Vector2 name="MouseSensitivityFirstPerson">
                <X>0.25</X>
                <Y>0.25</Y>
            </Vector2>
            <Vector2 name="MouseSensitivityThirdPerson">
                <X>0.100000001</X>
                <Y>0.100000001</Y>
            </Vector2>
        </Properties></Item>"#;
        assert!((parse_roblox_sens(xml).unwrap() - 0.1).abs() < 1e-6);
    }

    #[test]
    fn falls_back_to_old_field() {
        assert_eq!(parse_roblox_sens(r#"<float name="MouseSensitivity">0.5</float>"#), Some(0.5));
        assert_eq!(parse_roblox_sens("<roblox></roblox>"), None);
    }
}
