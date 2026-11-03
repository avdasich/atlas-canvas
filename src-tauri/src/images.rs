//! Managed original images and PNG previews. External source files are never modified.
use crate::storage::{Result, connect, directory, err};
use crate::validation::validate_asset_id;
use rusqlite::params;
use std::fs;
use tauri::AppHandle;
pub(crate) fn image_extension(bytes: &[u8]) -> Result<&'static str> {
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
        use std::io::Write;
        validate_asset_id(&asset_id)?;
        if bytes.len() > 50 * 1024 * 1024 || preview.len() > 16 * 1024 * 1024 {
            return Err("Изображение слишком большое".into());
        }
        let extension = image_extension(&bytes)?;
        if image_extension(&preview)? != "png" {
            return Err("Некорректное превью".into());
        }
        let internal = format!("assets/{asset_id}.{extension}");
        let thumbnail = format!("assets/{asset_id}.preview.png");
        let original_path = dir.join(&internal);
        let preview_path = dir.join(&thumbnail);
        let mut original = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&original_path)
            .map_err(err)?;
        let mut preview_created = false;
        let result = (|| {
            original.write_all(&bytes).map_err(err)?;
            original.sync_all().map_err(err)?;
            let mut thumbnail_file = fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&preview_path)
                .map_err(err)?;
            preview_created = true;
            thumbnail_file.write_all(&preview).map_err(err)?;
            thumbnail_file.sync_all().map_err(err)?;
            connect(&dir)?
                .execute(
                    "INSERT INTO assets(id, original_name, internal_path, preview_path, bytes)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                    params![
                        asset_id,
                        original_name,
                        internal,
                        thumbnail,
                        bytes.len() as i64
                    ],
                )
                .map_err(err)?;
            Ok(())
        })();
        drop(original);
        if result.is_err() {
            let _ = fs::remove_file(&original_path);
            if preview_created {
                let _ = fs::remove_file(&preview_path);
            }
        }
        result
    })
    .await
    .map_err(err)?
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
