## Purpose

This file defines repo-level guardrails for AI-assisted work in Blood of the Exiled.
Keep it short. Put narrow, subsystem-specific procedures in `.codex/skills/` or future scoped rules.

## Scope

- Apply these rules to design docs, asset metadata, Blender pipeline notes, future Three.js code, schemas, tests, and UI.
- Prefer the smallest change that fully solves the task.
- Keep the Git repo lightweight. Track source notes, code, attribution, and small web-ready assets; keep large working assets outside Git unless a repo policy explicitly says otherwise.
- Treat the context window as a limited shared resource. Avoid adding instructions, abstractions, or files that do not pay for themselves.

## Do Not

- Do not refactor unrelated docs or code while fixing a local issue.
- Do not expose gameplay, menus, loaders, or UI controls for systems that are only stubbed, mocked, or missing required assets.
- Do not describe planned features, assets, or pipelines as implemented unless they are actually usable from the repo.
- Do not keep dead prototypes, stale asset IDs, retired concept names, outdated comments, or unused branches after a feature or asset change.
- Do not duplicate the same instruction across `AGENTS.md`, skills, docs, and code comments.
- Do not add frameworks, build tooling, or abstractions until the current project phase needs them.
- Do not add a new abstraction unless it removes repeated active complexity.

## Edit Rules

- Prefer surgical edits over broad rewrites.
- Keep one canonical term for each game concept, asset role, pipeline step, and code path across docs, manifests, tests, and implementation.
- When renaming a concept, asset role, file, or exported object, update all user-visible and developer-visible references in the same change.
- Keep comments factual and local. Remove comments that describe behavior that no longer exists.
- Prefer explicit contracts for data that is stored, validated, imported, rendered, or generated.
- Keep asset records traceable with source, URL, license, author or creator, role, and import/export metadata when available.

## Sync Rules

When a feature, asset, or pipeline contract changes, update the affected pieces in the same change:

- design docs and implementation notes
- asset manifests and attribution metadata
- Blender collection/object naming notes when relevant
- Three.js loaders, scene code, asset paths, and frontend types when they exist
- tests, validation scripts, and build checks when they exist
- relevant README or docs

When a feature, asset, or pipeline path is removed or disabled, remove:

- stale design claims
- manifest entries or import metadata for retired assets
- loader paths, UI rendering, and gameplay branches for retired behavior
- unused test cases and mocks
- comments and docs for the retired behavior

## Docs Rules

- If a change makes `README.md`, planning docs, asset docs, or a repo-local skill inaccurate, update it before closing the task.
- Keep README-level docs high signal: current phase, architecture, real capabilities, source-of-truth files, and current limitations.
- Clearly distinguish planned gameplay from implemented gameplay.
- Do not check in large Blender source files, generated caches, or bulky downloads just to make docs easier to write.

## Quality Floor

- Add or update tests when behavior changes in shared or user-visible paths.
- Add or update a small deterministic check script when the same drift pattern appears more than once.
- Run the repo-local hygiene check before declaring work complete when docs, assets, pipeline contracts, or gameplay code changed.
- Report blockers clearly when the environment prevents validation.

## Skills

Use the existing repo-local skills when the task matches them:

- `codebase-hygiene`

If a rule only matters for one subsystem or file area, move it out of `AGENTS.md` into a skill or future scoped rule rather than growing this file.
