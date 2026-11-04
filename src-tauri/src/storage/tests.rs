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
fn validates_shimmer_merged_cells_and_rich_text_before_writing() {
    let mut v: Value = serde_json::from_str(&scene("[]")).unwrap();
    v["theme"]["shimmer"] =
        serde_json::json!({"enabled":true,"color":"#ffffff","speed":0.7,"intensity":0.5});
    assert!(validate_scene(&v.to_string()).is_ok());
    v["theme"]["shimmer"]["speed"] = serde_json::json!(0);
    assert!(validate_scene(&v.to_string()).is_err());
    v["theme"].as_object_mut().unwrap().remove("shimmer");
    v["items"] = serde_json::json!([{"id":"rich","kind":"note","x":0,"y":0,"content":"Текст","richText":[{"text":"Текст","bold":true,"href":"https://example.org"}]}]);
    assert!(validate_scene(&v.to_string()).is_ok());
    v["items"][0]["richText"][0]["href"] = serde_json::json!("javascript:alert(1)");
    assert!(validate_scene(&v.to_string()).is_err());
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

#[test]
fn format_five_features_persist_and_invalid_edits_leave_previous_scene_intact() {
    let dir = test_dir("object-features");
    let mut conn = connect(&dir).unwrap();
    let mut value: Value = serde_json::from_str(&scene("[]")).unwrap();
    value["schemaVersion"] = serde_json::json!(5);
    value["theme"]["glassPanels"] = serde_json::json!(true);
    value["items"] = serde_json::json!([
        {"id":"photo","kind":"image","x":0,"y":0,"assetId":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","crop":{"x":0.2,"y":0.1,"width":0.5,"height":0.6}},
        {"id":"glass","kind":"note","x":0,"y":0,"content":"Стекло","glass":{"enabled":true,"blur":12,"tint":"#dbeeff","opacity":0.25},"shimmer":{"enabled":true,"intensity":0.5,"speed":0.7,"color":"#ffffff"}},
        {"id":"details","kind":"disclosure","x":0,"y":0,"sections":[{"id":"section","title":"Подробнее","content":"Скрытый текст","collapsed":true,"height":140}]}
    ]);
    let raw = value.to_string();
    write_scene(&mut conn, "392", &raw, None).unwrap();
    drop(conn);
    let mut conn = connect(&dir).unwrap();
    assert_eq!(read_scene(&conn, "392").unwrap(), Some(raw.clone()));
    let mut broken = value.clone();
    broken["items"][0]["crop"]["width"] = serde_json::json!(2);
    assert!(write_scene(&mut conn, "392", &broken.to_string(), None).is_err());
    broken = value.clone();
    broken["items"][2]["sections"]
        .as_array_mut()
        .unwrap()
        .push(value["items"][2]["sections"][0].clone());
    assert!(write_scene(&mut conn, "392", &broken.to_string(), None).is_err());
    broken = value.clone();
    broken["items"][0]["glass"] = value["items"][1]["glass"].clone();
    assert!(write_scene(&mut conn, "392", &broken.to_string(), None).is_err());
    assert_eq!(read_scene(&conn, "392").unwrap(), Some(raw));
    drop(conn);
    fs::remove_dir_all(dir).unwrap();
}
