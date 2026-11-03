import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const notices = [];
const upstream = existsSync('public/licenses/upstream/index.json')
  ? JSON.parse(readFileSync('public/licenses/upstream/index.json', 'utf8'))
  : {};
function licenses(directory) {
  return readdirSync(directory)
    .filter((name) => /^(LICEN[CS]E|COPYING|NOTICE)([-_.]|$)/i.test(name))
    .flatMap((name) => {
      try {
        const text = readFileSync(join(directory, name), 'utf8');
        return text.length < 400000 ? [{ name, text }] : [];
      } catch {
        return [];
      }
    });
}
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
for (const [path, info] of Object.entries(lock.packages)) {
  if (!path || info.dev || !existsSync(join(path, 'package.json'))) continue;
  const p = JSON.parse(readFileSync(join(path, 'package.json'), 'utf8'));
  notices.push({
    ecosystem: 'npm',
    name: p.name,
    version: p.version,
    license: typeof p.license === 'string' ? p.license : JSON.stringify(p.license ?? ''),
    repository: typeof p.repository === 'string' ? p.repository : (p.repository?.url ?? ''),
    files: licenses(path),
  });
}
const metadata = JSON.parse(
  execFileSync(
    'cargo',
    ['metadata', '--manifest-path', 'src-tauri/Cargo.toml', '--locked', '--format-version', '1'],
    { maxBuffer: 30 * 1024 * 1024, encoding: 'utf8' },
  ),
);
for (const p of metadata.packages) {
  if (!p.source) continue;
  let files = licenses(dirname(p.manifest_path));
  if (p.license_file) {
    try {
      const text = readFileSync(join(dirname(p.manifest_path), p.license_file), 'utf8');
      if (!files.some((f) => f.text === text)) files.push({ name: p.license_file, text });
    } catch {}
  }
  if (!files.length)
    files = (upstream[`${p.name}@${p.version}`] ?? []).map((file) => {
      const bytes = readFileSync(join('public', file.path));
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      if (file.sha256 && sha256 !== file.sha256)
        throw new Error(`Upstream license checksum mismatch: ${file.path}`);
      return {
        name: file.name,
        text: bytes.toString('utf8'),
        source: file.source,
        ...(file.commit ? { commit: file.commit } : {}),
        ...(file.sha256 ? { sha256 } : {}),
      };
    });
  notices.push({
    ecosystem: 'cargo',
    name: p.name,
    version: p.version,
    license: p.license ?? '',
    repository: p.repository ?? '',
    files,
  });
}
for (const family of ['NotoSans', 'NotoSerif'])
  notices.push({
    ecosystem: 'font',
    name: family,
    version: 'bundled',
    license: 'OFL-1.1',
    repository: `https://github.com/google/fonts/tree/main/ofl/${family.toLowerCase()}`,
    files: [
      { name: `${family}-OFL.txt`, text: readFileSync(`public/fonts/${family}-OFL.txt`, 'utf8') },
    ],
  });
notices.sort((a, b) => `${a.ecosystem}/${a.name}`.localeCompare(`${b.ecosystem}/${b.name}`));
mkdirSync('public/licenses', { recursive: true });
writeFileSync('public/licenses/notices.json', JSON.stringify(notices));
writeFileSync(
  'public/licenses/README.txt',
  'Third-party software and font notices bundled with Atlas Canvas. Generated from installed npm/Cargo packages. License expressions and available original license/notice files are retained. See fonts/SOURCES.md for unmodified font sources and hashes.\n',
);
console.log(
  `Bundled notices: ${notices.length}; with license texts: ${notices.filter((n) => n.files.length).length}; size: ${readFileSync('public/licenses/notices.json').length} bytes`,
);
