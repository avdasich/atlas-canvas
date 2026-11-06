[Русский](../DEVELOPMENT.md) · [Main page](../../README.en.md) · [User guide](USER_GUIDE.md)

# Development and releases

## Run from source

Install Node.js 24, stable Rust and [Tauri's platform prerequisites](https://v2.tauri.app/start/prerequisites/). The demo checker also needs Python 3. Cargo declares Rust 1.88 as the minimum; a separate minimum-version check is not yet configured in CI.

```sh
npm ci
npm run tauri dev
```

`npm run dev` starts a browser preview with separate storage and limited native features. Use `ATLAS_POLLING=1 npm run dev` if filesystem watching fails. Build the native app locally with `npm run tauri build`.

Use a separate identifier when testing with an empty database:

```sh
npm run tauri build -- --debug --bundles app --config '{"identifier":"com.m1.atlas-canvas.my-check","productName":"Atlas Canvas My Check"}'
```

## Project layout

| Directory                     | Contents                                                           |
| ----------------------------- | ------------------------------------------------------------------ |
| `src/components/`             | Map, editor, tools and property panels                             |
| `src/domain/`                 | Scene format, geometry, tables, text, crop and materials           |
| `src/services/`, `src/state/` | Save queues, input, import, export and Undo/Redo                   |
| `src/i18n/`                   | RU/EN; interface translations never change canvas content          |
| `src-tauri/src/`              | SQLite, managed assets, archives, scene revisions and cancellation |
| `tests/`, `scripts/`, `demo/` | Checks, resource preparation and the demonstration atlas           |

React 19 renders the interface, Konva renders vectors, and Tauri 2 provides the native shell. The order of `scene.items` defines depth for both Konva and HTML objects. Test rendering, selection, dragging and table input when changing this layer. Glass and sparkles export as a static snapshot; blur may differ from WebView rendering.

## Data and compatibility

- Preserve the production identifier **`com.m1.tauri-app`**: it determines the data directory. Do not open two instances of the same database.
- Current **scene format is 5**, with readers for 2–5. SQLite **`user_version=2`** and the **`.atlas` manifest version is 1**. These are independent versions; changes require compatible migrations.
- Country IDs are stable across languages; 900–904 are supplemental source-map features. User content is never translated. SQLite stores `ui-language`, which is excluded from portable archives.
- `SceneWriter` serializes scene writes. Exit and export drain scene, preference and input queues. Read errors must not replace content with an empty scene; scene updates and previous revisions are transactional.
- Managed media live in `assets/`, with access checked by `safe_asset_path`. Do not delete originals when removing an object: Undo, revisions, themes or other countries may reference them. SQLite without its media is not a complete backup.
- Full `.atlas` archives include scenes, media and shared preferences. Restore creates a backup first; cancellation before commit rolls back new files. Remapping changes structural references, not note text.
- Rich text uses safe text runs, not arbitrary HTML. Crop stores a normalized area and preserves the original; merged cells retain covered text. Expandable-note drafts join autosave, while expansion in view mode stays local.

## Automatic backups

- A single background worker runs after a scene commit. Eligibility uses `MAX(scenes.updated_at)`; unchanged canvases do not create another copy. Shared preference changes alone do not trigger copying.
- Checks run at most once per 60 seconds. An archive failure delays retries for an hour after completion; successful results clear the backoff, while cleanup warnings do not trigger it. Another attempt occurs on the next save after the interval.
- Full archives are created at most once per hour. Writing proceeds through `.auto-<id>.<newid>.partial`, then `.pending`, then `auto-*.atlas`. The final copy's timestamp marks the start of archiving so later saves remain eligible.
- After a successful publication, keep the latest **5** automatic copies. The first new backup after updating permanently deletes older copies beyond this limit. Manual exports and pre-restore copies remain untouched.
- Before writing, the worker removes only regular orphaned `.auto-*.pending` and `.auto-*.partial` files. Directories, symlinks, `before-import-*`, `recovery-*` and names without `.auto-` are excluded. The current worker creates its temporary files after cleanup.
- Temporary-file cleanup is best-effort: one failed removal does not stop the others or archive creation. Archive errors use `atlas-backup-error`; cleanup uses `atlas-backup-cleanup-warning`. Each kind/raw-message pair appears once per process session, including A → B → A.
- **Saved** confirms the canvas write, not completion of a background archive. Exit does not wait for automatic backups; use manual export for a completed snapshot.

## Checks before a PR

```sh
node scripts/check-version.mjs
npx tsc --noEmit
npm test
npm run format:check
npm run demo:check
cargo test --manifest-path src-tauri/Cargo.toml
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
git diff --check
```

`npm run format` formats code and organizes imports. `npm run docs:shortcuts` regenerates both shortcut pages from the shared catalog. Run `npm run notices` after changing dependencies and review license coverage. Generated data and original license texts are excluded from formatting.

Manually check installation, native dialogs, codecs, overlapping-object selection, input, restart persistence, import/export and cancellation of long operations. A successful build on one platform does not replace running on the others.

## Releases

`Desktop checks` validates PRs and builds Intel Mac, Apple Silicon, Windows x64 and Linux x64 packages. Code is checked again on `main` after merging; changes confined to Markdown and `docs/` skip this repeat build. `build-desktop.yml` holds the shared matrix, while `Desktop release` prepares releases from tags. Actions artifacts are available for 14 days.

1. Choose a new version and update `package.json`, `package-lock.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` and `src-tauri/Cargo.lock`. Update CHANGELOG and `.github/RELEASE_NOTES.md`.
2. Run the checks above, open a separate PR and wait for four successful builds. Download the artifacts and test on the target systems.
3. After merging, tag the version currently recorded in the files:

```sh
git switch main
git pull --ff-only origin main
node scripts/check-version.mjs
atlas_version=$(node -p "require('./package.json').version")
git tag "v$atlas_version"
RELEASE_TAG="v$atlas_version" node scripts/check-version.mjs --release
git push origin "v$atlas_version"
```

4. Wait for `Desktop release` to finish. One draft must contain five installers—two DMGs, EXE, DEB and AppImage—and `SHA256SUMS.txt`. The demo is a separate download; GitHub adds source archives automatically.
5. Review the description, installation and saved records, then publish the draft. Drafts are not available to ordinary users. Use a new version rather than replacing published tags or assets.

To retry, open **Actions → Desktop release → Run workflow** and enter an existing tag. The version script checks the tag, commit and all version files. See [Installation](INSTALLATION.md) for platform and package-signing details.

## Resources

The sample archive is [demo/Atlas-Canvas-Iceland.atlas](../../demo/Atlas-Canvas-Iceland.atlas). It is built and checked through `demo/scenes.json`, `scripts/build-demo.py` and `scripts/check-demo.*`. Personal archives are ignored by Git. Credits: [demo/SOURCES.md](../../demo/SOURCES.md) and [public/fonts/SOURCES.md](../../public/fonts/SOURCES.md). Map data is bundled through `world-atlas`; a local atlas needs no remote service.

Licenses in [public/licenses](../../public/licenses) and extra source records in `public/licenses/upstream/index.json` are bundled with the app and must remain in the repository.
