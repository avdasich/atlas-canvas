[Русский](CHANGELOG.md)

# Change history

## 0.4.2

- English and Russian interface with saved language selection; country IDs and canvas content stay unchanged.
- Correct ad-hoc signing and integrity checks for macOS bundles.
- Five installers and one checksum file in new releases; demo and guides are linked from the description.
- Fixed the More menu appearing behind the canvas when glass panels are enabled.
- Updated both documentation languages to use the new screenshots and Iceland cover.

## 0.4.1

- One draft with Intel Mac, Apple Silicon Mac, Windows x64 and Linux x64 packages: macOS DMG/ZIP, Windows NSIS, Linux DEB/AppImage, plus SHA-256 checksums.
- Shared PR/release matrix with explicit architectures, version checks and refusal to overwrite a published release.
- Public `.atlas` demo with three canvases, open photographs, MP4/WAV, an embedded font, import instructions.
- English README, user guide, installation, shortcuts, development and release guides. Shared images and language links at the beginning.
- Production identifier, scene format 5 and SQLite user_version 2 preserved. No user-data changes.

## 0.4.0

- Reversible image cropping with a draggable frame, aspect presets, percentage fields and full-image restoration.
- Expandable notes with multiple sections, search inside folded text and autosaved drafts.
- Glass editor panels, glass materials and snow shimmer for text, shapes, lines and drawings; effects can be combined.
- PNG/PDF include crop, disclosure state and static material rendering; `.atlas` keeps settings and originals.
- Scene format 5 reads formats 2/3/4. Back up before updating: earlier apps refuse the new format. Production identifier and SQLite schema retained.

## 0.3.0 — 2026-11-03

### Added

- Independent snow shimmer on country/map backgrounds: intensity, speed, color, reduced-motion support and static export.
- Five table styles, custom styles with font settings, merges and splits that preserve covered cell text.
- Mixed text styles, lists, links and note backgrounds; bundled Noto Sans/Serif under OFL.
- Sanitized SVG-to-PNG import, local media replacement, cancellable URL/file operations and progress.
- Minimap, rulers, guides, snapping, camera bookmarks and a detailed lazy-loaded local map.
- Shared themes in SQLite/full archives, emergency snapshots during repair and multi-page PDF.
- macOS/Windows/Linux shortcuts using physical key codes for Cyrillic layouts, with in-app help.
- User README, detailed guide, architecture notes and release instructions.

### Fixed and reorganized

- Consistent Konva/HTML depth and selection; Shift group selection and coordinated dragging through HTML handles.
- View mode protects tables/objects from edits; exports load the latest saved scene.
- Separate editor panels, properties, renderers and input/transfer hooks; native modules for validation, images, revisions, preferences, archives and operations.
- Prettier/rustfmt, organized imports, dedicated scene types and shortcut-document generation.
- Scene formats 2/3 upgrade to format 4; production identifier retained so older apps reject unsupported data safely.

### Validation and limitations at that point

- 40 frontend/domain and 13 Rust tests; macOS UI checks, archive/restart, a 1,000-object scene and single/multi-page PDF.
- Three-OS CI prepared; native Windows/Linux acceptance and remaining work tracked separately.
- Publication remained with the repository owner.

## 0.2.0 — 2026-11-03

- Editable HTML tables, local video/audio players and link cards.
- Download direct media URLs into local storage.
- Gradients, background images, pattern controls, imported fonts and light interface theme.
- Rectangle selection, groups, hiding, depth changes and copying between countries.
- Text/cell search, View mode, stroke eraser and grid snapping.
- PNG/PDF export, integrity-checked `.atlas` archives, conflict handling, scene revisions and automatic backups.
- Multiple-photo import, drag and drop, and restricted local asset access.
- Scene format 3 while retaining format 2 and legacy localStorage import.
- macOS system-menu/Cmd+Q exit waits for drafts and queued saves.
- Lazy-loaded editor and offscreen-object culling.

Current native platform acceptance must be established with the packages from the relevant workflow run, not inferred from these historical notes.
