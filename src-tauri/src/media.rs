use crate::operations::{Operation, ProgressReader};
use crate::storage::{Result, connect, directory, err};
use crate::validation::validate_asset_id;
use rusqlite::params;
use std::{
    fs,
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;
static NEXT_ID: AtomicU64 = AtomicU64::new(0);
pub(crate) fn new_id() -> String {
    let n = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos()
        + NEXT_ID.fetch_add(1, Ordering::Relaxed) as u128;
    let h = format!("{n:032x}");
    format!(
        "{}-{}-{}-{}-{}",
        &h[..8],
        &h[8..12],
        &h[12..16],
        &h[16..20],
        &h[20..]
    )
}
pub(crate) fn safe_asset_path(dir: &Path, relative: &str) -> Result<PathBuf> {
    let p = Path::new(relative);
    if p.components().count() != 2
        || !relative.starts_with("assets/")
        || relative.contains('\\')
        || p.components()
            .any(|c| !matches!(c, std::path::Component::Normal(_)))
    {
        return Err("Некорректный путь вложения".into());
    }
    Ok(dir.join(p))
}
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedMedia {
    asset_id: String,
    title: String,
    kind: String,
}
#[tauri::command]
pub async fn import_media(
    app: AppHandle,
    kind: String,
    operation_id: Option<String>,
) -> Result<Option<ImportedMedia>> {
    let extensions: &[&str] = match kind.as_str() {
        "video" => &["mp4", "webm", "mov"],
        "audio" => &["mp3", "m4a", "wav", "ogg", "flac"],
        "font" => &["ttf", "otf", "woff2"],
        _ => return Err("Неизвестный тип файла".into()),
    };
    let (operation, _) = Operation::start(&app, operation_id)?;
    tauri::async_runtime::spawn_blocking(move || {
        let picked = app
            .dialog()
            .file()
            .set_title("Импорт в Atlas Canvas")
            .add_filter("Поддерживаемые файлы", extensions)
            .blocking_pick_file();
        let Some(picked) = picked else {
            return Ok(None);
        };
        let path = picked.into_path().map_err(err)?;
        let extension = path
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or("")
            .to_lowercase();
        if !extensions.contains(&extension.as_str()) {
            return Err("Формат не поддерживается".into());
        }
        let bytes = fs::metadata(&path).map_err(err)?.len();
        let limit = if kind == "font" {
            30 * 1024 * 1024
        } else {
            8_u64 * 1024 * 1024 * 1024
        };
        if bytes == 0 || bytes > limit {
            return Err("Файл пустой или слишком большой".into());
        }
        let dir = directory(&app)?;
        let id = new_id();
        let relative = format!("assets/{id}.{extension}");
        let destination = dir.join(&relative);
        let title = path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("Медиа")
            .to_owned();
        let mime = match extension.as_str() {
            "mp4" => "video/mp4",
            "mov" => "video/quicktime",
            "webm" => "video/webm",
            "mp3" => "audio/mpeg",
            "m4a" => "audio/mp4",
            "wav" => "audio/wav",
            "ogg" => "audio/ogg",
            "flac" => "audio/flac",
            "ttf" => "font/ttf",
            "otf" => "font/otf",
            _ => "font/woff2",
        };
        let result = (|| {
            let mut source = fs::File::open(&path).map_err(err)?;
            let mut destination_file = fs::OpenOptions::new()
                .create_new(true)
                .write(true)
                .open(&destination)
                .map_err(err)?;
            std::io::copy(
                &mut ProgressReader::new(&mut source, Some(&operation)),
                &mut destination_file,
            )
            .map_err(err)?;
            destination_file.sync_all().map_err(err)?;
            operation.check()?;
            connect(&dir)?
                .execute(
                    "INSERT INTO assets(id,original_name,internal_path,preview_path,bytes,mime)
                 VALUES (?1,?2,?3,?3,?4,?5)",
                    params![id, title, relative, bytes as i64, mime],
                )
                .map_err(err)?;
            Ok::<_, String>(())
        })();
        if result.is_err() {
            let _ = fs::remove_file(destination);
        }
        result?;
        Ok(Some(ImportedMedia {
            asset_id: id,
            title,
            kind,
        }))
    })
    .await
    .map_err(err)?
}
#[tauri::command]
pub async fn asset_path(app: AppHandle, asset_id: String, preview: bool) -> Result<String> {
    validate_asset_id(&asset_id)?;
    let dir = directory(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let conn = connect(&dir)?;
        let column = if preview {
            "preview_path"
        } else {
            "internal_path"
        };
        let relative: String = conn
            .query_row(
                &format!("SELECT {column} FROM assets WHERE id=?1"),
                [asset_id],
                |r| r.get(0),
            )
            .map_err(err)?;
        let path = safe_asset_path(&dir, &relative)?;
        if !path.is_file() {
            return Err("Вложение не найдено. Восстановите его из архива.".into());
        }
        Ok(path.to_string_lossy().into_owned())
    })
    .await
    .map_err(err)?
}
#[tauri::command]
pub async fn open_asset(app: AppHandle, asset_id: String, reveal: bool) -> Result<()> {
    use tauri_plugin_opener::OpenerExt;
    let path = asset_path(app.clone(), asset_id, false).await?;
    if reveal {
        app.opener().reveal_item_in_dir(path).map_err(err)
    } else {
        app.opener().open_path(path, None::<&str>).map_err(err)
    }
}
#[tauri::command]
pub fn open_link(app: AppHandle, url: String) -> Result<()> {
    use tauri_plugin_opener::OpenerExt;
    if !(url.starts_with("https://") || url.starts_with("http://"))
        || url.contains('\n')
        || url.contains('\r')
    {
        return Err("Разрешены только http/https ссылки".into());
    }
    app.opener().open_url(url, None::<&str>).map_err(err)
}
#[derive(serde::Serialize)]
pub struct FontAsset {
    id: String,
    title: String,
}
#[tauri::command]
pub async fn list_fonts(app: AppHandle) -> Result<Vec<FontAsset>> {
    let dir = directory(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let conn = connect(&dir)?;
        let mut q = conn
            .prepare(
                "SELECT id,original_name FROM assets WHERE mime LIKE 'font/%' ORDER BY created_at",
            )
            .map_err(err)?;
        q.query_map([], |r| {
            Ok(FontAsset {
                id: r.get(0)?,
                title: r.get(1)?,
            })
        })
        .map_err(err)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(err)
    })
    .await
    .map_err(err)?
}
#[tauri::command]
pub async fn save_canvas_export(
    app: AppHandle,
    bytes: Vec<u8>,
    format: String,
) -> Result<Option<String>> {
    if bytes.len() > 100 * 1024 * 1024
        || !["png", "pdf"].contains(&format.as_str())
        || (format == "png" && !bytes.starts_with(b"\x89PNG\r\n\x1a\n"))
        || (format == "pdf" && !bytes.starts_with(b"%PDF-"))
    {
        return Err("Некорректный файл экспорта".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        use std::io::Write;
        let picked = app
            .dialog()
            .file()
            .set_title("Экспорт холста")
            .set_file_name(format!("Canvas-{}.{}", new_id(), format))
            .add_filter("Экспорт", &[&format])
            .blocking_save_file();
        let Some(picked) = picked else {
            return Ok(None);
        };
        let path = picked.into_path().map_err(err)?;
        let mut output = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&path)
            .map_err(err)?;
        if let Err(e) = output.write_all(&bytes).and_then(|_| output.sync_all()) {
            drop(output);
            let _ = fs::remove_file(&path);
            return Err(err(e));
        }
        Ok(Some(path.to_string_lossy().into_owned()))
    })
    .await
    .map_err(err)?
}
#[tauri::command]
pub async fn import_url(
    app: AppHandle,
    url: String,
    kind: String,
    operation_id: Option<String>,
) -> Result<ImportedMedia> {
    use crate::operations::{Operation, cancelled};
    use std::io::Write;
    if !["image", "video", "audio"].contains(&kind.as_str()) {
        return Err("Неизвестный тип медиа".into());
    }
    let parsed = tauri::Url::parse(&url).map_err(err)?;
    if !["http", "https"].contains(&parsed.scheme())
        || !parsed.username().is_empty()
        || parsed.password().is_some()
    {
        return Err("Введите прямой http/https адрес без логина и пароля".into());
    }
    let (operation, mut cancel) = Operation::start(&app, operation_id)?;
    operation.progress(0, None);
    let dir = directory(&app)?;
    let client = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(15))
        .timeout(std::time::Duration::from_secs(300))
        .redirect(reqwest::redirect::Policy::limited(5))
        .build()
        .map_err(err)?;
    let response = tokio::select! {
        _ = cancelled(&mut cancel) => return Err("Загрузка отменена".into()),
        response = client.get(parsed).send() => response.map_err(|e| format!("Загрузка недоступна: {e}. Можно сохранить адрес как ссылку."))?
    };
    let mut response = response.error_for_status().map_err(err)?;
    let mime = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .split(';')
        .next()
        .unwrap_or("")
        .to_lowercase();
    let (ext, actual) = match mime.as_str() {
        "image/png" => ("png", "image"), "image/jpeg" => ("jpg", "image"), "image/gif" => ("gif", "image"), "image/webp" => ("webp", "image"),
        "video/mp4" => ("mp4", "video"), "video/webm" => ("webm", "video"), "video/quicktime" => ("mov", "video"),
        "audio/mpeg" => ("mp3", "audio"), "audio/mp4" => ("m4a", "audio"), "audio/wav" | "audio/x-wav" => ("wav", "audio"), "audio/ogg" => ("ogg", "audio"), "audio/flac" => ("flac", "audio"),
        _ => return Err("Адрес не возвращает поддерживаемый медиафайл. Страницы видеосервисов сохраняются как ссылки.".into())
    };
    if actual != kind {
        return Err("Тип файла по адресу не совпадает с выбранным.".into());
    }
    let limit = if kind == "image" {
        50_u64 * 1024 * 1024
    } else {
        500_u64 * 1024 * 1024
    };
    let size = response.content_length();
    if size.is_some_and(|n| n > limit) {
        return Err("Файл превышает лимит загрузки (фото 50 МБ, медиа 500 МБ).".into());
    }
    let id = new_id();
    let relative = format!("assets/{id}.{ext}");
    let path = dir.join(&relative);
    let title = format!("Загруженное медиа.{ext}");
    let mut file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&path)
        .map_err(err)?;
    let result = async {
        let mut total = 0_u64; let mut last = std::time::Instant::now();
        loop {
            let chunk = tokio::select! { _ = cancelled(&mut cancel) => return Err("Загрузка отменена".to_string()), chunk = response.chunk() => chunk.map_err(err)? };
            let Some(chunk) = chunk else { break; }; total += chunk.len() as u64;
            if total > limit { return Err("Файл превышает лимит загрузки".into()); }
            file.write_all(&chunk).map_err(err)?;
            if last.elapsed().as_millis() > 100 { operation.progress(total, size); last = std::time::Instant::now(); }
        }
        if *cancel.borrow() { return Err("Загрузка отменена".into()); }
        if total == 0 { return Err("Получен пустой файл".into()); }
        file.sync_all().map_err(err)?;
        connect(&dir)?.execute("INSERT INTO assets(id,original_name,internal_path,preview_path,bytes,mime) VALUES (?1,?2,?3,?3,?4,?5)", params![id,title,relative,total as i64,mime]).map_err(err)?;
        operation.progress(total, Some(total)); Ok(())
    }.await;
    drop(file);
    if let Err(error) = result {
        let _ = fs::remove_file(path);
        return Err(error);
    }
    Ok(ImportedMedia {
        asset_id: id,
        title,
        kind,
    })
}
