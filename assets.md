# Asset Libraries

This repo tracks asset documentation and attribution metadata only. The large Blender `.blend` libraries are kept outside the Git repo to avoid bloating normal Git history.

Assets were downloaded from Sketchfab and PolyHaven, then split into focused `.blend` libraries so character, NPC, creature, enemy, and environment work can stay separate.

## Repo Files

- `assets.md` - asset classification, usage notes, and attributions.
- `mmorpg_asset_manifest.json` - source, role, license, and attribution metadata.

## External Blender Libraries

- `mmorpg_main_characters.blend` - main/player-facing character assets.
- `mmorpg_npcs.blend` - town guards, guild/class NPCs, hostile humanoid NPCs, and NPC weapon attachments.
- `mmorpg_creatures.blend` - creature-only assets such as beasts, monsters, constructs, and spirits.
- `mmorpg_creatures_enemies.blend` - broader enemy library, including hostile humanoids, undead, creatures, and enemy weapon attachments.
- `mmorpg_environment_props.blend` - PolyHaven environment props such as trees, rocks, grass, fern, and branches.

## Classification

- Main characters: hero/player-facing characters and class visual bases.
- NPCs: town guards, class trainers, guild NPCs, hostile humanoids, and NPC equipment.
- Creatures: beasts, monsters, constructs, and spirits.
- Creature enemies: combat-ready hostile humanoids, undead, monsters, beasts, and enemy equipment.
- Environment props: PolyHaven trees, rocks, plants, grass, and branches.

## Notes

The external `.blend` files contain third-party assets from Sketchfab and PolyHaven. Source and license metadata is stored in `mmorpg_asset_manifest.json`, this document, and Blender custom properties.

`mmorpg_environment_props.blend` is large because the PolyHaven tree assets are heavy. Keep environment assets separate from character and NPC files when working on machines with limited RAM.

## Asset Attributions

Sketchfab assets are licensed as Creative Commons Attribution unless noted otherwise. Credit the listed creator when using these assets. PolyHaven assets are CC0, but are still listed for source transparency.

### Sketchfab

- [Low Poly Warrior](https://sketchfab.com/3d-models/low-poly-warrior-23954b0a176a497788dcd3a29204382f) by `gsantos` - CC Attribution.
- [The Forgotten Knight](https://sketchfab.com/3d-models/the-forgotten-knight-d14eb14d83bd4e7ba7cbe443d76a10fd) by `dark_igorek` - CC Attribution 4.0.
- [Warrior Female Game Character Low Poly](https://sketchfab.com/3d-models/warrior_female_game_character_low_poly-404cb53601664f2d874cf83968abdbcc) by `Karthiknaidu97` - CC Attribution.
- [Low poly knight](https://sketchfab.com/3d-models/low_poly_knight-89f07417e7b646b18fd8f879d773c188) by `Vaporworks` - CC Attribution.
- [Stone Hammer With Crystals](https://sketchfab.com/3d-models/stone_hammer_with_crystals-51fe3f9e61a44866a06d3b124ed8a301) by `tridentcorp` - CC Attribution.
- [Bow - Medieval Fantasy Challenge](https://sketchfab.com/3d-models/bow_medieval_fantasy_challenge-378bd65658654595a4e5b3e152309385) by `tuturu` - CC Attribution.
- [Ranger](https://sketchfab.com/3d-models/ranger-7ed76f06e0d3459fa71ffcb891120463) by `nolanfa` - CC Attribution.
- [Assassin](https://sketchfab.com/3d-models/assassin-c3e82f7d8b954ac0ae9e265e2bad58ff) by `TaKiBeAtZ` - CC Attribution.
- [Low Poly Wizard](https://sketchfab.com/3d-models/low_poly_wizard-5a21c8a929e44019b10736b2af96ef4d) by `itayron10` - CC Attribution.
- [Base Mesh Low Poly Character](https://sketchfab.com/3d-models/base_mesh_low_poly_character-84cd6685487949bca626bcfc244d2e12) by `YOPN` - CC Attribution.
- [Air Genasi Monk](https://sketchfab.com/3d-models/air_genasi_monk-d227dedc852b4955a5d1fc0a500b70d4) by `TheOneMissing` - CC Attribution.
- [battle axe low poly](https://sketchfab.com/3d-models/battle_axe_low_poly-a4b94adcbc8449c6a0a9599f234c994a) by `excellenthe` - CC Attribution.
- [Low Poly Necromancer Character](https://sketchfab.com/3d-models/low_poly_necromancer_character-dcacae34df4846a68b49a8a29c80aed3) by `Doingyman1` - CC Attribution.
- [Dwarf Character](https://sketchfab.com/3d-models/dwarf_character-b17f2e022a1e4790b9feb770b0740029) by `tanguydespat` - CC Attribution.
- [Low poly elf female base](https://sketchfab.com/3d-models/low_poly_elf_female_base-15f29bd55ca84d908aa2228de3a862e2) by `loverett` - CC Attribution.
- [LowPoly Style Exploration#2](https://sketchfab.com/3d-models/lowpoly_style_exploration_2-51387ff3f0344272a2806d49e304215d) by `rmorais` - CC Attribution.
- [Armored Goblin Warrior Low Poly Game Ready](https://sketchfab.com/3d-models/armored_goblin_warrior_low_poly_game_ready-dc643e6067794cc988d94a72181bd48c) by `Hdjusj` - CC Attribution.
- [Szkielet wojownik /  Skeleton Warrior](https://sketchfab.com/3d-models/szkielet_wojownik_skeleton_warrior-e359133a65e54f438da60ea684c1590a) by `tigtrzyer` - CC Attribution.
- [Low Poly Zombie](https://sketchfab.com/3d-models/low_poly_zombie-0d60cd9d07b64d3b9b45239911e23811) by `meteyektay` - CC Attribution.
- [Darkling Ball (animated)](https://sketchfab.com/3d-models/darkling_ball_animated-fd0084763faf4affaf4ef184ad58cde4) by `diegoichinose` - CC Attribution.
- [Demon Male Base Mesh](https://sketchfab.com/3d-models/demon_male_base_mesh-5892390b0f2f49fab9b066c5fc8c3c3a) by `mesh-base` - CC Attribution.
- [Rock Golem](https://sketchfab.com/3d-models/rock_golem-be9ae5737b614ee78071f81384c2e2e1) by `thecore37` - CC Attribution.
- [Troll](https://sketchfab.com/3d-models/troll-93c68a096e5145439aaadc27669850e7) by `Cristobal_Fermandois` - CC Attribution.
- [Boar - Animated Low Poly](https://sketchfab.com/3d-models/boar_animated_low_poly-0edc88ad27fc4fab853397de7ce0d0cc) by `WildPoly3D` - CC Attribution.
- [Half-Spider Spider](https://sketchfab.com/3d-models/half_spider_spider-1a2e289331494bb1bee06d539c069096) by `cupiniki` - CC Attribution.
- [Low-poly Rhamphorhynchus idle](https://sketchfab.com/3d-models/low_poly_rhamphorhynchus_idle-c1e35c7ac4374c778f78025717694675) by `xiaorobear` - CC Attribution.
- [Low Poly Slime Animated](https://sketchfab.com/3d-models/low_poly_slime_animated-25e9d86a651c4de0b303f6b754b649f8) by `baltazo` - CC Attribution.

### PolyHaven

- [Grass Medium 01](https://polyhaven.com/a/grass_medium_01) by Poly Haven - CC0.
- [Rock Moss Set 02](https://polyhaven.com/a/rock_moss_set_02) by Poly Haven - CC0.
- [Rock Moss Set 01](https://polyhaven.com/a/rock_moss_set_01) by Poly Haven - CC0.
- [Fern 02](https://polyhaven.com/a/fern_02) by Poly Haven - CC0.
- [Fir Tree 01](https://polyhaven.com/a/fir_tree_01) by Poly Haven - CC0.
- [Fir Sapling Medium](https://polyhaven.com/a/fir_sapling_medium) by Poly Haven - CC0.
- [Dry Branches Medium 01](https://polyhaven.com/a/dry_branches_medium_01) by Poly Haven - CC0.
- [Pine Tree 01](https://polyhaven.com/a/pine_tree_01) by Poly Haven - CC0.
