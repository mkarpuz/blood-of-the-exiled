#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SOURCE="${BOE_ASSET_SOURCE:-/Users/karpuz/Documents/boe/assets}"
BLENDER="${BLENDER_BIN:-/Applications/Blender.app/Contents/MacOS/Blender}"
MANIFEST="$ROOT/apps/web/public/assets/runtime/manifest.json"
OUTPUT="$ROOT/apps/web/public/assets/runtime"
BEFORE="$ROOT/tools/assets/.source-hashes.before.json"
AFTER="$ROOT/tools/assets/.source-hashes.after.json"

cd "$ROOT"
node --import tsx tools/assets/hash-sources.ts --output tools/assets/.source-hashes.before.json

while IFS= read -r source_file; do
  "$BLENDER" -b "$SOURCE/blender/$source_file" \
    --python "$ROOT/tools/assets/export_runtime.py" -- \
    --manifest "$MANIFEST" \
    --output "$OUTPUT" \
    --source-file "$source_file"
done < <(jq -r '.[].sourceBlend' "$MANIFEST" | sort -u)

for glb in "$OUTPUT"/*.glb; do
  temporary="${glb%.glb}.optimized.glb"
  "$ROOT/node_modules/.bin/gltf-transform" optimize "$glb" "$temporary" \
    --compress meshopt \
    --texture-compress webp \
    --texture-size 1024
  mv "$temporary" "$glb"
done

node --import tsx tools/assets/hash-sources.ts --output tools/assets/.source-hashes.after.json --compare tools/assets/.source-hashes.before.json
node --import tsx tools/assets/generate-attribution.ts
node --import tsx tools/assets/validate-runtime.ts

echo "Runtime asset export completed without changing source assets."
