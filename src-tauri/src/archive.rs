use crate::{
    media::{new_id, safe_asset_path},
    storage::{Result, connect, directory, err, validate_asset_id, validate_id, validate_scene},
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
    sync::Mutex,
};
use tauri::{AppHandle, State};
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
}
#[derive(Clone)]
pub struct Staged {
    dir: PathBuf,
    manifest: Manifest,
}
#[derive(Default)]
pub struct Imports(pub Mutex<HashMap<String, Staged>>);
fn checksum(path: &Path) -> Result<String> {
    let mut f = fs::File::open(path).map_err(err)?;
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
    let mut ids = BTreeSet::new();
    if let Some(items) = s["items"].as_array() {
        for i in items {
            if let Some(id) = i["assetId"].as_str() {
                ids.insert(id.to_owned());
            }
        }
    }
    if let Some(id) = s["theme"]["backgroundAssetId"].as_str() {
        ids.insert(id.to_owned());
    }
    if let Some(family) = s["theme"]["fontFamily"].as_str() {
        if let Some(id) = family.strip_prefix("AtlasFont-") {
            ids.insert(id.to_owned());
        }
    }
    if let Some(items) = s["items"].as_array() {
        for i in items {
            if let Some(family) = i["fontFamily"].as_str() {
                if let Some(id) = family.strip_prefix("AtlasFont-") {
                    ids.insert(id.to_owned());
                }
            }
        }
    }
    ids
}
fn remap(v: &mut Value, m: &BTreeMap<String, String>) {
    match v {
        Value::Object(o) => {
            for (k, v) in o {
                if ["assetId", "backgroundAssetId"].contains(&k.as_str()) {
                    if let Some(id) = v.as_str() {
                        if let Some(new) = m.get(id) {
                            *v = Value::String(new.clone());
                        }
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
        Value::String(s) => {
            if let Some(id) = s.strip_prefix("AtlasFont-") {
                if let Some(new) = m.get(id) {
                    *s = format!("AtlasFont-{new}");
                }
            }
        }
        _ => (),
    }
}
pub(crate) fn write_archive(dir: &Path, dest: &Path, country: Option<&str>) -> Result<()> {
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
    let needed: BTreeSet<_> = scenes.iter().flat_map(|s| scene_assets(&s.scene)).collect();
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
        a.sha256 = checksum(&safe_asset_path(dir, &a.internal_path)?)?;
        a.preview_sha256 = checksum(&safe_asset_path(dir, &a.preview_path)?)?;
        assets.push(a);
    }
    if assets.len() != needed.len() {
        return Err("Отсутствуют вложения. Архив не создан.".into());
    }
    let manifest = Manifest {
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
            std::io::copy(&mut f, &mut zip).map_err(err)?;
        }
        zip.finish().map_err(err)?.sync_all().map_err(err)?;
        if fs::hard_link(&temporary, dest).is_err() {
            let mut destination = fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(dest)
                .map_err(err)?;
            let mut source = fs::File::open(&temporary).map_err(err)?;
            if let Err(e) =
                std::io::copy(&mut source, &mut destination).and_then(|_| destination.sync_all())
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
fn stage_archive(file: &Path, staging: &Path) -> Result<Manifest> {
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
            if let Some(old) = files.insert(name.clone(), hash.clone()) {
                if old != *hash {
                    return Err("Конфликт контрольных сумм".into());
                }
            }
        }
    }
    for s in &manifest.scenes {
        if !scene_assets(&s.scene).is_subset(&asset_ids) {
            return Err("В архиве не хватает вложений".into());
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
        let bytes = std::io::copy(&mut f.take(expected + 1), &mut output).map_err(err)?;
        output.sync_all().map_err(err)?;
        drop(output);
        if bytes != expected || checksum(&path)? != *hash {
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
pub async fn export_atlas(app: AppHandle, country_id: Option<String>) -> Result<Option<String>> {
    tauri::async_runtime::spawn_blocking(move || {
        if let Some(id) = &country_id {
            validate_id(id)?;
        }
        let picked = app
            .dialog()
            .file()
            .set_title("Экспорт атласа")
            .set_file_name(format!("Atlas-{}.atlas", new_id()))
            .add_filter("Atlas Canvas", &["atlas"])
            .blocking_save_file();
        let Some(picked) = picked else {
            return Ok(None);
        };
        let path = picked.into_path().map_err(err)?;
        write_archive(&directory(&app)?, &path, country_id.as_deref())?;
        Ok(Some(path.to_string_lossy().into_owned()))
    })
    .await
    .map_err(err)?
}
#[tauri::command]
pub async fn inspect_archive(app: AppHandle, state: State<'_, Imports>) -> Result<Option<Preview>> {
    let handle = app.clone();
    let staged = tauri::async_runtime::spawn_blocking(move || {
        let picked = handle
            .dialog()
            .file()
            .set_title("Восстановить архив атласа")
            .add_filter("Atlas Canvas", &["atlas", "zip"])
            .blocking_pick_file();
        let Some(picked) = picked else {
            return Ok::<_, String>(None);
        };
        let path = picked.into_path().map_err(err)?;
        let dir = directory(&handle)?.join("imports").join(new_id());
        match stage_archive(&path, &dir) {
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
pub(crate) fn apply_staged(dir: &Path, staged: &Staged, replace: bool) -> Result<ImportResult> {
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
    if chosen.is_empty() {
        return Ok(ImportResult {
            imported: 0,
            skipped,
            backup: None,
        });
    }
    fs::create_dir_all(dir.join("backups")).map_err(err)?;
    let backup = dir
        .join("backups")
        .join(format!("before-import-{}.atlas", new_id()));
    write_archive(dir, &backup, None)?;
    let needed: BTreeSet<_> = chosen.iter().flat_map(|s| scene_assets(&s.scene)).collect();
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
                    std::io::copy(&mut input, &mut output).map_err(err)?;
                    output.sync_all().map_err(err)?;
                }
                paths.push(relative);
            }
            tx.execute("INSERT INTO assets(id,original_name,internal_path,preview_path,bytes,mime) VALUES (?1,?2,?3,?4,?5,?6)",params![id,a.original_name,paths[0],paths[1],a.bytes as i64,a.mime]).map_err(err)?;
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
            tx.execute("INSERT INTO scenes(country_id,schema_version,scene_json,has_content) VALUES (?1,3,?2,?3) ON CONFLICT(country_id) DO UPDATE SET schema_version=3,scene_json=excluded.scene_json,has_content=excluded.has_content,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')",params![s.country_id,raw,filled]).map_err(err)?;
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
) -> Result<ImportResult> {
    let staged = state
        .0
        .lock()
        .map_err(err)?
        .get(&token)
        .cloned()
        .ok_or("Выберите архив заново")?;
    let dir = directory(&app)?;
    let result = tauri::async_runtime::spawn_blocking(move || apply_staged(&dir, &staged, replace))
        .await
        .map_err(err)??;
    if let Some(s) = state.0.lock().map_err(err)?.remove(&token) {
        let _ = fs::remove_dir_all(s.dir);
    }
    Ok(result)
}

pub(crate) fn automatic_backup(dir: &Path) -> Result<()> {
    let conn = connect(dir)?;
    let has_content: bool = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM scenes WHERE has_content=1)",
            [],
            |r| r.get(0),
        )
        .map_err(err)?;
    if !has_content {
        return Ok(());
    }
    drop(conn);
    let folder = dir.join("backups");
    fs::create_dir_all(&folder).map_err(err)?;
    let recent = fs::read_dir(&folder)
        .map_err(err)?
        .filter_map(|e| e.ok())
        .filter(|e| e.file_name().to_string_lossy().starts_with("auto-"))
        .filter_map(|e| e.metadata().ok()?.modified().ok())
        .max();
    if recent.is_some_and(|t| t.elapsed().map_or(true, |d| d.as_secs() < 3600)) {
        return Ok(());
    }
    write_archive(dir, &folder.join(format!("auto-{}.atlas", new_id())), None)
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
mod tests {
    use super::*;
    use crate::storage::{read_scene, write_scene};
    fn dir() -> PathBuf {
        let p = std::env::temp_dir().join(format!("atlas-archive-{}", new_id()));
        fs::create_dir_all(p.join("assets")).unwrap();
        p
    }
    fn raw(asset: Option<&str>) -> String {
        serde_json::json!({"schemaVersion":3,"items":asset.map(|id|vec![serde_json::json!({"id":"photo","kind":"image","assetId":id,"x":-15,"y":27})]).unwrap_or_else(||vec![serde_json::json!({"id":"note","kind":"note","content":"Казахстан","x":1,"y":2})]),"camera":{"x":5,"y":10,"scale":0.8},"theme":{"background":"#ffffff","pattern":"dots","fontFamily":"Arial"}}).to_string()
    }
    fn seed(path: &Path) -> String {
        let id = new_id();
        let relative = format!("assets/{id}.png");
        fs::write(path.join(&relative), b"PNG test original bytes").unwrap();
        let mut conn = connect(path).unwrap();
        conn.execute("INSERT INTO assets(id,original_name,internal_path,preview_path,bytes,mime) VALUES (?1,'photo.png',?2,?2,23,'image/png')",params![id,relative]).unwrap();
        write_scene(&mut conn, "398", &raw(Some(&id)), None).unwrap();
        id
    }
    #[test]
    fn roundtrip_restores_media_and_camera_on_another_database() {
        let source = dir();
        let original = seed(&source);
        let archive = source.join("export.atlas");
        write_archive(&source, &archive, None).unwrap();
        let target = dir();
        let staged_dir = target.join("stage");
        let manifest = stage_archive(&archive, &staged_dir).unwrap();
        let result = apply_staged(
            &target,
            &Staged {
                dir: staged_dir,
                manifest,
            },
            false,
        )
        .unwrap();
        assert_eq!(result.imported, 1);
        assert!(Path::new(result.backup.as_ref().unwrap()).is_file());
        let conn = connect(&target).unwrap();
        let scene: Value =
            serde_json::from_str(&read_scene(&conn, "398").unwrap().unwrap()).unwrap();
        let id = scene["items"][0]["assetId"].as_str().unwrap();
        assert_ne!(id, original);
        let relative: String = conn
            .query_row("SELECT internal_path FROM assets WHERE id=?1", [id], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(
            fs::read(target.join(relative)).unwrap(),
            b"PNG test original bytes"
        );
        assert_eq!(scene["camera"]["scale"], 0.8);
        drop(conn);
        fs::remove_dir_all(source).unwrap();
        fs::remove_dir_all(target).unwrap();
    }
    #[test]
    fn existing_countries_are_skipped_unless_replace_is_explicit() {
        let source = dir();
        seed(&source);
        let archive = source.join("export.atlas");
        write_archive(&source, &archive, None).unwrap();
        let target = dir();
        let mut conn = connect(&target).unwrap();
        let old = raw(None);
        write_scene(&mut conn, "398", &old, None).unwrap();
        drop(conn);
        let stage = target.join("stage");
        let manifest = stage_archive(&archive, &stage).unwrap();
        let staged = Staged {
            dir: stage,
            manifest,
        };
        let skipped = apply_staged(&target, &staged, false).unwrap();
        assert_eq!(skipped.skipped, 1);
        assert_eq!(
            read_scene(&connect(&target).unwrap(), "398")
                .unwrap()
                .unwrap(),
            old
        );
        assert_eq!(apply_staged(&target, &staged, true).unwrap().imported, 1);
        assert!(
            connect(&target)
                .unwrap()
                .query_row("SELECT count(*) FROM scene_revisions", [], |r| r
                    .get::<_, i64>(0))
                .unwrap()
                > 0
        );
        fs::remove_dir_all(source).unwrap();
        fs::remove_dir_all(target).unwrap();
    }
    #[test]
    fn rejects_tampered_media_and_path_traversal_before_restore() {
        let source = dir();
        seed(&source);
        let archive = source.join("export.atlas");
        write_archive(&source, &archive, None).unwrap();
        let mut zip = ZipArchive::new(fs::File::open(&archive).unwrap()).unwrap();
        let bad = source.join("bad.atlas");
        let mut writer = ZipWriter::new(fs::File::create(&bad).unwrap());
        for i in 0..zip.len() {
            let mut f = zip.by_index(i).unwrap();
            let name = f.name().to_owned();
            let mut bytes = Vec::new();
            f.read_to_end(&mut bytes).unwrap();
            if name.starts_with("assets/") {
                bytes.push(7);
            }
            writer
                .start_file(name, SimpleFileOptions::default())
                .unwrap();
            writer.write_all(&bytes).unwrap();
        }
        writer.finish().unwrap();
        assert!(stage_archive(&bad, &source.join("bad-stage")).is_err());
        assert!(safe_asset_path(&source, "assets/../../outside").is_err());
        assert!(safe_asset_path(&source, "assets\\..\\outside").is_err());
        fs::remove_dir_all(source).unwrap();
    }
    #[test]
    fn automatic_backup_keeps_a_valid_archive_without_repeating_every_save() {
        let source = dir();
        seed(&source);
        automatic_backup(&source).unwrap();
        automatic_backup(&source).unwrap();
        let files: Vec<_> = fs::read_dir(source.join("backups")).unwrap().collect();
        assert_eq!(files.len(), 1);
        fs::remove_dir_all(source).unwrap();
    }
}

#[cfg(test)]
mod failure_tests {
    use super::*;
    #[test]
    fn failed_restore_rolls_back_metadata_and_removes_new_files() {
        let source = std::env::temp_dir().join(new_id());
        let target = std::env::temp_dir().join(new_id());
        fs::create_dir_all(source.join("assets")).unwrap();
        fs::create_dir_all(target.join("assets")).unwrap();
        let id = new_id();
        let relative = format!("assets/{id}.png");
        fs::write(source.join(&relative), b"image bytes").unwrap();
        let base=serde_json::json!({"schemaVersion":3,"camera":{"x":0,"y":0,"scale":1},"theme":{"background":"#ffffff","pattern":"none","fontFamily":"Arial"},"items":[{"id":"a","kind":"image","x":0,"y":0,"assetId":id}]}).to_string();
        let mut conn = connect(&source).unwrap();
        conn.execute("INSERT INTO assets(id,original_name,internal_path,preview_path,bytes,mime) VALUES (?1,'test.png',?2,?2,11,'image/png')",params![id,relative]).unwrap();
        crate::storage::write_scene(&mut conn, "398", &base, None).unwrap();
        drop(conn);
        let archive = source.join("export.atlas");
        write_archive(&source, &archive, None).unwrap();
        let mut conn = connect(&target).unwrap();
        let mut old: Value = serde_json::from_str(&base).unwrap();
        old["items"] = serde_json::json!([]);
        let old = old.to_string();
        crate::storage::write_scene(&mut conn, "398", &old, None).unwrap();
        conn.execute_batch("CREATE TRIGGER reject_restore BEFORE UPDATE ON scenes BEGIN SELECT RAISE(ABORT,'failure'); END;").unwrap();
        drop(conn);
        let stage = target.join("staged");
        let manifest = stage_archive(&archive, &stage).unwrap();
        assert!(
            apply_staged(
                &target,
                &Staged {
                    dir: stage,
                    manifest
                },
                true
            )
            .is_err()
        );
        let conn = connect(&target).unwrap();
        assert_eq!(
            crate::storage::read_scene(&conn, "398").unwrap().unwrap(),
            old
        );
        let count: i64 = conn
            .query_row("SELECT count(*) FROM assets", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 0);
        assert_eq!(fs::read_dir(target.join("assets")).unwrap().count(), 0);
        drop(conn);
        fs::remove_dir_all(source).unwrap();
        fs::remove_dir_all(target).unwrap();
    }
}
