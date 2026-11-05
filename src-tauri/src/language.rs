use std::sync::atomic::{AtomicBool, Ordering};

static ENGLISH: AtomicBool = AtomicBool::new(false);

pub fn text(russian: &'static str, english: &'static str) -> &'static str {
    if ENGLISH.load(Ordering::Relaxed) {
        english
    } else {
        russian
    }
}

#[tauri::command]
pub fn set_ui_language(app: tauri::AppHandle, language: &str) -> Result<(), String> {
    match language {
        "ru" => ENGLISH.store(false, Ordering::Relaxed),
        "en" => ENGLISH.store(true, Ordering::Relaxed),
        _ => return Err("Unsupported interface language".into()),
    }
    if let Some(menu) = app.menu() {
        update_items(menu.items().map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn update_items(items: Vec<tauri::menu::MenuItemKind<tauri::Wry>>) -> tauri::Result<()> {
    for item in items {
        match item {
            tauri::menu::MenuItemKind::MenuItem(item) if item.id().as_ref() == "atlas-quit" => {
                item.set_text(text("Выйти из Atlas Canvas", "Quit Atlas Canvas"))?;
            }
            tauri::menu::MenuItemKind::Submenu(menu) => {
                if matches!(menu.text()?.as_str(), "Файл" | "File") {
                    menu.set_text(text("Файл", "File"))?;
                }
                update_items(menu.items()?)?;
            }
            _ => {}
        }
    }
    Ok(())
}
