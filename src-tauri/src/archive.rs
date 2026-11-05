use crate::operations::{Operation, ProgressReader};
use crate::validation::{validate_asset_id, validate_id, validate_scene};
use crate::{
    media::{new_id, safe_asset_path},
    storage::{Result, connect, directory, err},
};
use rusqlite::{OptionalExtension, params};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, BTreeSet, HashMap},
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;
use zip::{ZipArchive, ZipWriter, write::SimpleFileOptions};
#[derive(Clone, Serialize, Deserialize)]
pub struct ArchivedScene {
    country_id: String,
    scene: Value,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct Asset {
    id: String,
    original_name: String,
    internal_path: String,
    preview_path: String,
    bytes: u64,
    mime: String,
    sha256: String,
    preview_sha256: String,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct Manifest {
    format: String,
    version: u32,
    scenes: Vec<ArchivedScene>,
    assets: Vec<Asset>,
    #[serde(default)]
    preferences: BTreeMap<String, Value>,
}
#[derive(Clone)]
pub struct Staged {
    dir: PathBuf,
    manifest: Manifest,
}
#[derive(Default)]
pub struct Imports(pub Mutex<HashMap<String, Staged>>);

pub(crate) const AUTOMATIC_BACKUP_LIMIT: usize = 5;
const AUTOMATIC_BACKUP_INTERVAL: Duration = Duration::from_secs(3600);

#[derive(Default)]
pub struct AutomaticBackups {
    running: Arc<AtomicBool>,
}

struct BackupPermit(Arc<AtomicBool>);

impl Drop for BackupPermit {
    fn drop(&mut self) {
        self.0.store(false, Ordering::Release);
    }
}

impl AutomaticBackups {
    fn spawn(
        &self,
        backup: impl FnOnce() -> Result<()> + Send + 'static,
        report_error: impl FnOnce(String) + Send + 'static,
    ) -> bool {
        if self
            .running
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .is_err()
        {
            return false;
        }
        let permit = BackupPermit(Arc::clone(&self.running));
        tauri::async_runtime::spawn_blocking(move || {
            let result = backup();
            drop(permit);
            if let Err(error) = result {
                report_error(error);
            }
        });
        true
    }
}

pub(crate) fn schedule_automatic_backup(app: AppHandle, dir: PathBuf) {
    let worker_app = app.clone();
    let warning_app = app.clone();
    app.state::<AutomaticBackups>().spawn(
        move || {
            if let Some(warning) = automatic_backup(&dir)? {
                use tauri::Emitter;
                let _ = warning_app.emit("atlas-backup-cleanup-warning", warning);
            }
            Ok(())
        },
        move |error| {
            use tauri::Emitter;
            let _ = worker_app.emit("atlas-backup-error", error);
        },
    );
}
fn checksum_with_operation(path: &Path, operation: Option<&Operation>) -> Result<String> {
    let mut f = ProgressReader::new(fs::File::open(path).map_err(err)?, operation);
    let mut h = Sha256::new();
    let mut b = [0; 65536];
    loop {
        let n = f.read(&mut b).map_err(err)?;
        if n == 0 {
            break;
        }
        h.update(&b[..n]);
    }
    Ok(format!("{:x}", h.finalize()))
}
fn scene_assets(s: &Value) -> BTreeSet<String> {
    fn collect(v: &Value, ids: &mut BTreeSet<String>) {
        match v {
            Value::Object(o) => {
                for (key, value) in o {
                    if ["assetId", "backgroundAssetId"].contains(&key.as_str()) {
                        if let Some(id) = value.as_str() {
                            ids.insert(id.to_owned());
                        }
                    } else if key == "fontFamily" {
                        if let Some(id) = value.as_str().and_then(|s| s.strip_prefix("AtlasFont-"))
                        {
                            ids.insert(id.to_owned());
                        }
                    } else {
                        collect(value, ids);
                    }
                }
            }
            Value::Array(a) => {
                for v in a {
                    collect(v, ids);
                }
            }
            _ => (),
        }
    }
    let mut ids = BTreeSet::new();
    collect(s, &mut ids);
    ids
}

fn remap(v: &mut Value, m: &BTreeMap<String, String>) {
    match v {
        Value::Object(o) => {
            for (k, v) in o {
                if ["assetId", "backgroundAssetId"].contains(&k.as_str()) {
                    if let Some(id) = v.as_str()
                        && let Some(new) = m.get(id)
                    {
                        *v = Value::String(new.clone());
                    }
                } else if k == "fontFamily" {
                    if let Some(new) = v
                        .as_str()
                        .and_then(|s| s.strip_prefix("AtlasFont-"))
                        .and_then(|id| m.get(id))
                    {
                        *v = Value::String(format!("AtlasFont-{new}"));
                    }
                } else {
                    remap(v, m);
                }
            }
        }
        Value::Array(a) => {
            for v in a {
                remap(v, m)
            }
        }
        _ => (),
    }
}
pub(crate) fn write_archive(dir: &Path, dest: &Path, country: Option<&str>) -> Result<()> {
    write_archive_with_operation(dir, dest, country, None)
}
fn write_archive_with_operation(
    dir: &Path,
    dest: &Path,
    country: Option<&str>,
    operation: Option<&Operation>,
) -> Result<()> {
    if let Some(op) = operation {
        op.check()?;
    }
    if dest.exists() {
        return Err("Файл уже существует. Выберите новое имя.".into());
    }
    let conn = connect(dir)?;
    conn.execute_batch("BEGIN").map_err(err)?;
    let mut scenes = Vec::new();
    let mut q = conn
        .prepare("SELECT country_id,scene_json FROM scenes ORDER BY country_id")
        .map_err(err)?;
    for row in q
        .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
        .map_err(err)?
    {
        let (id, raw) = row.map_err(err)?;
        if country.is_some_and(|c| c != id) {
            continue;
        }
        validate_scene(&raw)?;
        scenes.push(ArchivedScene {
            country_id: id,
            scene: serde_json::from_str(&raw).map_err(err)?,
        });
    }
    let mut preferences = BTreeMap::new();
    if country.is_none() {
        let mut q = conn
            .prepare("SELECT key,json FROM preferences WHERE key IN ('map','themes','table-styles','editor')")
            .map_err(err)?;
        for row in q
            .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
            .map_err(err)?
        {
            let (key, raw) = row.map_err(err)?;
            preferences.insert(key, serde_json::from_str(&raw).map_err(err)?);
        }
    }
    let needed: BTreeSet<_> = scenes
        .iter()
        .flat_map(|s| scene_assets(&s.scene))
        .chain(preferences.values().flat_map(scene_assets))
        .collect();
    let mut assets = Vec::new();
    let mut q = conn
        .prepare("SELECT id,original_name,internal_path,preview_path,bytes,mime FROM assets")
        .map_err(err)?;
    for row in q
        .query_map([], |r| {
            Ok(Asset {
                id: r.get(0)?,
                original_name: r.get(1)?,
                internal_path: r.get(2)?,
                preview_path: r.get(3)?,
                bytes: r.get::<_, i64>(4)? as u64,
                mime: r.get(5)?,
                sha256: String::new(),
                preview_sha256: String::new(),
            })
        })
        .map_err(err)?
    {
        let mut a = row.map_err(err)?;
        if !needed.contains(&a.id) {
            continue;
        }
        a.sha256 = checksum_with_operation(&safe_asset_path(dir, &a.internal_path)?, operation)?;
        a.preview_sha256 =
            checksum_with_operation(&safe_asset_path(dir, &a.preview_path)?, operation)?;
        assets.push(a);
    }
    if assets.len() != needed.len() {
        return Err("Отсутствуют вложения. Архив не создан.".into());
    }
    let manifest = Manifest {
        preferences,
        format: "atlas-canvas".into(),
        version: 1,
        scenes,
        assets,
    };
    let temporary = dest.with_extension(format!("{}.partial", new_id()));
    let result = (|| {
        let file = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)
            .map_err(err)?;
        let mut zip = ZipWriter::new(file);
        zip.start_file(
            "manifest.json",
            SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated),
        )
        .map_err(err)?;
        zip.write_all(&serde_json::to_vec(&manifest).map_err(err)?)
            .map_err(err)?;
        let mut files = BTreeSet::new();
        for a in &manifest.assets {
            files.insert(a.internal_path.clone());
            files.insert(a.preview_path.clone());
        }
        for relative in files {
            zip.start_file(
                &relative,
                SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored),
            )
            .map_err(err)?;
            let mut f = fs::File::open(safe_asset_path(dir, &relative)?).map_err(err)?;
            std::io::copy(&mut ProgressReader::new(&mut f, operation), &mut zip).map_err(err)?;
        }
        zip.finish().map_err(err)?.sync_all().map_err(err)?;
        if let Some(op) = operation {
            op.check()?;
        }
        if fs::hard_link(&temporary, dest).is_err() {
            let mut destination = fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(dest)
                .map_err(err)?;
            let mut source = fs::File::open(&temporary).map_err(err)?;
            if let Err(e) = std::io::copy(
                &mut ProgressReader::new(&mut source, operation),
                &mut destination,
            )
            .and_then(|_| destination.sync_all())
            {
                drop(destination);
                let _ = fs::remove_file(dest);
                return Err(err(e));
            }
        }
        Ok(())
    })();
    let _ = fs::remove_file(temporary);
    result
}
#[cfg(test)]
fn stage_archive(file: &Path, staging: &Path) -> Result<Manifest> {
    stage_archive_with_operation(file, staging, None)
}
fn stage_archive_with_operation(
    file: &Path,
    staging: &Path,
    operation: Option<&Operation>,
) -> Result<Manifest> {
    if let Some(op) = operation {
        op.check()?;
    }
    let mut zip = ZipArchive::new(fs::File::open(file).map_err(err)?).map_err(err)?;
    if zip.len() > 100000 {
        return Err("Слишком много файлов в архиве".into());
    }
    let f = zip.by_name("manifest.json").map_err(err)?;
    if f.size() > 32 * 1024 * 1024 {
        return Err("Манифест слишком большой".into());
    }
    let mut raw = Vec::new();
    f.take(32 * 1024 * 1024 + 1)
        .read_to_end(&mut raw)
        .map_err(err)?;
    let manifest: Manifest = serde_json::from_slice(&raw).map_err(err)?;
    if manifest.format != "atlas-canvas" || manifest.version != 1 {
        return Err("Неизвестная версия архива".into());
    }
    let mut ids = BTreeSet::new();
    for s in &manifest.scenes {
        validate_id(&s.country_id)?;
        validate_scene(&s.scene.to_string())?;
        if !ids.insert(s.country_id.clone()) {
            return Err("Повтор страны в архиве".into());
        }
    }
    let mut files = BTreeMap::new();
    let mut asset_ids = BTreeSet::new();
    let mut total = 0_u64;
    for a in &manifest.assets {
        validate_asset_id(&a.id)?;
        if !asset_ids.insert(a.id.clone()) {
            return Err("Повтор ID вложения".into());
        }
        for (name, hash) in [
            (&a.internal_path, &a.sha256),
            (&a.preview_path, &a.preview_sha256),
        ] {
            safe_asset_path(staging, name)?;
            let extension = Path::new(name)
                .extension()
                .and_then(|s| s.to_str())
                .unwrap_or("")
                .to_lowercase();
            if ![
                "png", "jpg", "jpeg", "webp", "gif", "mp4", "mov", "webm", "wav", "mp3", "m4a",
                "ogg", "flac", "ttf", "otf", "woff2",
            ]
            .contains(&extension.as_str())
            {
                return Err("Недопустимый формат вложения".into());
            }
            let filename = Path::new(name)
                .file_name()
                .and_then(|s| s.to_str())
                .unwrap_or("");
            if !filename.starts_with(&format!("{}.", a.id))
                || hash.len() != 64
                || !hash.bytes().all(|b| b.is_ascii_hexdigit())
            {
                return Err("Некорректное вложение".into());
            }
            if let Some(old) = files.insert(name.clone(), hash.clone())
                && old != *hash
            {
                return Err("Конфликт контрольных сумм".into());
            }
        }
    }
    for s in &manifest.scenes {
        if !scene_assets(&s.scene).is_subset(&asset_ids) {
            return Err("В архиве не хватает вложений".into());
        }
    }
    for (key, value) in &manifest.preferences {
        if !["map", "themes", "table-styles", "editor"].contains(&key.as_str())
            || !scene_assets(value).is_subset(&asset_ids)
        {
            return Err("Повреждены настройки архива или не хватает их вложений".into());
        }
        if key == "themes" {
            for preset in value.as_array().ok_or("Повреждена библиотека оформлений")?
            {
                validate_scene(&serde_json::json!({"schemaVersion":3,"items":[],"camera":{"x":0,"y":0,"scale":1},"theme":preset["theme"]}).to_string())?;
            }
        }
    }
    let mut names = BTreeSet::new();
    for i in 0..zip.len() {
        let f = zip.by_index(i).map_err(err)?;
        if !names.insert(f.name().to_owned())
            || (f.name() != "manifest.json" && !files.contains_key(f.name()))
        {
            return Err("Неожиданный или повторный файл в архиве".into());
        }
        total = total.checked_add(f.size()).ok_or("Архив слишком большой")?;
        if total > 20_u64 * 1024 * 1024 * 1024 {
            return Err("Архив превышает 20 ГБ".into());
        }
    }
    fs::create_dir_all(staging.join("assets")).map_err(err)?;
    for (name, hash) in &files {
        let f = zip.by_name(name).map_err(err)?;
        let expected = f.size();
        if expected > 8_u64 * 1024 * 1024 * 1024 {
            return Err("Вложение превышает 8 ГБ".into());
        }
        let path = safe_asset_path(staging, name)?;
        let mut output = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&path)
            .map_err(err)?;
        let bytes = std::io::copy(
            &mut ProgressReader::new(f.take(expected + 1), operation),
            &mut output,
        )
        .map_err(err)?;
        output.sync_all().map_err(err)?;
        drop(output);
        if bytes != expected || checksum_with_operation(&path, operation)? != *hash {
            return Err(format!("Нарушена целостность файла {name}"));
        }
    }
    Ok(manifest)
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CountryPreview {
    country_id: String,
    count: usize,
    conflict: bool,
}
#[derive(Serialize)]
pub struct Preview {
    token: String,
    countries: Vec<CountryPreview>,
    assets: usize,
}
#[tauri::command]
pub async fn export_atlas(
    app: AppHandle,
    country_id: Option<String>,
    operation_id: Option<String>,
) -> Result<Option<String>> {
    let (operation, _) = Operation::start(&app, operation_id)?;
    tauri::async_runtime::spawn_blocking(move || {
        if let Some(id) = &country_id {
            validate_id(id)?;
        }
        let picked = app
            .dialog()
            .file()
            .set_title(crate::language::text("Экспорт атласа", "Export atlas"))
            .set_file_name(format!("Atlas-{}.atlas", new_id()))
            .add_filter("Atlas Canvas", &["atlas"])
            .blocking_save_file();
        let Some(picked) = picked else {
            return Ok(None);
        };
        let path = picked.into_path().map_err(err)?;
        write_archive_with_operation(
            &directory(&app)?,
            &path,
            country_id.as_deref(),
            Some(&operation),
        )?;
        Ok(Some(path.to_string_lossy().into_owned()))
    })
    .await
    .map_err(err)?
}
#[tauri::command]
pub async fn inspect_archive(
    app: AppHandle,
    state: State<'_, Imports>,
    operation_id: Option<String>,
) -> Result<Option<Preview>> {
    let (operation, _) = Operation::start(&app, operation_id)?;
    let handle = app.clone();
    let staged = tauri::async_runtime::spawn_blocking(move || {
        let picked = handle
            .dialog()
            .file()
            .set_title(crate::language::text(
                "Восстановить архив атласа",
                "Restore atlas backup",
            ))
            .add_filter("Atlas Canvas", &["atlas", "zip"])
            .blocking_pick_file();
        let Some(picked) = picked else {
            return Ok::<_, String>(None);
        };
        let path = picked.into_path().map_err(err)?;
        let dir = directory(&handle)?.join("imports").join(new_id());
        match stage_archive_with_operation(&path, &dir, Some(&operation)) {
            Ok(manifest) => Ok(Some(Staged { dir, manifest })),
            Err(e) => {
                let _ = fs::remove_dir_all(dir);
                Err(e)
            }
        }
    })
    .await
    .map_err(err)??;
    let Some(staged) = staged else {
        return Ok(None);
    };
    let conn = connect(&directory(&app)?)?;
    let mut countries = Vec::new();
    for s in &staged.manifest.scenes {
        let conflict: bool = conn
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM scenes WHERE country_id=?1)",
                [&s.country_id],
                |r| r.get(0),
            )
            .map_err(err)?;
        countries.push(CountryPreview {
            country_id: s.country_id.clone(),
            count: s.scene["items"].as_array().map_or(0, |v| v.len()),
            conflict,
        });
    }
    let token = new_id();
    let assets = staged.manifest.assets.len();
    state.0.lock().map_err(err)?.insert(token.clone(), staged);
    Ok(Some(Preview {
        token,
        countries,
        assets,
    }))
}
#[tauri::command]
pub fn cancel_archive(state: State<'_, Imports>, token: String) -> Result<()> {
    if let Some(s) = state.0.lock().map_err(err)?.remove(&token) {
        fs::remove_dir_all(s.dir).map_err(err)?;
    }
    Ok(())
}
#[derive(Serialize)]
pub struct ImportResult {
    imported: usize,
    skipped: usize,
    backup: Option<String>,
}
#[cfg(test)]
pub(crate) fn apply_staged(dir: &Path, staged: &Staged, replace: bool) -> Result<ImportResult> {
    apply_staged_with_operation(dir, staged, replace, None)
}
fn apply_staged_with_operation(
    dir: &Path,
    staged: &Staged,
    replace: bool,
    operation: Option<&Operation>,
) -> Result<ImportResult> {
    if let Some(op) = operation {
        op.check()?;
    }
    let mut conn = connect(dir)?;
    let mut chosen = Vec::new();
    let mut skipped = 0;
    for s in &staged.manifest.scenes {
        let exists: bool = conn
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM scenes WHERE country_id=?1)",
                [&s.country_id],
                |r| r.get(0),
            )
            .map_err(err)?;
        if exists && !replace {
            skipped += 1;
        } else {
            chosen.push(s.clone());
        }
    }
    let preferences: BTreeMap<_, _> = staged
        .manifest
        .preferences
        .iter()
        .filter_map(|(key, value)| {
            let exists: std::result::Result<bool, _> = conn.query_row(
                "SELECT EXISTS(SELECT 1 FROM preferences WHERE key=?1)",
                [key],
                |r| r.get(0),
            );
            match exists {
                Ok(true) if !replace => None,
                _ => Some((key.clone(), value.clone())),
            }
        })
        .collect();
    if chosen.is_empty() && preferences.is_empty() {
        return Ok(ImportResult {
            imported: 0,
            skipped,
            backup: None,
        });
    }
    fs::create_dir_all(dir.join("backups")).map_err(err)?;
    let mut backup = dir
        .join("backups")
        .join(format!("before-import-{}.atlas", new_id()));
    if let Err(reason) = write_archive_with_operation(dir, &backup, None, operation) {
        if let Some(op) = operation {
            op.check()?;
        }
        // A damaged scene or missing attachment must not prevent importing a healthy backup.
        // Preserve the raw database and all remaining files before replacing any rows.
        backup = dir.join("backups").join(format!("recovery-{}", new_id()));
        fs::create_dir_all(backup.join("assets")).map_err(err)?;
        conn.execute(
            "VACUUM INTO ?1",
            [backup.join("atlas.sqlite3").to_string_lossy().as_ref()],
        )
        .map_err(err)?;
        for entry in fs::read_dir(dir.join("assets")).map_err(err)? {
            let entry = entry.map_err(err)?;
            if entry.file_type().map_err(err)?.is_file() {
                let source = fs::File::open(entry.path()).map_err(err)?;
                let mut output = fs::OpenOptions::new()
                    .write(true)
                    .create_new(true)
                    .open(backup.join("assets").join(entry.file_name()))
                    .map_err(err)?;
                std::io::copy(&mut ProgressReader::new(source, operation), &mut output)
                    .map_err(err)?;
                output.sync_all().map_err(err)?;
            }
        }
        fs::write(backup.join("README.txt"), format!("Raw recovery snapshot, not a portable .atlas archive. Preserved before import because: {reason}")).map_err(err)?;
    }
    let needed: BTreeSet<_> = chosen
        .iter()
        .flat_map(|s| scene_assets(&s.scene))
        .chain(preferences.values().flat_map(scene_assets))
        .collect();
    let mut mapping = BTreeMap::new();
    let mut copied = Vec::new();
    let result = (|| {
        let tx = conn.transaction().map_err(err)?;
        for a in staged
            .manifest
            .assets
            .iter()
            .filter(|a| needed.contains(&a.id))
        {
            let id = new_id();
            mapping.insert(a.id.clone(), id.clone());
            let mut paths = Vec::new();
            for name in [&a.internal_path, &a.preview_path] {
                let suffix = name
                    .split_once(&a.id)
                    .map(|(_, s)| s)
                    .ok_or("Некорректное имя файла")?;
                let relative = format!("assets/{id}{suffix}");
                let dest = safe_asset_path(dir, &relative)?;
                if !copied.contains(&dest) {
                    let mut input =
                        fs::File::open(safe_asset_path(&staged.dir, name)?).map_err(err)?;
                    let mut output = fs::OpenOptions::new()
                        .create_new(true)
                        .write(true)
                        .open(&dest)
                        .map_err(err)?;
                    copied.push(dest.clone());
                    std::io::copy(&mut ProgressReader::new(&mut input, operation), &mut output)
                        .map_err(err)?;
                    output.sync_all().map_err(err)?;
                }
                paths.push(relative);
            }
            tx.execute(
                "INSERT INTO assets(id, original_name, internal_path, preview_path, bytes, mime)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![
                    id,
                    a.original_name,
                    paths[0],
                    paths[1],
                    a.bytes as i64,
                    a.mime
                ],
            )
            .map_err(err)?;
        }
        for s in &mut chosen {
            remap(&mut s.scene, &mapping);
            let raw = s.scene.to_string();
            let filled = validate_scene(&raw)?;
            let old: Option<String> = tx
                .query_row(
                    "SELECT scene_json FROM scenes WHERE country_id=?1",
                    [&s.country_id],
                    |r| r.get(0),
                )
                .optional()
                .map_err(err)?;
            if let Some(old) = old {
                tx.execute(
                    "INSERT INTO scene_revisions(country_id,scene_json) VALUES (?1,?2)",
                    params![s.country_id, old],
                )
                .map_err(err)?;
            }
            let version = s.scene["schemaVersion"].as_i64().unwrap();
            tx.execute(
                crate::storage::UPSERT_SCENE,
                params![s.country_id, raw, filled, version],
            )
            .map_err(err)?;
        }
        for (key, mut value) in preferences.clone() {
            remap(&mut value, &mapping);
            tx.execute("INSERT INTO preferences(key,json) VALUES (?1,?2) ON CONFLICT(key) DO UPDATE SET json=excluded.json", params![key,value.to_string()]).map_err(err)?;
        }
        if let Some(op) = operation {
            op.check()?;
        }
        tx.commit().map_err(err)?;
        Ok::<_, String>(())
    })();
    if result.is_err() {
        for path in copied {
            let _ = fs::remove_file(path);
        }
    }
    result?;
    Ok(ImportResult {
        imported: chosen.len(),
        skipped,
        backup: Some(backup.to_string_lossy().into_owned()),
    })
}
#[tauri::command]
pub async fn apply_archive(
    app: AppHandle,
    state: State<'_, Imports>,
    token: String,
    replace: bool,
    operation_id: Option<String>,
) -> Result<ImportResult> {
    let (operation, _) = Operation::start(&app, operation_id)?;
    let staged = state
        .0
        .lock()
        .map_err(err)?
        .get(&token)
        .cloned()
        .ok_or("Выберите архив заново")?;
    let dir = directory(&app)?;
    let result = tauri::async_runtime::spawn_blocking(move || {
        apply_staged_with_operation(&dir, &staged, replace, Some(&operation))
    })
    .await
    .map_err(err)??;
    if let Some(s) = state.0.lock().map_err(err)?.remove(&token) {
        let _ = fs::remove_dir_all(s.dir);
    }
    Ok(result)
}

// Cleanup warnings do not block archive creation and are also returned when a copy is skipped.
fn automatic_backup(dir: &Path) -> Result<Option<String>> {
    automatic_backup_using(
        dir,
        |dir, dest| write_archive(dir, dest, None),
        |path| fs::remove_file(path),
    )
}

fn remove_orphaned_auto_temp_files(
    folder: &Path,
    remove: &mut impl FnMut(&Path) -> std::io::Result<()>,
) -> Vec<String> {
    let entries = match fs::read_dir(folder) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Vec::new(),
        Err(error) => return vec![err(error)],
    };
    let mut errors = Vec::new();
    // Called under BackupPermit, before this worker creates any temporary files.
    for entry in entries {
        let result: Result<()> = (|| {
            let entry = entry.map_err(err)?;
            if entry.file_name().to_str().is_some_and(|name| {
                name.starts_with(".auto-")
                    && (name.ends_with(".pending") || name.ends_with(".partial"))
            }) && entry.file_type().map_err(err)?.is_file()
            {
                remove(&entry.path())
                    .map_err(|error| format!("{}: {error}", entry.path().display()))?;
            }
            Ok(())
        })();
        if let Err(error) = result {
            errors.push(error);
        }
    }
    errors
}

struct AutomaticBackupFile {
    path: PathBuf,
    modified: SystemTime,
}

fn automatic_backup_files(folder: &Path) -> Result<Vec<AutomaticBackupFile>> {
    let mut backups = Vec::new();
    for entry in fs::read_dir(folder).map_err(err)? {
        let entry = entry.map_err(err)?;
        let name = entry.file_name();
        if !name
            .to_str()
            .is_some_and(|name| name.starts_with("auto-") && name.ends_with(".atlas"))
            || !entry.file_type().map_err(err)?.is_file()
        {
            continue;
        }
        backups.push(AutomaticBackupFile {
            path: entry.path(),
            modified: entry.metadata().map_err(err)?.modified().map_err(err)?,
        });
    }
    backups.sort_by(|a, b| a.modified.cmp(&b.modified).then(a.path.cmp(&b.path)));
    Ok(backups)
}

fn automatic_backup_using(
    dir: &Path,
    write: impl FnOnce(&Path, &Path) -> Result<()>,
    mut remove_file: impl FnMut(&Path) -> std::io::Result<()>,
) -> Result<Option<String>> {
    let folder = dir.join("backups");
    let mut cleanup_errors = remove_orphaned_auto_temp_files(&folder, &mut remove_file);
    let conn = connect(dir)?;
    let has_content: bool = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM scenes WHERE has_content=1)",
            [],
            |r| r.get(0),
        )
        .map_err(err)?;
    if !has_content {
        return Ok(cleanup_warning(cleanup_errors));
    }
    let latest_change: Option<f64> = conn
        .query_row(
            "SELECT (julianday(MAX(updated_at)) - 2440587.5) * 86400.0 FROM scenes",
            [],
            |r| r.get(0),
        )
        .map_err(err)?;
    let latest_change =
        latest_change.ok_or("Не удалось определить время последнего изменения холста.")?;
    fs::create_dir_all(&folder).map_err(err)?;
    if let Some(recent) = automatic_backup_files(&folder)?.last()
        && (recent
            .modified
            .elapsed()
            .map_or(true, |elapsed| elapsed < AUTOMATIC_BACKUP_INTERVAL)
            || latest_change
                <= recent
                    .modified
                    .duration_since(UNIX_EPOCH)
                    .map_err(err)?
                    .as_secs_f64())
    {
        return Ok(cleanup_warning(cleanup_errors));
    }
    drop(conn);

    let id = new_id();
    let destination = folder.join(format!("auto-{id}.atlas"));
    let pending = folder.join(format!(".auto-{id}.pending"));
    // Saves may continue during the archive's read transaction. Completion time would
    // incorrectly mark those newer changes as already backed up.
    let started = SystemTime::now();
    let result = (|| {
        write(dir, &pending)?;
        fs::OpenOptions::new()
            .write(true)
            .open(&pending)
            .map_err(err)?
            .set_modified(started)
            .map_err(err)?;
        // The final auto-*.atlas name is visible only after all writes have succeeded,
        // including on filesystems where write_archive falls back from hard links.
        fs::rename(&pending, &destination).map_err(err)
    })();
    if let Err(error) = result {
        let _ = fs::remove_file(pending);
        return Err(error);
    }

    // A pruning error must not be reported as a failed archive write.
    let cleanup: Result<()> = (|| {
        for old in automatic_backup_files(&folder)?
            .into_iter()
            .rev()
            .skip(AUTOMATIC_BACKUP_LIMIT)
        {
            remove_file(&old.path).map_err(err)?;
        }
        Ok(())
    })();
    if let Err(error) = cleanup {
        cleanup_errors.push(error);
    }
    Ok(cleanup_warning(cleanup_errors))
}

fn cleanup_warning(errors: Vec<String>) -> Option<String> {
    if errors.is_empty() {
        None
    } else {
        Some(errors.join("\n"))
    }
}

#[tauri::command]
pub fn open_backup_folder(app: AppHandle) -> Result<()> {
    use tauri_plugin_opener::OpenerExt;
    let folder = directory(&app)?.join("backups");
    fs::create_dir_all(&folder).map_err(err)?;
    app.opener()
        .open_path(folder.to_string_lossy().as_ref(), None::<&str>)
        .map_err(err)
}

#[cfg(test)]
#[path = "archive/failure_tests.rs"]
mod failure_tests;
#[cfg(test)]
#[path = "archive/tests.rs"]
mod tests;
