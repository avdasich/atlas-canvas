mod archive;
mod media;
mod storage;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{Emitter, Manager};

#[derive(Default)]
struct ExitPermission(AtomicBool);

#[tauri::command]
fn finish_exit(app: tauri::AppHandle, permission: tauri::State<ExitPermission>) {
    permission.0.store(true, Ordering::Release);
    app.exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(archive::Imports::default())
        .manage(ExitPermission::default())
        .menu(|app| {
            use tauri::menu::{Menu, MenuItem, MenuItemKind};
            let menu = Menu::default(app)?;
            let quit = MenuItem::with_id(
                app,
                "atlas-quit",
                "Выйти из Atlas Canvas",
                true,
                Some("CmdOrCtrl+Q"),
            )?;
            // The predefined macOS Quit item sends NSApplication.terminate directly.
            // Replace it so the WebView remains alive until its save queue is drained.
            #[cfg(any(target_os = "macos", target_os = "windows"))]
            if let Some(MenuItemKind::Submenu(submenu)) = menu.items()?.first() {
                let count = submenu.items()?.len();
                if count > 0 {
                    submenu.remove_at(count - 1)?;
                }
                submenu.append(&quit)?;
            }
            #[cfg(not(any(target_os = "macos", target_os = "windows")))]
            menu.append(&tauri::menu::Submenu::with_items(
                app,
                "Файл",
                true,
                &[&quit],
            )?)?;
            Ok(menu)
        })
        .on_menu_event(|app, event| {
            if event.id().as_ref() == "atlas-quit" {
                let _ = app.emit("atlas-before-exit", ());
            }
        })
        .invoke_handler(tauri::generate_handler![
            storage::load_scene,
            storage::save_scene,
            storage::migrate_scene,
            storage::filled_countries,
            storage::import_image,
            storage::read_image_preview,
            storage::list_revisions,
            storage::restore_revision,
            media::import_url,
            media::save_canvas_export,
            media::list_fonts,
            media::import_media,
            media::asset_path,
            media::open_asset,
            media::open_link,
            archive::open_backup_folder,
            archive::export_atlas,
            archive::inspect_archive,
            archive::cancel_archive,
            archive::apply_archive,
            finish_exit
        ])
        .build(tauri::generate_context!())
        .expect("error while building Atlas Canvas")
        .run(|app, event| {
            if let tauri::RunEvent::ExitRequested { api, .. } = event {
                // Native Quit menu requests an explicit exit code too; only a completed
                // frontend flush may authorize exit, regardless of the request's code.
                if !app.state::<ExitPermission>().0.load(Ordering::Acquire)
                    && app.get_webview_window("main").is_some()
                {
                    api.prevent_exit();
                    let _ = app.emit("atlas-before-exit", ());
                }
            }
        });
}
