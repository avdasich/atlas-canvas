[Русский](../DEVELOPMENT.md) · [Main page](../../README.en.md) · [Releases](RELEASE.md)

# Development and architecture

For ordinary use, see the [user guide](USER_GUIDE.md).

## Stack and local development

React 19, TypeScript, Vite, Konva/react-konva, D3 Geo/TopoJSON; Tauri 2 and Rust; SQLite through rusqlite; ZIP archives with SHA-256 checksums.

```sh
npm ci
npm run tauri dev
```

Install [Tauri's platform prerequisites](https://v2.tauri.app/start/prerequisites/), Node.js 24 and stable Rust. The optional demo checker also needs Python 3 (standard library only); GitHub-hosted build runners already include it. Node 24 supports the test loader's `node:module.registerHooks`. `ATLAS_POLLING=1 npm run dev` is an optional filesystem-watching fallback. A browser preview has separate storage and fewer native capabilities.

## Module map

| Area                                                                              | Responsibility                                                            |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `src/App.tsx`, `WorldMap.tsx`, `CountryCanvas.tsx`                                | Main screen, map/search, country loading/migration/recovery               |
| `components/editor/CanvasEditor.tsx`                                              | Shared state, selection, camera, history and action coordination          |
| `SceneStage.tsx`, `ItemView.tsx`, `DomObjects.tsx`                                | Konva rendering, vector objects and HTML tables/players/expandable notes  |
| `CanvasBackground.tsx`, `SnowShimmer.tsx`, `CanvasNavigator.tsx`                  | Background, animation, minimap, rulers and guides                         |
| `properties/`, `controls/`                                                        | Appearance panels and numeric controls                                    |
| `RichTextEditor.tsx`, dialogs and panels                                          | Text input, crop, search, revisions, archives and licenses                |
| `domain/sceneTypes.ts`, `scene.ts`                                                | Types, defaults, scene validation and migration                           |
| `domain/geometry.ts`, `layers.ts`, `selection.ts`, `snapping.ts`                  | Bounds, placement, depth, selection and snapping                          |
| `domain/table.ts`, `richText.ts`, `disclosure.ts`, `crop.ts`, `materials.ts`      | Pure content/object transformations                                       |
| `domain/shortcuts.ts`, `shimmer.ts`, `pdf.ts`                                     | Shortcut catalog, crystals and PDF construction                           |
| `services/useCanvasPointer.ts`, `useEditorShortcuts.ts`, `useHybridHitRouting.ts` | Pointer/keyboard lifecycles and Konva hits above HTML                     |
| `useCanvasTransfers.ts`, `exportCanvas.ts`, `svg.ts`                              | Media import/replacement/downloads, image/PDF export and SVG sanitization |
| `vectorDrawing.ts`, `textLayout.ts`, `materialRaster.ts`, `ObjectMaterial.tsx`    | Shared vector/text layout, material masks, glass and clipped sparkles     |
| `SceneRepository.ts`, `SceneWriter.ts`, `useScene.ts`                             | Storage API, ordered write queue and React state                          |
| `preferenceWrites.ts`, `usePreferences.ts`, `exitGuard.ts`                        | Shared preferences and draining writes on exit                            |
| `state/history.ts`                                                                | Session Undo/Redo                                                         |
| `src-tauri/src/storage.rs`, `schema.sql`, `validation.rs`, `object_features.rs`   | SQLite, transactions and native validation                                |
| `images.rs`, `media.rs`, `operations.rs`                                          | Managed originals/previews, URLs, progress and cancellation               |
| `archive.rs`, `archive/`, `revisions.rs`, `preferences.rs`                        | Portable backups, restore, history and preferences                        |
| `demo/`, `scripts/build-demo.py`, `scripts/check-demo.*`                          | Public sample archive, rebuild and integrity validation                   |
| `.github/workflows/`, release scripts                                             | Four native targets, consistent package names and draft assembly          |

`CanvasEditor` coordinates state and actions. Specialized logic lives in domain modules, hooks and components; pure domain algorithms do not import React components.

## Depth and materials

The order of `scene.items` defines depth. `canvasRuns` separates visible vector groups from invisible HTML/material hit proxies; adjacent proxies share one canvas. CSS z-index follows the same item order.

`isDomItem` means actual HTML objects, not glass objects. `useHybridHitRouting` forwards hits on vectors above HTML into Konva's normal selection/drag lifecycle.

Glass uses CSS backdrop filtering through an alpha mask of the actual letters/shape. Konva retains an invisible hit proxy. PNG/PDF are composed sequentially: glass samples already-rendered content, transforms it into local coordinates and applies CPU blur; shimmer uses a static time-zero frame. Export blur can differ slightly from WebView rendering.

Cropping stores a normalized source rectangle. `applyImageCrop` preserves remaining pixels' world position under rotation/scaling without changing the asset ID. Both preview and original export use this normalized rectangle.

Expandable-section drafts join note/table drafts in autosave and exit flushing. Read-only expansion is local, so viewing does not alter stored section states.

## Storage invariants

- Preserve the production identifier **`com.m1.tauri-app`**. A different identifier opens another data directory. Use a separate identifier for QA and transfer fixtures through `.atlas`.
- Country IDs are stable across localization. Supplemental IDs 900–904 are source features, not additional ISO countries.
- Current **scene format is 5**; frontend/native validators read 2/3/4/5 and save as 5. Never downgrade the saved format; old editors must reject unsupported data rather than discard new features.
- SQLite **`user_version=2`** is a separate database-schema version. Migrations must preserve records and attachments.
- `SceneWriter` serializes writes. Failed writes keep their latest value for retry; exit drains scene and preference queues. A scene update records its previous state in revisions atomically.
- Rich text stores safe runs, not arbitrary HTML. Plain `content` matches their text. Merged cells retain covered content.
- Asset IDs point to managed files; external source paths are not persistent references. `safe_asset_path` confines access to the managed assets directory.
- Do not delete original media when deleting an object: Undo, revisions, themes or other countries may still reference it. Garbage collection is not implemented.
- Full archives include preferences and their asset/font references. Restore remaps structural IDs/font properties, not arbitrary note text, and creates a backup before applying changes. Corrupt/incompatible JSON is not silently replaced with an empty scene.
- Export flushes current input and pending writes before loading the saved scene.

## Style and checks

```sh
npm run format
npm run format:check
npm run docs:shortcuts
npm test
npm run demo:check
npm run build
cargo test --locked --manifest-path src-tauri/Cargo.toml
git diff --check
```

Formatting organizes TypeScript imports, runs Prettier and runs rustfmt. Generated data, binary resources, original license texts and npm lockfiles are excluded from Prettier. Both shortcut pages are generated from the same action catalog; English action labels live in the documentation generator.

Tests cover geometry/history, migration, write failures, tables/merges, rich text, shortcuts, crop/sections/materials, archive integrity, reference remapping and restore rollback. The release tests also require all platform packages before draft assembly. Use the command output for current test counts.

Manual native checks remain necessary for WebView, system dialogs, codecs, depth/hit routing, keyboard focus, saved-state restart and exports. Run downloaded packages on Intel Mac, Apple Silicon, Windows and Linux; a local macOS build does not prove all targets work.

Vite reports the large lazy detailed-map chunk (about 756 kB before gzip). The warning is visible rather than disabled. No cross-platform frame-rate claim is made for large scenes.

## Automatic backups

Automatic backups start in a separate blocking task after a scene is committed. Managed `AutomaticBackups` state permits one worker; archive-write errors use `atlas-backup-error`. At the start of a task, while holding the worker permit, only regular `.auto-*.pending` and `.auto-*.partial` files left by interrupted tasks are removed, before empty/unchanged-atlas checks. Directories, symlinks, `before-import-*`/`recovery-*` temporary files and other names without the `.auto-` prefix are left alone. Temporary-file cleanup is best-effort: a failed removal does not stop attempts on other files or block archive creation. These cleanup errors (even when skipping a copy) and pruning errors after publication use the separate `atlas-backup-cleanup-warning` event. The current worker creates its temporary files after cleanup. Eligibility compares `MAX(scenes.updated_at)` with the latest automatic copy. `write_archive` first writes `.auto-<id>.<newid>.partial`, publishes `.pending` by hard link or copying once the ZIP is complete, then deletes its own `.partial`. An archive is atomically renamed from its own `.pending` file before pruning `auto-*.atlas` to 5 copies. Its timestamp marks the start of reading so saves during archiving remain eligible for another copy. On the first successful automatic backup after updating, automatic copies beyond 5 will be permanently deleted, starting with the oldest. Move any copies you want to keep out of the backup folder beforehand. Shared preference changes alone do not trigger a backup. Exit waits for scene/settings writes, not the background archive; use manual export when a completed snapshot is needed immediately.

`AutomaticBackups` uses a monotonic last-attempt time: workers start at most once per 60 seconds, archive failures delay retries for an hour after completion, and successful results clear the backoff; cleanup warnings do not trigger it. Notices are deduplicated by kind and raw message for the entire process session (including A → B → A). Rejected starts do not extend deadlines; checks resume on the next canvas save after the interval.

## Resources and notices

`npm run notices` collects production npm/Cargo dependency notices into `public/licenses/notices.json`. Review components that have SPDX metadata without a full license text before release. Additional upstream license sources and commit IDs are in `public/licenses/upstream/index.json`.

Font sources and hashes are in `public/fonts/SOURCES.md`. Map data is bundled through world-atlas; the detailed map is lazy-loaded. Opening a local atlas needs no remote service. Demo media use the separate [credits](../../demo/SOURCES.md).

## Interface language

`src/i18n/en.ts` contains English translations keyed by Russian source text. Components translate interface labels at render time. Country IDs and user content are never translated. `ui-language` is saved in SQLite and intentionally excluded from portable archives. Native dialogs and the custom Quit item follow the selected language. `tests/language.test.mjs` checks catalog coverage, placeholders, country IDs and queued error messages.
