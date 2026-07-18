import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { runtimeAssetSchema } from '../../packages/contracts/src/index.js';

const root = path.resolve(import.meta.dirname, '../..');
const manifestPath = path.join(root, 'apps/web/public/assets/runtime/manifest.json');
const outputPath = path.join(root, 'ATTRIBUTION.md');
const manifest = runtimeAssetSchema.array().parse(JSON.parse(await readFile(manifestPath, 'utf8')));
const lines = [
  '# Blood of the Exiled Runtime Asset Attribution',
  '',
  'Generated from `apps/web/public/assets/runtime/manifest.json`. Source Blender files are preserved as immutable inputs and are not redistributed by this runtime bundle.',
  '',
  '| Runtime asset | Creator | License | Source |',
  '|---|---|---|---|',
  ...manifest.map(
    (asset) =>
      `| ${escapeCell(asset.id)} | ${escapeCell(asset.author)} | ${escapeCell(asset.license)} | [source](${asset.sourceUrl}) |`,
  ),
  '',
  '## Exclusions',
  '',
  '- The supplied Low Poly Bow (`1362eba190d2451e9f58dc86eae7a827`) is preserved in source assets but excluded from the browser runtime because its Free Standard license is not on the public-bundle allowlist.',
  '',
  '## Software And Voice',
  '',
  '- Three.js, React, Rapier, Fastify, PostgreSQL, DeepSeek, Whisper, and Piper are used by the game runtime and services.',
  '- Thorsten German voice data and Piper model are CC0.',
  '- The LJSpeech dataset is public domain; the game-owned Piper voice container provides English NPC speech.',
  '',
];
await writeFile(outputPath, `${lines.join('\n')}\n`);

function escapeCell(value: string): string {
  return value.replaceAll('|', '\\|');
}
