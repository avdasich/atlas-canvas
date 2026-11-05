import { execFileSync } from 'node:child_process';
import { appendFile, readFile } from 'node:fs/promises';

const json = async (path) => JSON.parse(await readFile(path, 'utf8'));
const pkg = await json('package.json');
const lock = await json('package-lock.json');
const config = await json('src-tauri/tauri.conf.json');
const cargo = await readFile('src-tauri/Cargo.toml', 'utf8');
const cargoLock = (await readFile('src-tauri/Cargo.lock', 'utf8')).replaceAll('\r\n', '\n');
const versions = [
  pkg.version,
  lock.version,
  lock.packages[''].version,
  config.version,
  cargo.match(/^version = "([^"]+)"/m)?.[1],
  cargoLock.match(/name = "tauri-app"\nversion = "([^"]+)"/)?.[1],
];
if (versions.some((version) => version !== pkg.version))
  throw new Error(`Version mismatch: ${versions.join(', ')}`);
if (config.identifier !== 'com.m1.tauri-app')
  throw new Error('Production identifier changed; this would open another data directory.');
if (process.argv.includes('--release')) {
  const tag = process.env.RELEASE_TAG ?? '';
  if (!/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(tag) || tag !== `v${pkg.version}`)
    throw new Error(`Use the existing tag v${pkg.version}; received ${tag}`);
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
  const commit = git('rev-parse', '--verify', `refs/tags/${tag}^{commit}`);
  if (commit !== git('rev-parse', 'HEAD'))
    throw new Error('Checkout does not match the requested tag.');
  if (process.env.GITHUB_OUTPUT)
    await appendFile(process.env.GITHUB_OUTPUT, `commit=${commit}\ntag=${tag}\n`);
}
console.log(`Version ${pkg.version}; production identifier preserved.`);
