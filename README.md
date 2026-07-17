
# blood-of-the-exiled

This is a 3D browser game project based on Three.js.
Characters and world assets are being prepared in Blender, then later exported for Three.js.

## Creation Steps

0. Research, Workflows & Architecture creation
1. Concepts and design: output Markdown files
2. Asset creation in Blender: output `.glb` exports
3. Three.js integration with the `.glb` files: actual codebase

## Current Implementation Step

The project is still early. Right now the main work is research, workflow setup, design notes, and building an asset pipeline that does not make the repo impossible to clone.

We also started a first Blender asset pass. The actual `.blend` files are large, so they are kept outside this Git repo. The repo only tracks the asset notes and attribution metadata.

Current external Blender asset files:

- `mmorpg_main_characters.blend` for the main playable / story character set.
- `mmorpg_npcs.blend` for villagers, traders, guards, and other non-player people.
- `mmorpg_creatures.blend` for animals, beasts, and creature base assets.
- `mmorpg_creatures_enemies.blend` for enemy-looking creature variants.
- `mmorpg_environment_props.blend` for trees and world props.

The assets currently come from Sketchfab and PolyHaven. Sketchfab assets need creator attribution. PolyHaven assets are CC0, but still listed for source transparency.

## Important Files

1. `initial-idea.md` shows the initial vision for the game.
2. `ai-game-reference.md` is the AI-synthesized MMORPG design reference for future agents working on this project.
3. `assets.md` explains the external Blender asset libraries and how they are classified.
4. `mmorpg_asset_manifest.json` stores asset source, license, role, URL, and attribution metadata.

### AI Game Reference Sources

`ai-game-reference.md` was formulated with AI assistance from Youtube video transcripts. The document is a synthesis for design guidance, not a copy of the transcripts.

- Armegon. (n.d.). *What Actually Makes A GOOD MMORPG* [Video]. YouTube. https://youtu.be/QhWKgMzHzM0
- TheLazyPeon. (2019, August 19). *What Makes A Good MMORPG?* [Video]. YouTube. https://youtu.be/VrqmMCxFYSo
- Moon Channel. (2023, August 4). *Why Aren't There Any Good MMORPGs? A Critique of Pure Power* [Video]. YouTube. https://youtu.be/PN1pd3wCRxY
- Alzorath. (n.d.). *Why is it still the best aRPG? [ Diablo 2 Review ]* [Video]. YouTube. https://youtu.be/LhUZXZofd9w
