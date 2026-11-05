import '../tests/typescript-loader.mjs';
import { execFileSync } from 'node:child_process';
const { parseScene } = await import('../src/domain/scene.ts');

const output = execFileSync(
  process.platform === 'win32' ? 'python' : 'python3',
  ['scripts/check-demo.py'],
  { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
);
const { manifest, bytes } = JSON.parse(output);
for (const { scene } of manifest.scenes) parseScene(scene);
console.log(
  `Demo OK: ${manifest.scenes.length} countries, ${manifest.assets.length} assets, ${(bytes / 1024 / 1024).toFixed(2)} MiB. ZIP, SHA-256 and scene validators pass.`,
);
