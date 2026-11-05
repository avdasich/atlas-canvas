import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, readdir } from 'node:fs/promises';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const script = (name) => new URL(`../scripts/${name}`, import.meta.url);
const run = (name, cwd, ...args) =>
  execFileSync(process.execPath, [fileURLToPath(script(name)), ...args], { cwd, encoding: 'utf8' });

test('release assembly rejects missing platforms and hashes every complete download', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'atlas-release-'));
  try {
    await mkdir(path.join(dir, 'release-assets'));
    await writeFile(path.join(dir, 'package.json'), JSON.stringify({ version: '1.2.3' }));
    const files = [
      'macOS-Intel.dmg',
      'macOS-Apple-Silicon.dmg',
      'Windows-x64-setup.exe',
      'Linux-x64.deb',
      'Linux-x64.AppImage',
    ].map((name) => `Atlas-Canvas_1.2.3_${name}`);
    for (const name of files.slice(0, -1))
      await writeFile(path.join(dir, 'release-assets', name), `package:${name}`);
    assert.notEqual(
      spawnSync(process.execPath, [fileURLToPath(script('prepare-release.mjs'))], { cwd: dir })
        .status,
      0,
    );
    assert.equal((await readdir(path.join(dir, 'release-assets'))).length, 4);
    const last = files.at(-1);
    await writeFile(path.join(dir, 'release-assets', last), `package:${last}`);
    run('prepare-release.mjs', dir);
    const sums = (await readFile(path.join(dir, 'release-assets', 'SHA256SUMS.txt'), 'utf8'))
      .trim()
      .split('\n');
    assert.equal(sums.length, 5);
    assert.deepEqual(
      (await readdir(path.join(dir, 'release-assets'))).sort(),
      [...files, 'SHA256SUMS.txt'].sort(),
    );
    for (const line of sums) {
      const [hash, name] = line.split('  ');
      assert.equal(
        hash,
        createHash('sha256')
          .update(await readFile(path.join(dir, 'release-assets', name)))
          .digest('hex'),
      );
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('packaging preserves installer bytes and gives Windows/Linux explicit architecture names', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'atlas-packages-'));
  try {
    await writeFile(path.join(dir, 'package.json'), JSON.stringify({ version: '1.2.3' }));
    for (const [target, platform, directory, ext, suffix] of [
      ['x86_64-pc-windows-msvc', 'Windows-x64', 'nsis', '.exe', '-setup.exe'],
      ['x86_64-unknown-linux-gnu', 'Linux-x64', 'deb', '.deb', '.deb'],
    ]) {
      const base = path.join(dir, 'src-tauri', 'target', target, 'release', 'bundle');
      await mkdir(path.join(base, directory), { recursive: true });
      await writeFile(path.join(base, directory, `original${ext}`), 'installer bytes');
      if (platform === 'Linux-x64') {
        await mkdir(path.join(base, 'appimage'));
        await writeFile(path.join(base, 'appimage', 'original.AppImage'), 'AppImage bytes');
      }
      run('package-desktop.mjs', dir, target, platform);
      assert.equal(
        await readFile(
          path.join(dir, 'release-assets', `Atlas-Canvas_1.2.3_${platform}${suffix}`),
          'utf8',
        ),
        'installer bytes',
      );
    }
    assert.notEqual(
      spawnSync(
        process.execPath,
        [
          fileURLToPath(script('package-desktop.mjs')),
          'x86_64-apple-darwin',
          'macOS-Apple-Silicon',
        ],
        { cwd: dir },
      ).status,
      0,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test(
  'macOS packaging accepts a sealed app and rejects a changed executable',
  { skip: process.platform !== 'darwin' },
  async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'atlas-macos-signature-'));
    const arm = process.arch === 'arm64';
    const target = arm ? 'aarch64-apple-darwin' : 'x86_64-apple-darwin';
    const platform = arm ? 'macOS-Apple-Silicon' : 'macOS-Intel';
    const base = path.join(dir, 'src-tauri', 'target', target, 'release', 'bundle');
    const app = path.join(base, 'macos', 'Atlas Canvas.app');
    const binary = path.join(app, 'Contents', 'MacOS', 'tauri-app');
    try {
      await writeFile(path.join(dir, 'package.json'), JSON.stringify({ version: '1.2.3' }));
      await mkdir(path.dirname(binary), { recursive: true });
      await mkdir(path.join(base, 'dmg'), { recursive: true });
      execFileSync('clang', ['-arch', arm ? 'arm64' : 'x86_64', '-x', 'c', '-', '-o', binary], {
        input: 'int main(void) { return 0; }',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      await writeFile(
        path.join(app, 'Contents', 'Info.plist'),
        `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>CFBundleExecutable</key><string>tauri-app</string><key>CFBundleIdentifier</key><string>com.atlas.packaging-test</string><key>CFBundlePackageType</key><string>APPL</string></dict></plist>`,
      );
      execFileSync('codesign', ['--force', '--sign', '-', app], { stdio: 'pipe' });
      await writeFile(path.join(base, 'dmg', 'original.dmg'), 'disk image bytes');
      run('package-desktop.mjs', dir, target, platform);
      const download = path.join(dir, 'release-assets', `Atlas-Canvas_1.2.3_${platform}.dmg`);
      assert.equal(await readFile(download, 'utf8'), 'disk image bytes');
      await rm(download);
      await writeFile(binary, Buffer.concat([await readFile(binary), Buffer.from('changed')]));
      assert.notEqual(
        spawnSync(
          process.execPath,
          [fileURLToPath(script('package-desktop.mjs')), target, platform],
          { cwd: dir },
        ).status,
        0,
      );
      assert.deepEqual(await readdir(path.join(dir, 'release-assets')), []);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
);
