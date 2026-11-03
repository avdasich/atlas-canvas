//! Recovery commands retain the replaced scene in history before restoring a version.
use crate::storage::{Result, connect, directory, err, write_scene};
use crate::validation::{validate_id, validate_scene};
use rusqlite::params;
use serde_json::Value;
use tauri::AppHandle;
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Revision {
    id: i64,
    created_at: String,
    objects: usize,
}
#[tauri::command]
pub async fn list_revisions(app: AppHandle, country_id: String) -> Result<Vec<Revision>> {
    validate_id(&country_id)?;
    let dir = directory(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let conn = connect(&dir)?;
        let mut query = conn
            .prepare(
                "SELECT id, created_at, scene_json FROM scene_revisions
             WHERE country_id = ?1 ORDER BY id DESC LIMIT 1000",
            )
            .map_err(err)?;
        let rows = query
            .query_map([country_id], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                ))
            })
            .map_err(err)?;
        let mut result = Vec::new();
        for row in rows {
            let (id, created_at, raw) = row.map_err(err)?;
            if validate_scene(&raw).is_err() {
                continue;
            }
            let value: Value = serde_json::from_str(&raw).map_err(err)?;
            result.push(Revision {
                id,
                created_at,
                objects: value["items"].as_array().map_or(0, |items| items.len()),
            });
            if result.len() >= 100 {
                break;
            }
        }
        Ok(result)
    })
    .await
    .map_err(err)?
}
#[tauri::command]
pub async fn restore_revision(
    app: AppHandle,
    country_id: String,
    revision_id: i64,
) -> Result<String> {
    validate_id(&country_id)?;
    let dir = directory(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let mut conn = connect(&dir)?;
        let raw: String = conn
            .query_row(
                "SELECT scene_json FROM scene_revisions WHERE id=?1 AND country_id=?2",
                params![revision_id, country_id],
                |r| r.get(0),
            )
            .map_err(err)?;
        write_scene(&mut conn, &country_id, &raw, None)?;
        Ok(raw)
    })
    .await
    .map_err(err)?
}
