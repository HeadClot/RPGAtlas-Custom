# RPGAtlas documentation index

This directory has two kinds of material:

1. **Current contributor documentation** — the architecture overview and this index describe the
   code that is on the current branch.
2. **Historical implementation records** — the completed Atlas HD, Project Beacon, Project Compass,
   and Project Harbor roadmaps and phase specs preserve the decisions and acceptance gates that
   produced the shipped features. They are references, not a promise that every intermediate design
   still matches the current implementation.

## Current contributor references

- [Architecture overview](architectural_overview.md) — runtime boundaries, data flow, storage, export,
  rendering, desktop, and multiplayer responsibilities.
- [Contributor workflow](../CONTRIBUTING.md) — setup, commands, documentation workflow, and gates.
- [Project wiki](../wiki/Home.md) — creator-facing manual and API reference.
- [Static docs site](../docs-site/index.html) — generated from `wiki/`.

## Completed roadmap families

| Family | Status | Current entry point | Historical material |
|---|---|---|---|
| Atlas HD | Complete; shipped in 1.0 | [`architectural_overview.md`](architectural_overview.md) | [`PRODUCTION_ROADMAP.md`](PRODUCTION_ROADMAP.md), `phase-0` through `phase-8` specs |
| Project Compass | Complete; MV/MZ import and parity work shipped | [Migration Guide](../wiki/Migration-Guide.md) | [`MZ_MV_MIGRATION_ROADMAP.md`](MZ_MV_MIGRATION_ROADMAP.md), [`mz-mv-parity-matrix.md`](mz-mv-parity-matrix.md), `mig-0` through `mig-6` specs |
| Project Beacon | Complete; multiplayer release shipped | [Making Your Game Multiplayer](../wiki/Making-Your-Game-Multiplayer.md) | [`MULTIPLAYER_ROADMAP.md`](MULTIPLAYER_ROADMAP.md), `mp-0` through `mp-9` specs |
| Project Harbor | Complete; project-folder desktop workflow shipped | [Your Game Is a Folder](../wiki/Your-Game-Is-a-Folder.md) | [`PROJECT_FOLDERS_ROADMAP.md`](PROJECT_FOLDERS_ROADMAP.md), `harbor-1` through `harbor-6` specs |

The standalone [`phase-0-bug-audit.md`](phase-0-bug-audit.md) records the original safety-net audit.
When a current behavior differs from a historical spec, prefer the source code, tests, README, and
wiki pages linked above.

## Documentation source of truth

Edit `wiki/*.md` for creator-facing content. Run `npm run docs:build` to regenerate `docs-site/`, and
run `npm run docs:check` before committing. The check renders a temporary site, compares it byte-for-
byte with the committed site, validates page parity, and checks internal Markdown links and heading
anchors without modifying repository files.
