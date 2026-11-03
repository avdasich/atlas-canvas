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
