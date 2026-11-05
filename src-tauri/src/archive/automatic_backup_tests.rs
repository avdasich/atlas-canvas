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
    let other = folder.join("auto-not-an-archive.txt");
    for path in [&manual, &partial, &other] {
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
    for path in [&manual, &partial, &other] {
        assert_eq!(fs::read(path).unwrap(), b"leave this file alone");
    }
    assert!(directory.is_dir());
    fs::remove_dir_all(source).unwrap();
}

#[test]
fn orphaned_auto_temps_are_removed_before_the_hourly_skip_without_touching_other_copies() {
    let source = dir();
    seed(&source);
    automatic_backup(&source).unwrap();
    let folder = source.join("backups");
    let completed = automatic_backup_files(&folder).unwrap().remove(0).path;
    let before_import = folder.join("before-import-example.atlas");
    let recovery = folder.join("recovery-example.atlas");
    let manual = folder.join("manual.atlas");
    let partial = folder.join("before-import-example.partial");
    let recovery_partial = folder.join("recovery-example.partial");
    let foreign_partial = folder.join("unrelated.partial");
    let visible_auto_partial = folder.join("auto-visible.partial");
    let unrelated = folder.join(".manual.pending");
    let directory = folder.join(".auto-directory.pending");
    let partial_directory = folder.join(".auto-directory.partial");
    fs::create_dir(&directory).unwrap();
    fs::create_dir(&partial_directory).unwrap();
    let preserved = [
        completed,
        before_import,
        recovery,
        manual,
        partial,
        recovery_partial,
        foreign_partial,
        visible_auto_partial,
        unrelated,
    ];
    for path in &preserved[1..] {
        fs::write(path, b"keep").unwrap();
    }
    let original: Vec<_> = preserved
        .iter()
        .map(|path| fs::read(path).unwrap())
        .collect();
    let pending = [
        folder.join(".auto-interrupted.pending"),
        folder.join(".auto-x.y.partial"),
    ];
    for path in &pending {
        fs::write(path, b"abandoned archive").unwrap();
    }

    let (done_tx, done_rx) = mpsc::channel();
    let worker_source = source.clone();
    let jobs = AutomaticBackups::default();
    let running = Arc::clone(&jobs.running);
    assert!(jobs.spawn(
        move || {
            assert!(running.load(Ordering::Acquire));
            let outcome = automatic_backup_using(
                &worker_source,
                |_, _| panic!("the latest backup is still within the hourly interval"),
                |path| fs::remove_file(path),
            );
            done_tx.send(outcome).unwrap();
            Ok(())
        },
        |_| panic!("the backup must not fail"),
    ));
    assert_eq!(
        done_rx
            .recv_timeout(Duration::from_secs(5))
            .unwrap()
            .unwrap(),
        None
    );
    for path in pending {
        assert!(!path.exists());
    }
    for (path, bytes) in preserved.iter().zip(original) {
        assert_eq!(fs::read(path).unwrap(), bytes);
    }
    assert!(directory.is_dir());
    assert!(partial_directory.is_dir());
    fs::remove_dir_all(source).unwrap();
}

#[test]
fn orphaned_auto_temp_is_removed_even_when_the_atlas_has_no_content() {
    let source = dir();
    drop(connect(&source).unwrap());
    let folder = source.join("backups");
    fs::create_dir(&folder).unwrap();
    let pending = folder.join(".auto-interrupted.pending");
    fs::write(&pending, b"abandoned").unwrap();
    assert_eq!(automatic_backup(&source).unwrap(), None);
    assert!(!pending.exists());
    fs::remove_dir_all(source).unwrap();
}

#[test]
fn failed_temp_removal_does_not_block_other_removals_or_a_new_archive() {
    let source = dir();
    seed(&source);
    let folder = source.join("backups");
    fs::create_dir(&folder).unwrap();
    let orphaned = [
        folder.join(".auto-first.x.partial"),
        folder.join(".auto-second.y.partial"),
        folder.join(".auto-third.pending"),
    ];
    for path in &orphaned {
        fs::write(path, b"orphaned").unwrap();
    }
    let mut attempts = Vec::new();

    let warning = automatic_backup_using(
        &source,
        |dir, dest| write_archive(dir, dest, None),
        |path| {
            attempts.push(path.to_path_buf());
            // Fail the first attempt regardless of directory enumeration order.
            if attempts.len() == 1 {
                Err(std::io::Error::from(std::io::ErrorKind::PermissionDenied))
            } else {
                fs::remove_file(path)
            }
        },
    )
    .expect("temp cleanup must not prevent a new archive")
    .expect("the temp cleanup failure must be reported");

    assert_eq!(attempts.len(), 3);
    assert!(warning.contains(attempts[0].to_str().unwrap()));
    for path in orphaned {
        assert!(attempts.contains(&path));
        assert_eq!(path.exists(), path == attempts[0]);
    }
    let files = automatic_backup_files(&folder).unwrap();
    assert_eq!(files.len(), 1);
    assert_eq!(
        stage_archive(&files[0].path, &source.join("inspect"))
            .unwrap()
            .scenes
            .len(),
        1
    );
    fs::remove_dir_all(source).unwrap();
}

#[test]
fn temp_cleanup_warning_is_returned_even_when_a_copy_is_skipped() {
    for has_content in [false, true] {
        let source = dir();
        if has_content {
            seed(&source);
            automatic_backup(&source).unwrap();
        } else {
            drop(connect(&source).unwrap());
        }
        let folder = source.join("backups");
        fs::create_dir_all(&folder).unwrap();
        let blocked = folder.join(".auto-blocked.x.partial");
        fs::write(&blocked, b"blocked").unwrap();
        let warning = automatic_backup_using(
            &source,
            |_, _| panic!("an empty atlas or recent backup must skip archive creation"),
            |_| Err(std::io::Error::from(std::io::ErrorKind::PermissionDenied)),
        )
        .expect("cleanup failure must be a warning even without a new archive")
        .expect("the cleanup warning must not be lost on early return");
        assert!(warning.contains(blocked.to_str().unwrap()));
        assert_eq!(fs::read(&blocked).unwrap(), b"blocked");
        assert_eq!(
            automatic_backup_files(&folder).unwrap().len(),
            usize::from(has_content)
        );
        fs::remove_dir_all(source).unwrap();
    }
}

#[test]
fn temp_cleanup_does_not_remove_files_created_by_the_current_worker() {
    use std::cell::RefCell;
    let source = dir();
    seed(&source);
    let folder = source.join("backups");
    fs::create_dir(&folder).unwrap();
    let orphaned = folder.join(".auto-orphaned.x.partial");
    fs::write(&orphaned, b"orphaned").unwrap();
    let active_partial = RefCell::new(None::<PathBuf>);
    let mut removed = Vec::new();

    assert_eq!(
        automatic_backup_using(
            &source,
            |dir, dest| {
                assert!(
                    !orphaned.exists(),
                    "cleanup must precede this worker's writes"
                );
                let partial = dest.with_extension("worker.partial");
                fs::write(&partial, b"current worker").map_err(err)?;
                *active_partial.borrow_mut() = Some(partial);
                write_archive(dir, dest, None)
            },
            |path| {
                removed.push(path.to_path_buf());
                fs::remove_file(path)
            },
        )
        .unwrap(),
        None
    );

    assert_eq!(removed, [orphaned]);
    let partial = active_partial.into_inner().unwrap();
    assert_eq!(fs::read(partial).unwrap(), b"current worker");
    let files = automatic_backup_files(&folder).unwrap();
    assert_eq!(files.len(), 1);
    assert_eq!(
        stage_archive(&files[0].path, &source.join("inspect"))
            .unwrap()
            .scenes
            .len(),
        1
    );
    fs::remove_dir_all(source).unwrap();
}

#[test]
fn failed_pruning_reports_a_warning_after_publishing_a_valid_archive() {
    let source = dir();
    seed(&source);
    let old = old_backups(&source, 5);
    let before: Vec<_> = old.iter().map(|path| fs::read(path).unwrap()).collect();
    let warning = automatic_backup_using(
        &source,
        |dir, dest| write_archive(dir, dest, None),
        |_| Err(std::io::Error::from(std::io::ErrorKind::PermissionDenied)),
    )
    .expect("a pruning failure is not an archive-write failure")
    .expect("the cleanup warning must be returned");
    assert_eq!(
        warning,
        std::io::Error::from(std::io::ErrorKind::PermissionDenied).to_string()
    );
    let files = automatic_backup_files(&source.join("backups")).unwrap();
    assert_eq!(files.len(), 6);
    let created = files
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
    for (path, bytes) in old.iter().zip(before) {
        assert_eq!(fs::read(path).unwrap(), bytes);
    }
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

    automatic_backup_using(
        &source,
        |_, _| panic!("unchanged scenes must not be archived"),
        |path| fs::remove_file(path),
    )
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
    automatic_backup_using(
        &source,
        |_, _| panic!("the hourly limit must still apply"),
        |path| fs::remove_file(path),
    )
    .unwrap();
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
    let result = automatic_backup_using(
        &source,
        |_, pending| {
            fs::write(pending, b"incomplete archive").map_err(err)?;
            Err(std::io::Error::from(std::io::ErrorKind::WriteZero).to_string())
        },
        |path| fs::remove_file(path),
    );
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
    automatic_backup_using(
        &source,
        |dir, pending| {
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
        },
        |path| fs::remove_file(path),
    )
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
