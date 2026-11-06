/// Parameter order: country ID, serialized scene, has-content flag, scene format version.
pub(crate) const UPSERT_SCENE: &str = "
    INSERT INTO scenes(country_id, schema_version, scene_json, has_content)
    VALUES (?1, ?4, ?2, ?3)
    ON CONFLICT(country_id) DO UPDATE SET
        schema_version = excluded.schema_version,
        scene_json = excluded.scene_json,
        has_content = excluded.has_content,
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";
use crate::validation::{validate_id, validate_scene};
use rusqlite::{Connection, OptionalExtension, params};
use serde_json::Value;
use std::{
    fs,
    path::{Path, PathBuf},
    time::Duration,
};
use tauri::{AppHandle, Manager};

pub(crate) type Result<T> = std::result::Result<T, String>;
pub(crate) fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}
pub(crate) fn directory(app: &AppHandle) -> Result<PathBuf> {
    // Preserve the app identifier and the prototype's WebView localStorage.
    let dir = app.path().app_data_dir().map_err(err)?;
    fs::create_dir_all(dir.join("assets")).map_err(err)?;
    Ok(dir)
}
pub(crate) fn connect(dir: &Path) -> Result<Connection> {
    let conn = Connection::open(dir.join("atlas.sqlite3")).map_err(err)?;
    conn.busy_timeout(Duration::from_secs(5)).map_err(err)?;
    let version: i64 = conn
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .map_err(err)?;
    if version > 2 {
        return Err("База создана более новой версией Atlas Canvas".into());
    }
    conn.execute_batch(include_str!("schema.sql"))
        .map_err(err)?;
    let columns: Vec<String> = conn
        .prepare("PRAGMA table_info(assets)")
        .map_err(err)?
        .query_map([], |r| r.get(1))
        .map_err(err)?
        .collect::<rusqlite::Result<_>>()
        .map_err(err)?;
    if !columns.iter().any(|c| c == "mime") {
        conn.execute(
            "ALTER TABLE assets ADD COLUMN mime TEXT NOT NULL DEFAULT 'image/png'",
            [],
        )
        .map_err(err)?;
    }
    conn.pragma_update(None, "user_version", 2).map_err(err)?;
    Ok(conn)
}
pub(crate) fn read_scene(conn: &Connection, id: &str) -> Result<Option<String>> {
    validate_id(id)?;
    conn.query_row(
        "SELECT scene_json FROM scenes WHERE country_id=?1",
        [id],
        |r| r.get(0),
    )
    .optional()
    .map_err(err)
}
pub(crate) fn write_scene(
    conn: &mut Connection,
    id: &str,
    raw: &str,
    migration_key: Option<&str>,
) -> Result<()> {
    validate_id(id)?;
    let has_content = validate_scene(raw)?;
    let tx = conn.transaction().map_err(err)?;
    let old = read_scene(&tx, id)?;
    if migration_key.is_some() && old.is_some() {
        return Err("Холст уже существует. Повторный перенос остановлен.".into());
    }
    if old.as_deref() == Some(raw) {
        return Ok(());
    }
    if let Some(previous) = old {
        tx.execute(
            "INSERT INTO scene_revisions(country_id,scene_json) VALUES (?1,?2)",
            params![id, previous],
        )
        .map_err(err)?;
    }
    if let Some(key) = migration_key {
        tx.execute(
            "INSERT INTO legacy_migrations(country_id,legacy_key,original_json) VALUES (?1,?2,?3)",
            params![id, key, raw],
        )
        .map_err(err)?;
    }
    let version = serde_json::from_str::<Value>(raw).map_err(err)?["schemaVersion"]
        .as_i64()
        .unwrap();
    tx.execute(UPSERT_SCENE, params![id, raw, has_content, version])
        .map_err(err)?;
    if read_scene(&tx, id)?.as_deref() != Some(raw) {
        return Err("Не прошла проверка записанной сцены".into());
    }
    tx.commit().map_err(err)
}
#[tauri::command]
pub async fn load_scene(app: AppHandle, country_id: String) -> Result<Option<String>> {
    let dir = directory(&app)?;
    tauri::async_runtime::spawn_blocking(move || read_scene(&connect(&dir)?, &country_id))
        .await
        .map_err(err)?
}
#[tauri::command]
pub async fn save_scene(app: AppHandle, country_id: String, scene_json: String) -> Result<()> {
    let dir = directory(&app)?;
    let save_dir = dir.clone();
    tauri::async_runtime::spawn_blocking(move || {
        write_scene(&mut connect(&save_dir)?, &country_id, &scene_json, None)
    })
    .await
    .map_err(err)??;
    crate::archive::schedule_automatic_backup(app, dir);
    Ok(())
}
#[tauri::command]
pub async fn migrate_scene(
    app: AppHandle,
    country_id: String,
    scene_json: String,
    legacy_key: String,
) -> Result<()> {
    let dir = directory(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        write_scene(
            &mut connect(&dir)?,
            &country_id,
            &scene_json,
            Some(&legacy_key),
        )
    })
    .await
    .map_err(err)?
}
#[tauri::command]
pub async fn filled_countries(app: AppHandle) -> Result<std::collections::BTreeMap<String, bool>> {
    let dir = directory(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let conn = connect(&dir)?;
        let mut stmt = conn
            .prepare("SELECT country_id,has_content FROM scenes ORDER BY country_id")
            .map_err(err)?;
        stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
            .map_err(err)?
            .collect::<rusqlite::Result<std::collections::BTreeMap<_, _>>>()
            .map_err(err)
    })
    .await
    .map_err(err)?
}
#[cfg(test)]
#[path = "storage/tests.rs"]
mod tests;
