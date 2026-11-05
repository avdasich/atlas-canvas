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
    await mkdir(path.join(dir, 'demo'));
    await writeFile(path.join(dir, 'package.json'), JSON.stringify({ version: '1.2.3' }));
    for (const name of ['Atlas-Canvas-Iceland.atlas', 'README.md', 'README.en.md'])
      await writeFile(path.join(dir, 'demo', name), 'public demo');
    await writeFile(
      path.join(dir, 'demo', 'README.md'),
      '[English](README.en.md)\n![Demo](preview.png)',
    );
    const files = [
      'macOS-Intel.dmg',
      'macOS-Intel.zip',
      'macOS-Apple-Silicon.dmg',
      'macOS-Apple-Silicon.zip',
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
    assert.equal((await readdir(path.join(dir, 'release-assets'))).length, 6);
    const last = files.at(-1);
    await writeFile(path.join(dir, 'release-assets', last), `package:${last}`);
    run('prepare-release.mjs', dir);
    const instructions = await readFile(
      path.join(dir, 'release-assets', 'DEMO-README.ru.md'),
      'utf8',
    );
    assert.match(
      instructions,
      /https:\/\/github\.com\/[^\s]+\/blob\/v1\.2\.3\/demo\/README\.en\.md/,
    );
    assert.match(instructions, /preview\.png\?raw=true/);
    const sums = (await readFile(path.join(dir, 'release-assets', 'SHA256SUMS.txt'), 'utf8'))
      .trim()
      .split('\n');
    assert.equal(sums.length, 10);
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
