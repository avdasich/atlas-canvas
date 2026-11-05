[Русский](../RELEASE.md) · [Main page](../../README.en.md) · [Development](DEVELOPMENT.md)

# Build and publish releases

For installing the app, see [Installation](INSTALLATION.md). This page is for maintainers.

## Downloads in one release

| Computer                        | Packages                                                |
| ------------------------------- | ------------------------------------------------------- |
| Intel Mac                       | `Atlas-Canvas_0.4.1_macOS-Intel.dmg` and `.zip`         |
| Apple Silicon Mac, M1 and later | `Atlas-Canvas_0.4.1_macOS-Apple-Silicon.dmg` and `.zip` |
| Windows x64                     | `Atlas-Canvas_0.4.1_Windows-x64-setup.exe`              |
| Linux x64                       | `Atlas-Canvas_0.4.1_Linux-x64.deb` and `.AppImage`      |

The version in these names updates automatically. Releases also include `Atlas-Canvas-Iceland.atlas`, two demo instruction files and `SHA256SUMS.txt`.

**Platform builds** tests/builds all four targets on pull requests and pushes to `main`. **Desktop release** runs on version tags using the same matrix. Only after every build succeeds does a separate job collect all files into one **draft prerelease**. Publication is manual; published assets are not overwritten.

Mac builds currently have no Apple Developer ID signing/notarization; Windows builds have no publisher signature. The Windows installer includes WebView2 for offline installation. Linux uses Ubuntu 22.04 as its build baseline; other distributions need testing.

## Keep user data safe

Export a complete `.atlas` backup before updating. Preserve production identifier **`com.m1.tauri-app`**. QA apps with different identifiers have separate data; export records from the app that actually contains them.

Scene format 5 in the 0.4 series is rejected by 0.2/0.3. Downgrades need a pre-upgrade backup. A database without its `assets/` directory is not a complete copy.

## Send this change for review

The working branch is `chore/demo-english-desktop-releases`:

```sh
cd /Users/m1/atlas-canvas
npm ci
npm test
npm run demo:check
npm run build
cargo test --locked --manifest-path src-tauri/Cargo.toml
npm run format:check
npm run notices
node scripts/check-version.mjs
git diff --check

git add .
git diff --cached --stat
git commit -m "Add demo atlas, English docs and desktop releases"
git push -u origin chore/demo-english-desktop-releases
```

Open a PR into `main` and wait for **Platform builds**. Download the four artifact sets from **Actions → run → Artifacts** and check installation, media playback, save/restart and demo import on the target systems. Then merge the PR.

## Create release 0.4.1

`v0.4.0` already exists. Create the new tag after merging:

```sh
git switch main
git pull --ff-only origin main
git tag v0.4.1
git push origin v0.4.1
```

Watch **Actions → Desktop release**. It checks the existing tag and npm/Cargo/Tauri versions, builds all targets, then creates the draft. There is no fixed waiting time.

For a retry, use **Run workflow** on a branch containing the new workflow and enter the existing tag, such as `v0.4.1`. The build checks out the tag's commit; it does not create a tag from an arbitrary branch.

When it succeeds:

1. Open [Releases](https://github.com/avdasich/atlas-canvas/releases) and edit the correct draft.
2. Check that both Mac architectures, Windows, Linux, demo and checksums are attached.
3. Download and test the matching packages.
4. Click **Publish release**; keep **Pre-release** selected for a preview.
5. Check the public link while signed out.

Drafts are visible only to authorized users, so an unpublished link may return 404 to others. Fix build errors and rerun rather than replacing a published tag. Bump all five version files before a later release.

## Workflow structure

- `build-desktop.yml`: shared matrix, tests, demo validation and native packaging; artifacts retained for 14 days.
- `platform-checks.yml`: PR/main/manual entry point for the shared matrix.
- `desktop-release.yml`: existing-tag validation, shared builds and one draft-assembly job.
- `package-desktop.mjs`: clear platform names; macOS ZIP via `ditto` to preserve `.app` permissions.
- `prepare-release.mjs`: requires all seven packages, adds demo/instructions and SHA-256.
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
