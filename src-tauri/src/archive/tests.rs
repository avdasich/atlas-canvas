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
fn templates_keep_their_media_and_remap_only_font_properties() {
    let source = dir();
    let asset = seed(&source);
    let conn = connect(&source).unwrap();
    let prefs = serde_json::json!([{"id":"custom","name":"Свой фон","theme":{"background":"#ffffff","pattern":"none","fontFamily":"Arial","backgroundType":"image","backgroundAssetId":asset}}]);
    conn.execute(
        "INSERT INTO preferences(key,json) VALUES ('themes',?1)",
        [prefs.to_string()],
    )
    .unwrap();
    conn.execute(
        "INSERT INTO preferences(key,json) VALUES ('ui-language','\"en\"')",
        [],
    )
    .unwrap();
    drop(conn);
    let archive = source.join("all.atlas");
    write_archive(&source, &archive, None).unwrap();
    let target = dir();
    let stage = target.join("stage");
    let manifest = stage_archive(&archive, &stage).unwrap();
    assert!(!manifest.preferences.contains_key("ui-language"));
    apply_staged(
        &target,
        &Staged {
            dir: stage,
            manifest,
        },
        false,
    )
    .unwrap();
    let conn = connect(&target).unwrap();
    let raw: String = conn
        .query_row("SELECT json FROM preferences WHERE key='themes'", [], |r| {
            r.get(0)
        })
        .unwrap();
    let restored: Value = serde_json::from_str(&raw).unwrap();
    assert_ne!(
        restored[0]["theme"]["backgroundAssetId"].as_str().unwrap(),
        asset
    );
    let mut value = serde_json::json!({"content":format!("AtlasFont-{asset}"),"fontFamily":format!("AtlasFont-{asset}")});
    remap(
        &mut value,
        &BTreeMap::from([(asset.clone(), "changed".to_string())]),
    );
    assert_eq!(value["content"], format!("AtlasFont-{asset}"));
    assert_eq!(value["fontFamily"], "AtlasFont-changed");
    drop(conn);
    fs::remove_dir_all(source).unwrap();
    fs::remove_dir_all(target).unwrap();
}
#[test]
fn damaged_current_media_does_not_block_repair_import_and_raw_snapshot_is_kept() {
    let source = dir();
    seed(&source);
    let archive = source.join("healthy.atlas");
    write_archive(&source, &archive, None).unwrap();
    let target = dir();
    let missing = seed(&target);
    fs::remove_file(target.join(format!("assets/{missing}.png"))).unwrap();
    let stage = target.join("stage");
    let manifest = stage_archive(&archive, &stage).unwrap();
    let result = apply_staged(
        &target,
        &Staged {
            dir: stage,
            manifest,
        },
        true,
    )
    .unwrap();
    let snapshot = PathBuf::from(result.backup.unwrap());
    assert!(snapshot.join("atlas.sqlite3").is_file());
    assert!(snapshot.join("README.txt").is_file());
    let old = rusqlite::Connection::open(snapshot.join("atlas.sqlite3")).unwrap();
    let original: String = old
        .query_row(
            "SELECT scene_json FROM scenes WHERE country_id='398'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert!(original.contains(&missing));
    drop(old);
    assert_eq!(result.imported, 1);
    fs::remove_dir_all(source).unwrap();
    fs::remove_dir_all(target).unwrap();
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
    let scene: Value = serde_json::from_str(&read_scene(&conn, "398").unwrap().unwrap()).unwrap();
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

#[test]
fn format_five_archive_keeps_crop_sections_materials_and_original_bytes() {
    let source = dir();
    let asset = seed(&source);
    let mut scene: Value = serde_json::from_str(&raw(Some(&asset))).unwrap();
    scene["schemaVersion"] = serde_json::json!(5);
    scene["theme"]["glassPanels"] = serde_json::json!(true);
    scene["items"][0]["crop"] = serde_json::json!({"x":0.1,"y":0.2,"width":0.7,"height":0.5});
    scene["items"].as_array_mut().unwrap().extend([
        serde_json::json!({"id":"details","kind":"disclosure","x":0,"y":0,"sections":[{"id":"hidden","title":"Источники","content":"Текст внутри свёрнутого раздела","height":140,"collapsed":true}]}),
        serde_json::json!({"id":"material","kind":"star","x":20,"y":30,"glass":{"enabled":true,"blur":12,"opacity":0.25,"tint":"#dbeeff"},"shimmer":{"enabled":true,"speed":0.7,"intensity":0.5,"color":"#ffffff"}})
    ]);
    let mut conn = connect(&source).unwrap();
    write_scene(&mut conn, "398", &scene.to_string(), None).unwrap();
    drop(conn);
    let archive = source.join("format-five.atlas");
    write_archive(&source, &archive, None).unwrap();
    let target = dir();
    let stage = target.join("stage");
    let manifest = stage_archive(&archive, &stage).unwrap();
    apply_staged(
        &target,
        &Staged {
            dir: stage,
            manifest,
        },
        false,
    )
    .unwrap();
    let conn = connect(&target).unwrap();
    let restored: Value =
        serde_json::from_str(&read_scene(&conn, "398").unwrap().unwrap()).unwrap();
    assert_eq!(restored["schemaVersion"], 5);
    assert_eq!(restored["theme"], scene["theme"]);
    assert_eq!(restored["items"][0]["crop"], scene["items"][0]["crop"]);
    assert_eq!(restored["items"][1], scene["items"][1]);
    assert_eq!(restored["items"][2], scene["items"][2]);
    let id = restored["items"][0]["assetId"].as_str().unwrap();
    assert_ne!(id, asset);
    let relative: String = conn
        .query_row(
            "SELECT internal_path FROM assets WHERE id=?1",
            [id],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(
        fs::read(target.join(relative)).unwrap(),
        b"PNG test original bytes"
    );
    drop(conn);
    fs::remove_dir_all(source).unwrap();
    fs::remove_dir_all(target).unwrap();
}

#[test]
fn public_demo_keeps_existing_countries_and_shared_preferences_by_default() {
    let target = dir();
    let mut conn = connect(&target).unwrap();
    let previous = raw(None);
    write_scene(&mut conn, "352", &previous, None).unwrap();
    conn.execute(
        "INSERT INTO preferences(key,json) VALUES ('editor',?1)",
        [r#"{"theme":"light"}"#],
    )
    .unwrap();
    drop(conn);
    let file = target.join("public-demo.atlas");
    fs::write(
        &file,
        include_bytes!("../../../demo/Atlas-Canvas-Iceland.atlas"),
    )
    .unwrap();
    let staging = target.join("stage");
    let manifest = stage_archive(&file, &staging).unwrap();
    assert_eq!(manifest.scenes.len(), 3);
    assert!(manifest.preferences.is_empty());
    let result = apply_staged(
        &target,
        &Staged {
            dir: staging,
            manifest,
        },
        false,
    )
    .unwrap();
    assert_eq!(result.imported, 2);
    assert_eq!(result.skipped, 1);
    let conn = connect(&target).unwrap();
    assert_eq!(read_scene(&conn, "352").unwrap(), Some(previous));
    for country in ["578", "392"] {
        let restored: Value =
            serde_json::from_str(&read_scene(&conn, country).unwrap().unwrap()).unwrap();
        assert_eq!(restored["schemaVersion"], 5);
        assert!(!restored["items"].as_array().unwrap().is_empty());
    }
    let prefs: String = conn
        .query_row(
            "SELECT json FROM preferences WHERE key='editor'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(prefs, r#"{"theme":"light"}"#);
    drop(conn);
    fs::remove_dir_all(target).unwrap();
}

#[path = "automatic_backup_tests.rs"]
mod automatic_backup_tests;
