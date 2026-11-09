// පාලි-සිංහල ශබ්දකෝෂය — Windows ඇප් එක (Tauri). ශබ්දකෝෂ ගොනු (www) .exe එක ඇතුළේම ඇති නිසා offline ක්‍රියා කරයි.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri_plugin_opener::OpenerExt;

/// බාහිර සබැඳි (https / mailto) පරිගණකයේ පෙරනිමි browser / email ඇප් එකේ විවෘත කරයි (script.js).
#[tauri::command]
fn open_url(app: tauri::AppHandle, url: String) -> Result<(), String> {
    let ok = url.starts_with("https://") || url.starts_with("http://") || url.starts_with("mailto:");
    if !ok {
        return Err("blocked".into());
    }
    app.opener().open_url(url, None::<&str>).map_err(|e| e.to_string())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![open_url])
        .run(tauri::generate_context!())
        .expect("error while running Pali-Sinhala Dictionary");
}
