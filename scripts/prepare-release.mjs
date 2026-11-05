import { createHash } from 'node:crypto';
import { copyFile, readFile, readdir, stat, writeFile } from 'node:fs/promises';

const { version } = JSON.parse(await readFile('package.json', 'utf8'));
const prefix = `Atlas-Canvas_${version}_`;
const expected = [
  'macOS-Intel.dmg',
  'macOS-Intel.zip',
  'macOS-Apple-Silicon.dmg',
  'macOS-Apple-Silicon.zip',
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
    `Release must contain exactly the seven desktop packages. Found: ${actual.join(', ')}`,
  );
for (const name of expected)
  if (!(await stat(`release-assets/${name}`)).size) throw new Error(`Empty package: ${name}`);
await copyFile('demo/Atlas-Canvas-Iceland.atlas', 'release-assets/Atlas-Canvas-Iceland.atlas');
// Downloaded Markdown attachments must not point at repository-relative paths.
const repository = process.env.GITHUB_REPOSITORY ?? 'avdasich/atlas-canvas';
if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository))
  throw new Error('Invalid repository name.');
const base = `https://github.com/${repository}/blob/v${version}/demo/`;
for (const [source, language] of [
  ['README.md', 'ru'],
  ['README.en.md', 'en'],
]) {
  const text = (await readFile(`demo/${source}`, 'utf8')).replace(
    /(\[[^\]]*\]\()([^\s)]+)(\))/g,
    (match, start, target, end) => {
      if (/^(https?:|#)/.test(target)) return match;
      const url = new URL(target, base);
      if (/\.(png|jpe?g|svg|atlas)$/i.test(url.pathname)) url.searchParams.set('raw', 'true');
      return `${start}${url.href}${end}`;
    },
  );
  await writeFile(`release-assets/DEMO-README.${language}.md`, text);
}
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
