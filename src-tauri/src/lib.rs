mod storage;
use tauri::{Emitter, Manager};

#[tauri::command]
fn finish_exit(app: tauri::AppHandle) {
    app.exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            storage::load_scene,
            storage::save_scene,
            storage::migrate_scene,
            storage::filled_countries,
            storage::import_image,
            storage::read_image_preview,
            finish_exit
        ])
        .build(tauri::generate_context!())
        .expect("error while building Atlas Canvas")
        .run(|app, event| {
            if let tauri::RunEvent::ExitRequested {
                code: None, api, ..
            } = event
            {
                if app.get_webview_window("main").is_some() {
                    api.prevent_exit();
                    let _ = app.emit("atlas-before-exit", ());
                }
            }
        });
}
