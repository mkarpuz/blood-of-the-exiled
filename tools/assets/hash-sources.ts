import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

interface HashSnapshot {
  source: string;
  generatedAt: string;
  files: Record<string, { sha256: string; bytes: number }>;
}

const root = path.resolve(import.meta.dirname, '../..');
const defaultSource = '/Users/karpuz/Documents/boe/assets';
const source = path.resolve(process.env.BOE_ASSET_SOURCE ?? defaultSource);
const args = process.argv.slice(2);

const outputIndex = args.indexOf('--output');
const compareIndex = args.indexOf('--compare');
const baseline = args.includes('--write-baseline');
const verify = args.includes('--verify');
const output = outputIndex >= 0 ? path.resolve(root, args[outputIndex + 1] ?? '') : null;
const compare = compareIndex >= 0 ? path.resolve(root, args[compareIndex + 1] ?? '') : null;
const baselinePath = path.resolve(root, 'tools/assets/source-hashes.json');

const snapshot = await createSnapshot(source);

if (output) await writeFile(output, `${JSON.stringify(snapshot, null, 2)}\n`);
if (baseline) await writeFile(baselinePath, `${JSON.stringify(snapshot, null, 2)}\n`);
if (compare) await compareSnapshots(JSON.parse(await readFile(compare, 'utf8')) as HashSnapshot, snapshot);
if (verify) await compareSnapshots(JSON.parse(await readFile(baselinePath, 'utf8')) as HashSnapshot, snapshot);

if (!output && !compare && !baseline && !verify) process.stdout.write(`${JSON.stringify(snapshot, null, 2)}\n`);

async function createSnapshot(sourceDirectory: string): Promise<HashSnapshot> {
  const files = await walk(sourceDirectory);
  const entries: HashSnapshot['files'] = {};
  for (const file of files) {
    const relative = path.relative(sourceDirectory, file);
    const bytes = await readFile(file);
    entries[relative] = {
      sha256: createHash('sha256').update(bytes).digest('hex'),
      bytes: bytes.byteLength,
    };
  }
  return { source: sourceDirectory, generatedAt: new Date().toISOString(), files: entries };
}

async function walk(directory: string): Promise<string[]> {
  const results: string[] = [];
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (entry.name === '.DS_Store') continue;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) results.push(...(await walk(target)));
    else if (entry.isFile()) results.push(target);
  }
  return results;
}

async function compareSnapshots(before: HashSnapshot, after: HashSnapshot): Promise<void> {
  const beforeFiles = Object.keys(before.files).sort();
  const afterFiles = Object.keys(after.files).sort();
  if (JSON.stringify(beforeFiles) !== JSON.stringify(afterFiles)) {
    throw new Error('Immutable asset source file list changed');
  }
  const changed = beforeFiles.filter(
    (file) =>
      before.files[file]?.sha256 !== after.files[file]?.sha256 ||
      before.files[file]?.bytes !== after.files[file]?.bytes,
  );
  if (changed.length > 0) throw new Error(`Immutable source assets changed: ${changed.join(', ')}`);
  process.stdout.write(`Verified ${beforeFiles.length} immutable source files (${formatBytes(totalBytes(after))}).\n`);
}

function totalBytes(snapshot: HashSnapshot): number {
  return Object.values(snapshot.files).reduce((total, file) => total + file.bytes, 0);
}

function formatBytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}
