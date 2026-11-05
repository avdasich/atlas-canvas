use super::*;
use std::sync::mpsc;

fn touch(path: &Path, time: SystemTime) {
    fs::OpenOptions::new()
        .write(true)
        .open(path)
        .unwrap()
        .set_modified(time)
        .unwrap();
}

fn old_backups(source: &Path, count: usize) -> Vec<PathBuf> {
    let folder = source.join("backups");
    fs::create_dir_all(&folder).unwrap();
    (0..count)
        .map(|index| {
            let path = folder.join(format!("auto-old-{index}.atlas"));
            fs::write(&path, format!("old backup {index}")).unwrap();
            touch(
                &path,
                SystemTime::now() - Duration::from_secs(7200 + (count - index) as u64 * 60),
            );
            path
        })
        .collect()
}

#[test]
fn successful_copy_keeps_only_five_newest_and_leaves_other_files_alone() {
    let source = dir();
    seed(&source);
    // Seven existing copies plus the new one make eight before retention runs.
    let old = old_backups(&source, 7);
    let folder = source.join("backups");
    let manual = folder.join("manual.atlas");
    let partial = folder.join("auto-old.atlas.partial");
    let pending = folder.join(".auto-interrupted.pending");
    let other = folder.join("auto-not-an-archive.txt");
    for path in [&manual, &partial, &pending, &other] {
        fs::write(path, b"leave this file alone").unwrap();
    }
    let directory = folder.join("auto-directory.atlas");
    fs::create_dir(&directory).unwrap();

    automatic_backup(&source).unwrap();

    let remaining = automatic_backup_files(&folder).unwrap();
    assert_eq!(remaining.len(), AUTOMATIC_BACKUP_LIMIT);
    for path in &old[..3] {
        assert!(!path.exists());
    }
    for path in &old[3..] {
        assert!(path.exists());
    }
    let created = remaining
        .iter()
        .find(|entry| !old.contains(&entry.path))
        .unwrap();
    assert_eq!(
        stage_archive(&created.path, &source.join("inspect"))
            .unwrap()
            .scenes
            .len(),
        1
    );
    for path in [&manual, &partial, &pending, &other] {
        assert_eq!(fs::read(path).unwrap(), b"leave this file alone");
    }
    assert!(directory.is_dir());
    fs::remove_dir_all(source).unwrap();
}

#[test]
fn unchanged_scenes_skip_a_copy_even_after_the_hour_has_elapsed() {
    let source = dir();
    seed(&source);
    let conn = connect(&source).unwrap();
    conn.execute(
        "UPDATE scenes SET updated_at='2000-01-01T00:00:00.000Z'",
        [],
    )
    .unwrap();
    drop(conn);
    let folder = source.join("backups");
    fs::create_dir(&folder).unwrap();
    let previous = folder.join("auto-previous.atlas");
    write_archive(&source, &previous, None).unwrap();
    touch(&previous, SystemTime::now() - Duration::from_secs(7200));
    let bytes = fs::read(&previous).unwrap();

    automatic_backup_using(&source, |_, _| {
        panic!("unchanged scenes must not be archived")
    })
    .unwrap();

    assert_eq!(automatic_backup_files(&folder).unwrap().len(), 1);
    assert_eq!(fs::read(previous).unwrap(), bytes);
    fs::remove_dir_all(source).unwrap();
}

#[test]
fn changed_scenes_are_still_limited_to_one_copy_per_hour() {
    let source = dir();
    seed(&source);
    automatic_backup(&source).unwrap();
    let conn = connect(&source).unwrap();
    conn.execute(
        "UPDATE scenes SET updated_at='2099-01-01T00:00:00.000Z'",
        [],
    )
    .unwrap();
    drop(conn);
    automatic_backup_using(&source, |_, _| panic!("the hourly limit must still apply")).unwrap();
    assert_eq!(
        automatic_backup_files(&source.join("backups"))
            .unwrap()
            .len(),
        1
    );
    fs::remove_dir_all(source).unwrap();
}

#[test]
fn failed_write_keeps_all_previous_backups_and_does_not_publish_a_partial_copy() {
    let source = dir();
    seed(&source);
    let old = old_backups(&source, 8);
    let before: Vec<_> = old.iter().map(|path| fs::read(path).unwrap()).collect();
    let result = automatic_backup_using(&source, |_, pending| {
        fs::write(pending, b"incomplete archive").map_err(err)?;
        Err(std::io::Error::from(std::io::ErrorKind::WriteZero).to_string())
    });
    assert!(result.is_err());
    assert_eq!(fs::read_dir(source.join("backups")).unwrap().count(), 8);
    for (path, expected) in old.iter().zip(before) {
        assert_eq!(fs::read(path).unwrap(), expected);
    }
    fs::remove_dir_all(source).unwrap();
}

#[test]
fn changes_during_archiving_are_not_hidden_by_the_completion_timestamp() {
    let source = dir();
    seed(&source);
    let change_time = SystemTime::now() + Duration::from_secs(30);
    let completion_time = change_time + Duration::from_secs(30);
    automatic_backup_using(&source, |dir, pending| {
        write_archive(dir, pending, None)?;
        // Simulate a save during a long archive write without sleeping in the test.
        connect(dir)?
            .execute(
                "UPDATE scenes SET updated_at=strftime('%Y-%m-%dT%H:%M:%fZ', ?1, 'unixepoch')",
                [change_time
                    .duration_since(UNIX_EPOCH)
                    .unwrap()
                    .as_secs_f64()],
            )
            .map_err(err)?;
        touch(pending, completion_time);
        Ok(())
    })
    .unwrap();
    let files = automatic_backup_files(&source.join("backups")).unwrap();
    assert!(files[0].modified < change_time);
    assert!(files[0].modified < completion_time);
    fs::remove_dir_all(source).unwrap();
}

#[test]
fn scheduler_returns_without_waiting_allows_only_one_worker_and_reports_failure() {
    let jobs = AutomaticBackups::default();
    let (started_tx, started_rx) = mpsc::channel();
    let (release_tx, release_rx) = mpsc::channel();
    let (error_tx, error_rx) = mpsc::channel();
    assert!(jobs.spawn(
        move || {
            started_tx.send(()).unwrap();
            release_rx.recv_timeout(Duration::from_secs(5)).unwrap();
            Err("backup write failed".into())
        },
        move |error| error_tx.send(error).unwrap(),
    ));
    started_rx.recv_timeout(Duration::from_secs(5)).unwrap();
    assert!(!jobs.spawn(|| panic!("a second worker must not start"), |_| {}));
    release_tx.send(()).unwrap();
    assert_eq!(
        error_rx.recv_timeout(Duration::from_secs(5)).unwrap(),
        "backup write failed"
    );
    let (next_tx, next_rx) = mpsc::channel();
    assert!(jobs.spawn(
        || Err("retry is allowed".into()),
        move |error| next_tx.send(error).unwrap()
    ));
    assert_eq!(
        next_rx.recv_timeout(Duration::from_secs(5)).unwrap(),
        "retry is allowed"
    );
}

#[test]
fn an_empty_atlas_does_not_create_a_backup_folder() {
    let source = dir();
    drop(connect(&source).unwrap());
    automatic_backup(&source).unwrap();
    assert!(!source.join("backups").exists());
    fs::remove_dir_all(source).unwrap();
}
