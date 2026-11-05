import { execFileSync, spawnSync } from 'node:child_process';
import { readdir } from 'node:fs/promises';

const tag = process.env.RELEASE_TAG ?? '';
if (!/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(tag)) throw new Error('Invalid release tag.');
const gh = (...args) =>
  execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
// List also finds drafts. A network/auth failure aborts rather than being treated as a missing release.
const releases = JSON.parse(
  gh('api', '--paginate', '--slurp', 'repos/{owner}/{repo}/releases?per_page=100'),
).flat();
const existing = releases.find((release) => release.tag_name === tag);
if (existing && !existing.draft)
  throw new Error(
    'This release is already published. Choose a new version; published assets are not replaced.',
  );
const notes = '.github/RELEASE_NOTES.md';
if (!existing)
  gh(
    'release',
    'create',
    tag,
    '--verify-tag',
    '--draft',
    '--prerelease',
    '--title',
    `Atlas Canvas ${tag}`,
    '--notes-file',
    notes,
  );
else gh('release', 'edit', tag, '--notes-file', notes);
const files = (await readdir('release-assets')).sort().map((name) => `release-assets/${name}`);
if (!files.length) throw new Error('No release assets.');
const result = spawnSync('gh', ['release', 'upload', tag, ...files, '--clobber'], {
  stdio: 'inherit',
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
console.log(`Draft ${tag} is ready for manual review and publication.`);
