use rusqlite::{Connection, OptionalExtension, params};
use serde_json::Value;
use std::{
    fs,
    path::{Path, PathBuf},
    time::Duration,
};
use tauri::{AppHandle, Manager};

type Result<T> = std::result::Result<T, String>;
fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}
fn directory(app: &AppHandle) -> Result<PathBuf> {
    // Preserve the app identifier and the prototype's WebView localStorage.
    let dir = app.path().app_data_dir().map_err(err)?;
    fs::create_dir_all(dir.join("assets")).map_err(err)?;
    Ok(dir)
}
fn connect(dir: &Path) -> Result<Connection> {
    let conn = Connection::open(dir.join("atlas.sqlite3")).map_err(err)?;
    conn.busy_timeout(Duration::from_secs(5)).map_err(err)?;
    let version: i64 = conn
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .map_err(err)?;
    if version > 1 {
        return Err("База создана более новой версией Atlas Canvas".into());
    }
    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;
        CREATE TABLE IF NOT EXISTS scenes (
            country_id TEXT PRIMARY KEY, schema_version INTEGER NOT NULL,
            scene_json TEXT NOT NULL CHECK(json_valid(scene_json)),
            has_content INTEGER NOT NULL, updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
        );
        CREATE TABLE IF NOT EXISTS scene_revisions (
            id INTEGER PRIMARY KEY, country_id TEXT NOT NULL, scene_json TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
        );
        CREATE INDEX IF NOT EXISTS revisions_country ON scene_revisions(country_id, id);
        CREATE TABLE IF NOT EXISTS legacy_migrations (
            country_id TEXT PRIMARY KEY, legacy_key TEXT NOT NULL, original_json TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
        );
        CREATE TABLE IF NOT EXISTS assets (
            id TEXT PRIMARY KEY, original_name TEXT NOT NULL, internal_path TEXT NOT NULL,
            preview_path TEXT NOT NULL, bytes INTEGER NOT NULL,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
        ); PRAGMA user_version=1;").map_err(err)?;
    Ok(conn)
}
fn validate_id(id: &str) -> Result<()> {
    if id.len() == 3 && id.bytes().all(|b| b.is_ascii_digit()) {
        Ok(())
    } else {
        Err("Недопустимый код страны".into())
    }
}
fn validate_scene(raw: &str) -> Result<bool> {
    let value: Value = serde_json::from_str(raw).map_err(err)?;
    if value["schemaVersion"] != 2 {
        return Err("Версия холста не поддерживается".into());
    }
    let items = value["items"]
        .as_array()
        .ok_or("Отсутствует список объектов")?;
    if !value["camera"].is_object() || !value["theme"].is_object() {
        return Err("Некорректная сцена".into());
    }
    Ok(!items.is_empty())
}
fn read_scene(conn: &Connection, id: &str) -> Result<Option<String>> {
    validate_id(id)?;
    conn.query_row(
        "SELECT scene_json FROM scenes WHERE country_id=?1",
        [id],
        |r| r.get(0),
    )
    .optional()
    .map_err(err)
}
fn write_scene(
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
    tx.execute("INSERT INTO scenes(country_id,schema_version,scene_json,has_content) VALUES (?1,2,?2,?3)
        ON CONFLICT(country_id) DO UPDATE SET schema_version=2,scene_json=excluded.scene_json,has_content=excluded.has_content,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')",
        params![id, raw, has_content]).map_err(err)?;
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
    tauri::async_runtime::spawn_blocking(move || {
        write_scene(&mut connect(&dir)?, &country_id, &scene_json, None)
    })
    .await
    .map_err(err)?
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
fn validate_asset_id(id: &str) -> Result<()> {
    if id.len() == 36 && id.bytes().all(|b| b.is_ascii_hexdigit() || b == b'-') {
        Ok(())
    } else {
        Err("Недопустимый ID файла".into())
    }
}
fn image_extension(bytes: &[u8]) -> Result<&'static str> {
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        Ok("png")
    } else if bytes.starts_with(&[0xff, 0xd8, 0xff]) {
        Ok("jpg")
    } else if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        Ok("gif")
    } else if bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP") {
        Ok("webp")
    } else {
        Err("Формат изображения не поддерживается".into())
    }
}
#[tauri::command]
pub async fn import_image(
    app: AppHandle,
    asset_id: String,
    original_name: String,
    bytes: Vec<u8>,
    preview: Vec<u8>,
) -> Result<()> {
    let dir = directory(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        validate_asset_id(&asset_id)?;
        if bytes.len() > 50 * 1024 * 1024 || preview.len() > 16 * 1024 * 1024 { return Err("Изображение слишком большое".into()); }
        let ext = image_extension(&bytes)?;
        if image_extension(&preview)? != "png" { return Err("Некорректное превью".into()); }
        let internal = format!("assets/{asset_id}.{ext}"); let thumb = format!("assets/{asset_id}.preview.png");
        let original_path = dir.join(&internal); let preview_path = dir.join(&thumb);
        use std::io::Write;
        let mut file = fs::OpenOptions::new().write(true).create_new(true).open(&original_path).map_err(err)?;
        let mut preview_created = false;
        let result = (|| {
            file.write_all(&bytes).map_err(err)?; file.sync_all().map_err(err)?;
            let mut thumb_file = fs::OpenOptions::new().write(true).create_new(true).open(&preview_path).map_err(err)?;
            preview_created = true;
            thumb_file.write_all(&preview).map_err(err)?; thumb_file.sync_all().map_err(err)?;
            connect(&dir)?.execute("INSERT INTO assets(id,original_name,internal_path,preview_path,bytes) VALUES (?1,?2,?3,?4,?5)",
                params![asset_id, original_name, internal, thumb, bytes.len() as i64]).map_err(err)?;
            Ok(())
        })();
        if result.is_err() { let _ = fs::remove_file(&original_path); if preview_created { let _ = fs::remove_file(&preview_path); } }
        result
    }).await.map_err(err)?
}
#[tauri::command]
pub async fn read_image_preview(app: AppHandle, asset_id: String) -> Result<Vec<u8>> {
    let dir = directory(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        validate_asset_id(&asset_id)?;
        let conn = connect(&dir)?;
        let exists: bool = conn
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM assets WHERE id=?1)",
                [&asset_id],
                |r| r.get(0),
            )
            .map_err(err)?;
        if !exists {
            return Err("Изображение отсутствует в хранилище".into());
        }
        fs::read(dir.join(format!("assets/{asset_id}.preview.png"))).map_err(err)
    })
    .await
    .map_err(err)?
}
#[cfg(test)]
mod tests {
    use super::*;
    fn scene(items: &str) -> String {
        format!(
            r##"{{"schemaVersion":2,"items":{items},"camera":{{"x":0,"y":0,"scale":1}},"theme":{{"background":"#ffffff","pattern":"none","fontFamily":"Arial"}}}}"##
        )
    }
    fn test_dir(name: &str) -> PathBuf {
        let p = std::env::temp_dir().join(format!("atlas-storage-{}-{name}", std::process::id()));
        fs::create_dir_all(&p).unwrap();
        p
    }
    #[test]
    fn persists_across_connections_and_keeps_countries_separate() {
        let dir = test_dir("persist");
        let raw = scene(r#"[{"id":"note","kind":"note","x":1,"y":2,"content":"Казахстан"}]"#);
        {
            let mut conn = connect(&dir).unwrap();
            write_scene(&mut conn, "398", &raw, None).unwrap();
        }
        let conn = connect(&dir).unwrap();
        assert_eq!(read_scene(&conn, "398").unwrap(), Some(raw));
        assert_eq!(read_scene(&conn, "392").unwrap(), None);
        drop(conn);
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn invalid_write_and_repeated_migration_preserve_last_scene() {
        let dir = test_dir("rollback");
        let mut conn = connect(&dir).unwrap();
        let raw = scene("[]");
        write_scene(&mut conn, "392", &raw, Some("atlas-canvas:scene:Japan")).unwrap();
        assert!(write_scene(&mut conn, "392", "{}", None).is_err());
        assert!(write_scene(&mut conn, "392", &raw, Some("Japan")).is_err());
        assert_eq!(read_scene(&conn, "392").unwrap(), Some(raw));
        drop(conn);
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn database_write_failure_rolls_back_both_scene_and_revision() {
        let dir = test_dir("write-failure");
        let mut conn = connect(&dir).unwrap();
        let old = scene(r#"[{"id":"a","kind":"circle","x":0,"y":0}]"#);
        write_scene(&mut conn, "398", &old, None).unwrap();
        conn.execute_batch("CREATE TEMP TRIGGER reject_scene BEFORE UPDATE ON scenes BEGIN SELECT RAISE(ABORT, 'write failed'); END;").unwrap();
        assert!(write_scene(&mut conn, "398", &scene("[]"), None).is_err());
        assert_eq!(read_scene(&conn, "398").unwrap(), Some(old));
        let count: i64 = conn
            .query_row("SELECT count(*) FROM scene_revisions", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 0);
        drop(conn);
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn keeps_previous_revision_even_when_last_object_is_deleted() {
        let dir = test_dir("revision");
        let mut conn = connect(&dir).unwrap();
        let old = scene(r#"[{"id":"a","kind":"circle","x":0,"y":0}]"#);
        write_scene(&mut conn, "398", &old, None).unwrap();
        write_scene(&mut conn, "398", &scene("[]"), None).unwrap();
        let saved: String = conn
            .query_row(
                "SELECT scene_json FROM scene_revisions WHERE country_id='398'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(saved, old);
        drop(conn);
        fs::remove_dir_all(dir).unwrap();
    }
}
