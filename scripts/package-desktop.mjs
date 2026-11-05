import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const [target, platform] = process.argv.slice(2);
const platforms = {
  'x86_64-apple-darwin': 'macOS-Intel',
  'aarch64-apple-darwin': 'macOS-Apple-Silicon',
  'x86_64-pc-windows-msvc': 'Windows-x64',
  'x86_64-unknown-linux-gnu': 'Linux-x64',
};
if (platforms[target] !== platform) throw new Error('Unknown target/platform combination.');
const { version } = JSON.parse(await readFile('package.json', 'utf8'));
const bundle = path.join('src-tauri', 'target', target, 'release', 'bundle');
const output = 'release-assets';
await mkdir(output, { recursive: true });
const name = `Atlas-Canvas_${version}_${platform}`;
async function copyBundle(directory, extension, suffix = extension) {
  const files = (await readdir(path.join(bundle, directory))).filter((file) =>
    file.endsWith(extension),
  );
  if (files.length !== 1)
    throw new Error(`Expected one ${extension} in ${directory}, found ${files.length}.`);
  await copyFile(path.join(bundle, directory, files[0]), path.join(output, `${name}${suffix}`));
}
if (platform.startsWith('macOS')) {
  const app = path.join(bundle, 'macos', 'Atlas Canvas.app');
  execFileSync('codesign', ['--verify', '--deep', '--strict', '--verbose=2', app], {
    stdio: 'inherit',
  });
  const arch = target.startsWith('aarch64') ? 'arm64' : 'x86_64';
  execFileSync('lipo', [path.join(app, 'Contents', 'MacOS', 'tauri-app'), '-verify_arch', arch], {
    stdio: 'inherit',
  });
  await copyBundle('dmg', '.dmg');
} else if (platform === 'Windows-x64') await copyBundle('nsis', '.exe', '-setup.exe');
else {
  await copyBundle('deb', '.deb');
  await copyBundle('appimage', '.AppImage');
}
console.log(`Packaged ${name}`);
