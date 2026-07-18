import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { runtimeAssetSchema } from '../../packages/contracts/src/index.js';

const root = path.resolve(import.meta.dirname, '../..');
const runtimeDirectory = path.join(root, 'apps/web/public/assets/runtime');
const manifest = runtimeAssetSchema.array().parse(
  JSON.parse(await readFile(path.join(runtimeDirectory, 'manifest.json'), 'utf8')),
);
const allowedLicenses = new Set(['CC Attribution', 'CC Attribution 4.0', 'CC0']);
const ids = new Set<string>();
let totalBytes = 0;

for (const asset of manifest) {
  if (ids.has(asset.id)) throw new Error(`Duplicate runtime asset ID: ${asset.id}`);
  ids.add(asset.id);
  if (!allowedLicenses.has(asset.license)) throw new Error(`Disallowed runtime license: ${asset.id} (${asset.license})`);
  if (asset.sourceUid === '1362eba190d2451e9f58dc86eae7a827') throw new Error('Free Standard bow entered runtime bundle');
  const outputPath = path.join(root, 'apps/web/public', asset.outputGlb.replace(/^\//, ''));
  const file = await stat(outputPath);
  if (file.size < 100) throw new Error(`Runtime GLB is empty: ${asset.id}`);
  const header = await readFile(outputPath).then((bytes) => bytes.subarray(0, 4).toString('ascii'));
  if (header !== 'glTF') throw new Error(`Runtime output is not a binary glTF: ${asset.id}`);
  if (file.size > 20 * 1024 * 1024) throw new Error(`Single runtime asset exceeds 20 MiB: ${asset.id}`);
  totalBytes += file.size;
}

if (totalBytes > 100 * 1024 * 1024) {
  throw new Error(`Runtime asset bundle exceeds 100 MiB: ${(totalBytes / 1024 / 1024).toFixed(1)} MiB`);
}

process.stdout.write(
  `Validated ${manifest.length} runtime GLBs, license allowlist, and ${(totalBytes / 1024 / 1024).toFixed(1)} MiB bundle budget.\n`,
);
