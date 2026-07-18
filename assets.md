# Asset Libraries

This repo tracks asset documentation and attribution metadata only. The large Blender `.blend` libraries are kept outside the Git repo to avoid bloating normal Git history.

Assets were downloaded from Sketchfab and PolyHaven, then split into focused `.blend` libraries so character, NPC, creature, enemy, and environment work can stay separate.

## Repo Files

- `assets.md` - asset classification, usage notes, and attributions.
- `mmorpg_asset_manifest.json` - source, role, license, and attribution metadata.

## External Blender Libraries

### Original libraries
- `mmorpg_main_characters.blend` - main/player-facing character assets.
- `mmorpg_npcs.blend` - town guards, guild/class NPCs, hostile humanoid NPCs, and NPC weapon attachments.
- `mmorpg_creatures.blend` - creature-only assets such as beasts, monsters, constructs, and spirits.
- `mmorpg_creatures_enemies.blend` - broader enemy library, including hostile humanoids, undead, creatures, and enemy weapon attachments.
- `mmorpg_environment_props.blend` - PolyHaven environment props such as trees, rocks, grass, fern, and branches.

### New libraries (added 2026-07-18)
- `mmorpg_passive_wildlife.blend` - passive/neutral wildlife for the great forest and world atmosphere. Currently: 1 animated horse (954 polys).
- `mmorpg_concord.blend` - Concord enemy faction assets. Currently: 9 enemies (~14,759 polys) including inquisitor, soldiers, archers, cultists, guards, swordsman, warrior.
- `mmorpg_concord_structures.blend` - Concord outpost structures and oppressive faction dressing. Currently: 5 structures (~8,324 source polys / 8,308 imported mesh polys) including banner, prison cage, palisade wall, spiked obstacle, and command tent.
- `mmorpg_great_forest_props.blend` - broadleaf trees, fantasy trees, mushrooms, logs, stumps for the great forest start area. Currently: 8 props (~21,228 polys).
- `mmorpg_gear.blend` - v1 starter gear assets. Currently: 7 assets (~6,558 source polys / 7,284 imported mesh polys) including melee weapon pack, bow, wizard staff, two helmets, and potion placeholders.
- `mmorpg_free_territory_structures.blend` - exile refuge structures and crafting/social props. Currently: 6 structures (~3,066 source polys / 3,206 imported mesh polys) including bonfire, chest/crate, anvil, shrine, market stall, and mentor shelter.

### Planned libraries (not yet created)
- `mmorpg_city_structures.blend` - medieval houses, walls, towers, gates, temples for Free Territory and Concord cities.

## Classification

- Main characters: hero/player-facing characters and class visual bases.
- NPCs: town guards, class trainers, guild NPCs, hostile humanoids, and NPC equipment.
- Creatures: beasts, monsters, constructs, and spirits.
- Creature enemies: combat-ready hostile humanoids, undead, monsters, beasts, and enemy equipment.
- Environment props: PolyHaven trees, rocks, plants, grass, and branches.
- Passive wildlife: non-hostile animals for atmosphere and immersion (deer, rabbit, horse, etc.).
- Concord enemies: the main enemy faction — soldiers, guards, inquisitors, cultists, archers.
- Concord structures: enemy outpost dressing — banners, cages, palisades, barricades, command tents.
- Great forest props: broadleaf trees, fantasy trees, mushrooms, logs, stumps for the forest start area.
- City structures: medieval houses, walls, towers, gates, temples.
- Gear: equippable weapons, armor, consumables, crafting materials.
- Free Territory structures: exile refuge buildings and crafting stations.

## Notes

The external `.blend` files contain third-party assets from Sketchfab and PolyHaven. Source and license metadata is stored in `mmorpg_asset_manifest.json`, this document, and Blender custom properties.

`mmorpg_environment_props.blend` is large because the PolyHaven tree assets are heavy. Keep environment assets separate from character and NPC files when working on machines with limited RAM.

### ⚠️ PolyHaven Tree Warning (8GB RAM)

**Do NOT download PolyHaven TREE assets on 8GB RAM.** PolyHaven trees are archviz/film quality (1-4 million polys each). Importing and decimating them freezes Blender on 8GB RAM. Use Sketchfab for trees (game-ready, 500-8000 polys). PolyHaven is fine for SMALL props only (flowers, shrubs, rocks — under ~5000 polys per part).

### RAM-Safe Workflow (8GB)

1. One Blender instance open at a time.
2. One download/import at a time.
3. After import: check polys, rename, save.
4. Close Blender between heavy sessions.
5. Never download assets over ~50k polys for crowd use. Reserve 100k+ assets for single-instance bosses only.

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

### New Sketchfab Assets (added 2026-07-18)

#### Passive Wildlife (`mmorpg_passive_wildlife.blend`)
- [animated low poly horse game ready](https://sketchfab.com/3d-models/animated_low_poly_horse_game_ready-4eaa5217803a49d79612ae9d5cd39d84) by `creosine` - CC Attribution. (954 polys, rigged + animated)

#### Concord Enemies (`mmorpg_concord.blend`)
- [Dark Fantasy Monk PSX Style Low-Poly](https://sketchfab.com/3d-models/dark_fantasy_monk_psx_style_low_poly-37019a9217804568b6f244968cd999f3) by `JimWing` - CC Attribution. (692 polys — Concord Inquisitor)
- [Low Poly Knight](https://sketchfab.com/3d-models/low_poly_knight-4c9d5dd1740343a9b5b50a2bacd7ee32) by `rakshaan` - CC Attribution. (3348 polys — Concord Soldier)
- [Low-Poly Stylized Archer](https://sketchfab.com/3d-models/low_poly_stylized_archer-3c8132cdc6054ca087654fdd9f8d27be) by `RipeR` - CC Attribution. (1052 polys — Concord Archer)
- [PSX Cultist](https://sketchfab.com/3d-models/psx_cultist-c2d89305bb244f60b6319ac94c0867ed) by `VoxelBear` - CC Attribution. (1081 polys — Concord Cultist)
- [Cultist berserker](https://sketchfab.com/3d-models/cultist_berserker-9a68e549f3cd4c87ac5f345e5169af43) by `emotenshi` - CC Attribution. (765 polys, rigged — Concord Cultist Berserker)
- [Swordsman 1](https://sketchfab.com/3d-models/swordsman_1-dbd5967529474547b4777c7a1f6312b0) by `isogl` - CC Attribution. (735 polys — Concord Swordsman)
- [Low Poly Traditional Guards NPC](https://sketchfab.com/3d-models/low_poly_traditional_guards_npc-3f9cce08177b4f4eb31514958638934a) by `nisanurulazizah` - CC Attribution. (4752 polys, rigged — Concord Guard)
- [Low Poly Archer (Rigged)](https://sketchfab.com/3d-models/low_poly_archer_rigged-572c487b457745f5985b6691dcea0e21) by `Yanez-Designs` - CC Attribution. (1400 polys, rigged — Concord Archer Rigged)
- [SIMPLE LOW POLY WARRIOR](https://sketchfab.com/3d-models/simple_low_poly_warrior-dfa80ceee90c4ec49d3d785c22304ee8) by `dreamsstudiodev` - CC Attribution. (1934 polys — Concord Warrior)

#### Concord Structures (`mmorpg_concord_structures.blend`)
- [Low Poly Red Flag - Wooden Pole Banner](https://sketchfab.com/3d-models/low-poly-red-flag-wooden-pole-banner-8d52d2408ef84046bc0a0f6102ec41be) by `marishka1611` - CC Attribution. (296 source polys / 280 imported polys — territory banner)
- [Low-Poly Prison Cage - Free Game Asset](https://sketchfab.com/3d-models/low-poly-prison-cage-free-game-asset-133ab66f21de45f0848b2602e014a00f) by `BuntyS` - CC Attribution. (2290 polys — prison/confinement prop)
- [Wood walls](https://sketchfab.com/3d-models/wood-walls-597732332ee54076898345de1d82530d) by `bumstrum` - CC Attribution. (1536 polys — palisade / rough outpost wall)
- [wooden obstacle with spikes](https://sketchfab.com/3d-models/wooden-obstacle-with-spikes-98657945f9284928b74022488d8c7fd3) by `FayNar` - CC Attribution. (2264 polys — hostile barricade)
- [General's Tent - Siege Equipment Assets](https://sketchfab.com/3d-models/generals-tent-siege-equipment-assets-6003a17f60a04a4caa6f619edbe5e91a) by `stylesmcgoo` - CC Attribution. (1938 polys — command/camp structure)

#### Great Forest Props (`mmorpg_great_forest_props.blend`)
- [Giant Low Poly Tree](https://sketchfab.com/3d-models/giant_low_poly_tree-acfd2b7f80894848b56c2ac8e7e59572) by `sahirvirmani` - CC Attribution. (954 polys — landmark tree)
- [Low Poly Tree](https://sketchfab.com/3d-models/low_poly_tree-4598c065d5534c40b6050c16b69d1b77) by `simonustal` - CC Attribution. (1327 polys — broadleaf)
- [Tree](https://sketchfab.com/3d-models/tree-beab28462a14499ebaf3ea88926da55e) by `bumstrum` - CC Attribution. (3201 polys — forest variety 1)
- [Tree](https://sketchfab.com/3d-models/tree-a2a6237a270840e198cc7db1c47f1ef7) by `bumstrum` - CC Attribution. (3316 polys — forest variety 2)
- [Low Poly Tree Log And Stump](https://sketchfab.com/3d-models/low_poly_tree_log_and_stump-ae1ef76afe00492daa6f8d618e9680f0) by `bitgem` - CC Attribution. (3266 polys — fallen log + stump)
- [Low Poly Mushroom](https://sketchfab.com/3d-models/low_poly_mushroom-b8e7ee500c5b4432bf381e1ca00cc135) by `GGklin` - CC Attribution. (240 polys — gatherable)
- [Stylized Mushrooms - Low Poly](https://sketchfab.com/3d-models/stylized_mushrooms_low_poly-33e4073b371a4fbd93e65bfb16473032) by `CamilleBarral` - CC Attribution. (1328 polys — 3 mushroom varieties)
- [fantasy tree 1](https://sketchfab.com/3d-models/fantasy_tree_1-fee2b59583084ae1a755a1b02133a42c) by `bumstrum` - CC Attribution. (7596 polys — magical deep forest)

#### Gear (`mmorpg_gear.blend`)
- [LOW POLY. PACK. COLD STEEL.](https://sketchfab.com/3d-models/low-poly-pack-cold-steel-33f608447aff4f8eba37d9fcc57b7027) by `greiboz` - CC Attribution. (2188 polys — starter melee weapon pack)
- [Low Poly Bow](https://sketchfab.com/3d-models/low-poly-bow-1362eba190d2451e9f58dc86eae7a827) by `spider.pat.omar` - Free Standard. (212 polys — starter bow)
- [Wizard staff with purple gem](https://sketchfab.com/3d-models/wizard-staff-with-purple-gem-b67e3b0ad5b54349aa47939ab6e7a5c7) by `adysix` - CC Attribution. (214 polys — starter caster staff)
- [Low poly helmet](https://sketchfab.com/3d-models/low-poly-helmet-ae3a2b2ea8e9492fae8a4a6bea9f3505) by `raystani50` - CC Attribution. (726 source polys / 1452 imported polys — starter helmet)
- [Fantasy Helmet Low Poly](https://sketchfab.com/3d-models/fantasy-helmet-low-poly-ecc1611f5087463995e20b36e58d4e01) by `badbanshee` - CC Attribution. (870 polys — alternate helmet)
- [Potion Bottle 12](https://sketchfab.com/3d-models/potion-bottle-12-96279c2e20994598980e68fbe729ecb2) by `nickvisc956` - CC Attribution. (260 polys — potion placeholder)
- [4 Colour Alchemist Potions](https://sketchfab.com/3d-models/4-colour-alchemist-potions-8012a4702dbe4322a0bfb77a46e29a5c) by `incg5764` - CC Attribution. (2088 polys — potion pack)

#### Free Territory Structures (`mmorpg_free_territory_structures.blend`)
- [Bonfire](https://sketchfab.com/3d-models/bonfire-a96d894e8bd14eebafe7cd023178e663) by `rickeletro` - CC Attribution. (844 source polys / 988 imported polys — campfire)
- [Wooden Chest Crate Low poly 3D Game Ready](https://sketchfab.com/3d-models/wooden-chest-crate-low-poly-3d-game-ready-1cea55d981ec460dbe934d5e31feb02e) by `Matvis` - CC Attribution. (204 polys — chest/crate storage)
- [Strong Medieval Anvil](https://sketchfab.com/3d-models/strong-medieval-anvil-ee9c56f809ce4c6fb4c02b42673dc9e1) by `incg5764` - CC Attribution. (228 polys — crafting station)
- [Stone shrine](https://sketchfab.com/3d-models/stone-shrine-fc4a9a9504224a71bb5d47f409100f75) by `FeatheredSnek` - CC Attribution. (1440 source polys / 1436 imported polys — exile shrine/rune-stone)
- [Medieval Stall](https://sketchfab.com/3d-models/medieval-stall-73ddb36968284216b0fa435b649702bb) by `andrea.chierchia` - CC Attribution. (178 polys — market stall)
- [Low-poly Survival Tent](https://sketchfab.com/3d-models/low-poly-survival-tent-f3f5283fa07a47e798017bc3c055fe88) by `simonaskLDE` - CC Attribution. (172 polys — mentor post / shelter)
