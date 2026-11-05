[Русский](../RELEASE.md) · [Main page](../../README.en.md) · [Development](DEVELOPMENT.md)

# Build and publish releases

For installing the app, see [Installation](INSTALLATION.md). This page is for maintainers.

## Downloads in one release

| Computer                        | Packages                                           |
| ------------------------------- | -------------------------------------------------- |
| Intel Mac                       | `Atlas-Canvas_0.4.2_macOS-Intel.dmg`               |
| Apple Silicon Mac, M1 and later | `Atlas-Canvas_0.4.2_macOS-Apple-Silicon.dmg`       |
| Windows x64                     | `Atlas-Canvas_0.4.2_Windows-x64-setup.exe`         |
| Linux x64                       | `Atlas-Canvas_0.4.2_Linux-x64.deb` and `.AppImage` |

Assets contain five installers and `SHA256SUMS.txt`. The description links to the demo and its instructions. GitHub also adds two source archives. The version in installer names updates automatically.

**Platform builds** tests/builds all four targets on pull requests and pushes to `main`. **Desktop release** runs on version tags using the same matrix. Only after every build succeeds does a separate job collect all files into one **draft prerelease**. Publication is manual; published assets are not overwritten.

Mac apps are ad-hoc signed via `tauri.macos.conf.json`, without Apple Developer ID or notarization; Windows builds have no publisher signature. The Windows installer includes WebView2 for offline installation. Linux uses Ubuntu 22.04 as its build baseline; other distributions need testing.

## Keep user data safe

Export a complete `.atlas` backup before updating. Preserve production identifier **`com.m1.tauri-app`**. QA apps with different identifiers have separate data; export records from the app that actually contains them.

Scene format 5 in the 0.4 series is rejected by 0.2/0.3. Downgrades need a pre-upgrade backup. A database without its `assets/` directory is not a complete copy.

## Prepare a release

Before creating a release tag, update the version in `package.json`, `package-lock.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` and `src-tauri/Cargo.lock`. Keep all version values equal and use a new version for every release.

Run from the repository root:

```sh
npm ci
npm test
npm run demo:check
npm run build
cargo test --locked --manifest-path src-tauri/Cargo.toml
npm run format:check
npm run notices
node scripts/check-version.mjs
git diff --check
```

Submit the changes through a pull request into `main`. Wait for **Platform builds**, then download its four artifact sets from **Actions → run → Artifacts**. Test installation, media playback, save/restart and demo import on the target systems before merging.

## Create a tag

After merging, pull `main` and tag the version recorded in the files. For example, for version 0.4.2:

```sh
git switch main
git pull --ff-only origin main
git tag v0.4.2
git push origin v0.4.2
```

Watch **Actions → Desktop release**. It checks the existing tag and npm/Cargo/Tauri versions, builds all targets, then creates the draft. There is no fixed waiting time.

For a retry, use **Run workflow** on a branch containing the workflow and enter the existing tag, such as `v0.4.2`. The build checks out the tag's commit; it does not create a tag from an arbitrary branch.

When it succeeds:

1. Open [Releases](https://github.com/avdasich/atlas-canvas/releases) and edit the correct draft.
2. Check that both Mac architectures, Windows, Linux and checksums are attached.
3. Download and test the matching packages.
4. Click **Publish release**; keep **Pre-release** selected for a preview.
5. Check the public link while signed out.

Drafts are visible only to authorized users, so an unpublished link may return 404 to others. Fix build errors and rerun rather than replacing a published tag. Bump all five version files before a later release.

## Workflow structure

- `build-desktop.yml`: shared matrix, tests, demo validation and native packaging; artifacts retained for 14 days.
- `platform-checks.yml`: PR/main/manual entry point for the shared matrix.
- `desktop-release.yml`: existing-tag validation, shared builds and one draft-assembly job.
- `package-desktop.mjs`: clear platform names; verifies the `.app` signature with `codesign --verify --deep --strict` and checks its architecture with `lipo`.
- `prepare-release.mjs`: requires all five installers and adds SHA-256.
- `upload-release.mjs`: creates/updates a draft with the standard `GITHUB_TOKEN`; never publishes or replaces a published release. Unsigned builds need no additional secrets or paid signing service.

Runners/targets: `macos-15-intel` / `x86_64-apple-darwin`, `macos-15` / `aarch64-apple-darwin`, `windows-latest` / `x86_64-pc-windows-msvc`, `ubuntu-22.04` / `x86_64-unknown-linux-gnu`.

## Local builds

Install [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/), Node.js 24 and stable Rust:

```sh
npm ci
npm run notices
npm run tauri build
```

Output is under `src-tauri/target/release/bundle/`, or `src-tauri/target/<target>/release/bundle/` with an explicit `--target`. A macOS command does not produce a Windows installer.

For an isolated macOS QA app:

```sh
npm run tauri build -- --debug --bundles app --config '{"identifier":"com.m1.atlas-canvas.my-check","productName":"Atlas Canvas My Check"}'
```

It opens its own empty database. Import the [demo atlas](../../demo/README.en.md); do not change the production identifier for testing or open two instances on the same database.
