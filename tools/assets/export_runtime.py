import argparse
import json
import math
import os
import re
import sys

import bpy
from mathutils import Vector


TARGET_HEIGHTS = {
    "player-warrior": 1.8,
    "player-warrior-female": 1.8,
    "player-knight": 1.8,
    "enemy-soldier": 1.8,
    "enemy-archer": 1.8,
    "enemy-swordsman": 1.8,
    "enemy-cultist": 1.8,
    "enemy-inquisitor": 1.8,
    "creature-boar": 1.2,
    "wildlife-horse": 1.7,
    "forest-giant-tree": 15.0,
    "forest-broadleaf-tree": 8.0,
    "forest-log": 1.4,
    "forest-mushrooms": 0.55,
    "refuge-bonfire": 1.8,
    "refuge-chest": 0.66,
    "refuge-anvil": 0.75,
    "refuge-shrine": 2.17,
    "refuge-market": 2.33,
    "refuge-shelter": 1.84,
    "outpost-banner": 2.8,
    "outpost-cage": 2.4,
    "outpost-palisade": 1.38,
    "outpost-command-tent": 3.02,
    "outpost-temple": 8.0,
    "outpost-tower": 12.0,
}


def parse_args():
    raw = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--source-file", required=True)
    return parser.parse_args(raw)


def normalized(value):
    return re.sub(r"[^a-z0-9]", "", value.lower())


def hierarchy_depth(obj):
    depth = 0
    parent = obj.parent
    while parent is not None:
        depth += 1
        parent = parent.parent
    return depth


def find_root(name, source_uid):
    exact = bpy.data.objects.get(name)
    if exact:
        return exact
    needle = normalized(name)
    matches = [obj for obj in bpy.data.objects if normalized(obj.name) == needle]
    if matches:
        return matches[0]
    uid_prefix = normalized(source_uid)[:8]
    uid_matches = [obj for obj in bpy.data.objects if uid_prefix in normalized(obj.name)]
    if uid_matches:
        uid_matches.sort(key=lambda obj: (hierarchy_depth(obj), len(obj.name)))
        return uid_matches[0]
    tokens = [token for token in re.split(r"[_\s]+", name.lower()) if len(token) > 3 and token not in {"root", "mesh", "poly"}]
    scored = []
    for obj in bpy.data.objects:
        candidate = obj.name.lower()
        score = sum(1 for token in tokens if token in candidate)
        if score:
            scored.append((score, obj))
    scored.sort(key=lambda item: (-item[0], len(item[1].name)))
    return scored[0][1] if scored and scored[0][0] >= max(1, len(tokens) - 1) else None


def descendants(root):
    found = []
    stack = [root]
    while stack:
        obj = stack.pop()
        if obj in found:
            continue
        found.append(obj)
        stack.extend(list(obj.children))
    return found


def duplicate_hierarchy(originals, collection):
    mapping = {}
    for original in originals:
        duplicate = original.copy()
        if original.data is not None:
            duplicate.data = original.data.copy()
        duplicate.animation_data_clear()
        if original.animation_data and original.animation_data.action:
            duplicate.animation_data_create()
            duplicate.animation_data.action = original.animation_data.action
        collection.objects.link(duplicate)
        duplicate.matrix_world = original.matrix_world.copy()
        mapping[original] = duplicate
    for original, duplicate in mapping.items():
        if original.parent in mapping:
            world_matrix = duplicate.matrix_world.copy()
            duplicate.parent = mapping[original.parent]
            duplicate.matrix_world = world_matrix
        for modifier in duplicate.modifiers:
            if hasattr(modifier, "object") and modifier.object in mapping:
                modifier.object = mapping[modifier.object]
    return list(mapping.values())


def bounds(objects):
    minimum = Vector((math.inf, math.inf, math.inf))
    maximum = Vector((-math.inf, -math.inf, -math.inf))
    has_mesh = False
    for obj in objects:
        if obj.type != "MESH":
            continue
        has_mesh = True
        for corner in obj.bound_box:
            point = obj.matrix_world @ Vector(corner)
            minimum.x = min(minimum.x, point.x)
            minimum.y = min(minimum.y, point.y)
            minimum.z = min(minimum.z, point.z)
            maximum.x = max(maximum.x, point.x)
            maximum.y = max(maximum.y, point.y)
            maximum.z = max(maximum.z, point.z)
    if not has_mesh:
        raise RuntimeError("Selection has no mesh bounds")
    return minimum, maximum


def export_asset(asset, output_directory):
    root = find_root(asset["sourceRoot"], asset["sourceUid"])
    if root is None:
        similar = ", ".join(obj.name for obj in list(bpy.data.objects)[:35])
        raise RuntimeError(f"Root '{asset['sourceRoot']}' not found. Scene begins: {similar}")
    originals = descendants(root)
    work_collection = bpy.data.collections.new(f"BOE_EXPORT_{asset['id']}")
    bpy.context.scene.collection.children.link(work_collection)
    duplicates = duplicate_hierarchy(originals, work_collection)
    export_root = bpy.data.objects.new("BOE_RUNTIME_ROOT", None)
    work_collection.objects.link(export_root)
    duplicate_set = set(duplicates)
    for duplicate in duplicates:
        if duplicate.parent not in duplicate_set:
            world_matrix = duplicate.matrix_world.copy()
            duplicate.parent = export_root
            duplicate.matrix_world = world_matrix
    minimum, maximum = bounds(duplicates)
    height = max(0.001, maximum.z - minimum.z)
    target_height = TARGET_HEIGHTS.get(asset["id"], height)
    scale = target_height / height
    center_x = (minimum.x + maximum.x) * 0.5
    center_y = (minimum.y + maximum.y) * 0.5
    export_root.scale = (scale, scale, scale)
    export_root.location = (-center_x * scale, -center_y * scale, -minimum.z * scale)
    bpy.context.view_layer.update()
    bpy.ops.object.select_all(action="DESELECT")
    export_root.select_set(True)
    for duplicate in duplicates:
        duplicate.select_set(True)
    bpy.context.view_layer.objects.active = export_root
    output_path = os.path.join(output_directory, os.path.basename(asset["outputGlb"]))
    os.makedirs(output_directory, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=output_path,
        export_format="GLB",
        use_selection=True,
        export_animations=True,
        export_nla_strips=True,
        export_frame_range=True,
        export_yup=True,
        export_apply=False,
        export_cameras=False,
        export_lights=False,
        export_extras=True,
        export_image_format="AUTO",
        export_materials="EXPORT",
    )
    size = os.path.getsize(output_path)
    print(f"BOE_EXPORT_OK {asset['id']} root={root.name} bytes={size}")
    bpy.ops.object.select_all(action="DESELECT")
    for duplicate in duplicates:
        bpy.data.objects.remove(duplicate, do_unlink=True)
    bpy.data.objects.remove(export_root, do_unlink=True)
    bpy.data.collections.remove(work_collection)


def main():
    args = parse_args()
    with open(args.manifest, "r", encoding="utf-8") as handle:
        manifest = json.load(handle)
    assets = [asset for asset in manifest if asset["sourceBlend"] == args.source_file]
    if not assets:
        print(f"No runtime assets requested from {args.source_file}")
        return
    failures = []
    for asset in assets:
        try:
            export_asset(asset, args.output)
        except Exception as error:
            failures.append(f"{asset['id']}: {error}")
            print(f"BOE_EXPORT_FAILED {asset['id']} {error}", file=sys.stderr)
    if failures:
        raise RuntimeError("; ".join(failures))


if __name__ == "__main__":
    main()
