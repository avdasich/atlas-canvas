//! Application-wide appearance libraries and map preferences.
use crate::storage::{Result, connect, directory, err};
use rusqlite::{OptionalExtension, params};
use serde_json::Value;
use tauri::AppHandle;
#[tauri::command]
pub fn load_preferences(app: AppHandle, key: String) -> Result<Option<String>> {
    if !["map", "themes", "table-styles", "editor"].contains(&key.as_str()) {
        return Err("Неизвестный раздел настроек".into());
    }
    connect(&directory(&app)?)?
        .query_row("SELECT json FROM preferences WHERE key=?1", [&key], |r| {
            r.get(0)
        })
        .optional()
        .map_err(err)
}
#[tauri::command]
pub fn save_preferences(app: AppHandle, key: String, json: String) -> Result<()> {
    if !["map", "themes", "table-styles", "editor"].contains(&key.as_str())
        || json.len() > 5 * 1024 * 1024
    {
        return Err("Недопустимые настройки".into());
    }
    serde_json::from_str::<Value>(&json).map_err(err)?;
    connect(&directory(&app)?)?.execute("INSERT INTO preferences(key,json) VALUES (?1,?2) ON CONFLICT(key) DO UPDATE SET json=excluded.json", params![key,json]).map_err(err)?;
    Ok(())
}
