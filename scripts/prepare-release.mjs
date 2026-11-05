import { createHash } from 'node:crypto';
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';

const { version } = JSON.parse(await readFile('package.json', 'utf8'));
const prefix = `Atlas-Canvas_${version}_`;
const expected = [
  'macOS-Intel.dmg',
  'macOS-Apple-Silicon.dmg',
  'Windows-x64-setup.exe',
  'Linux-x64.deb',
  'Linux-x64.AppImage',
].map((name) => `${prefix}${name}`);
const actual = await readdir('release-assets');
if (
  expected.some((name) => !actual.includes(name)) ||
  actual.some((name) => !expected.includes(name))
)
  throw new Error(
    `Release must contain exactly the five desktop packages. Found: ${actual.join(', ')}`,
  );
for (const name of expected)
  if (!(await stat(`release-assets/${name}`)).size) throw new Error(`Empty package: ${name}`);
const names = (await readdir('release-assets')).sort();
const hashes = await Promise.all(
  names.map(
    async (name) =>
      `${createHash('sha256')
        .update(await readFile(`release-assets/${name}`))
        .digest('hex')}  ${name}`,
  ),
);
await writeFile('release-assets/SHA256SUMS.txt', `${hashes.join('\n')}\n`);
console.log(`Prepared ${names.length} files and SHA256SUMS.txt`);
