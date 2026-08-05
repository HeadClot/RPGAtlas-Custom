# RPGAtlas AI Contribution Memory

## Three.js Skill References

Use the installed global Three.js skills below when the corresponding area is in scope. Do not use
WebGPU-based skills or WebGPU APIs for this project.

- `threejs-fundamentals` — scene setup, cameras, renderers, and the core Three.js workflow.
  `C:\Users\Ben Stanley\.agents\skills\threejs-fundamentals\SKILL.md`
- `threejs-animation` — keyframe animation, mixers, clips, and animation playback.
  `C:\Users\Ben Stanley\.agents\skills\threejs-animation\SKILL.md`
- `threejs-geometry` — geometry creation, attributes, buffers, and procedural meshes.
  `C:\Users\Ben Stanley\.agents\skills\threejs-geometry\SKILL.md`
- `threejs-interaction` — raycasting, pointer input, selection, and object interaction.
  `C:\Users\Ben Stanley\.agents\skills\threejs-interaction\SKILL.md`
- `threejs-lighting` — light types, shadows, lighting setup, and environment illumination.
  `C:\Users\Ben Stanley\.agents\skills\threejs-lighting\SKILL.md`
- `threejs-loaders` — GLTF, textures, models, assets, and loading workflows.
  `C:\Users\Ben Stanley\.agents\skills\threejs-loaders\SKILL.md`
- `threejs-materials` — PBR, basic, phong, standard, physical, and custom materials.
  `C:\Users\Ben Stanley\.agents\skills\threejs-materials\SKILL.md`
- `threejs-postprocessing` — EffectComposer, render passes, and screen-space effects.
  `C:\Users\Ben Stanley\.agents\skills\threejs-postprocessing\SKILL.md`
- `threejs-shaders` — GLSL, ShaderMaterial, uniforms, varyings, and custom shader effects.
  `C:\Users\Ben Stanley\.agents\skills\threejs-shaders\SKILL.md`
- `threejs-textures` — texture types, UVs, wrapping, filtering, color spaces, and maps.
  `C:\Users\Ben Stanley\.agents\skills\threejs-textures\SKILL.md`

## Patch Notes Requirement

Every AI-assisted feature addition or substantial project change must include a short, descriptive
entry in `js/patch-notes.js`.

- Append the new entry as an independent `PATCH_NOTES.push({...})` block at the end of
  `js/patch-notes.js`; include a `timestamp` in ISO-8601 format with the author’s local UTC offset
  (for example, `2026-08-05T16:11:53-06:00`). The editor sorts entries newest-first at display time.
- Never overwrite, remove, reorder, or summarize away previous patch notes.
- Include the date, a concise title, a one-sentence summary, and a short list of notable user-facing
  additions or changes.
- Keep entries easily digestible. Name new commands, buttons, tools, or major behaviors explicitly.
- Small bug fixes, formatting-only edits, and internal maintenance do not require an entry unless
  they materially affect users.

## Repository Structure

This repository is organized by application boundary and responsibility. Use the existing tree as
the source of truth; do not move files merely to make a feature fit a preferred architecture.

### TypeScript application code

- `src/shared/` — dependency-light domain code shared by the editor, player, tests, Beacon Node,
  and Cloudflare targets. Stable contract primitives remain at the root; `map/`, `project/`,
  `assets/`, `audio/`, `events/`, and `presentation/` group specialized services, while `net/`
  and `sim/` remain the cross-host networking and deterministic simulation boundaries.
- `src/editor/` — authoring tools. `core/` contains shell/state/action infrastructure, `map-editor/`,
  `advanced/`, `database/`, `event-editor/`, `importers/`, and `project-manager/` contain existing
  authoring features, `export/` owns web export, and `tools/` is split into `assets/`, `content/`,
  `generators/`, and `plugins/`.
- `src/engine/` — player and playtest runtime: boot, loop, scenes, live state, saves, event
  interpretation, plugins, presentation, playtest bridging, and client multiplayer sessions.
- `src/renderer/` — Three.js/WebGL2 HD-2D rendering and render planning. The classic canvas
  renderer and HD-2D renderer consume the same project and map data.
- `src/platform/` — host adapters: browser storage and IndexedDB in `browser/`, and native
  project/asset access in `tauri/`.

### Multiplayer and desktop hosts

- `server/src/core/` — server-authoritative multiplayer behavior: connections, rooms, worlds,
  moderation, persistence contracts, interest management, and action combat.
- `server/src/node/` — plain-Node WebSocket server, worker adapters, file persistence, and the
  operator-facing Node entrypoints.
- `server/src/cf/` — Cloudflare Worker and Durable Object adapters for room/world deployment.
- `src-tauri/` — Rust desktop host, native project-folder commands, asset access, and dedicated
  playtest windows.

### Compatibility, tooling, and static content

- `js/` — compatibility layer and behavior-sensitive classic scripts. This includes procedural
  assets, audio, data defaults, stable globals, legacy project I/O, plugin support, and standalone
  export assembly. Treat these paths as compatibility boundaries and do not rewrite or relocate
  them casually.
- `scripts/` — reproducible build, staging, packaging, documentation, fixture, demo, and asset
  generation scripts. Generated source assets used by these scripts live under `scripts/sources/`
  and `scripts/assets/`.
- `tools/` — Windows launcher sources, launcher build scripts, and asset-manifest maintenance.
- `css/` — static editor and player stylesheets.
- `img/` — built-in art, tilesets, generated packs, icons, and asset documentation.
- `index.html` and `play.html` — editor and player shells. Their classic script dependencies and
  module entrypoints are intentionally kept stable by `vite.config.mjs`.

### Tests and documentation

- `tests-unit/` — Vitest TypeScript tests for shared, editor, engine, renderer, platform, and
  server-facing behavior.
- `tests/` — Node/classic integration and compatibility tests, including import fixtures and
  sample projects under `tests/fixtures/`.
- `tests-e2e/` — Playwright browser, editor, player, multiplayer, export, accessibility, and
  renderer-golden coverage.
- `wiki/` — canonical creator-facing Markdown documentation.
- `docs/` — contributor guidance, architecture notes, roadmaps, and historical specifications.
- `docs-site/` — generated/static HTML documentation site; update the canonical `wiki/` content
  and regenerate this directory instead of editing its HTML by hand.

### Generated and local-only output

Do not edit generated or local-only output directly:

- `dist/` — Vite production output.
- `src-tauri/dist/` — staged frontend embedded by the Tauri application; created by the staging
  build and may be absent in a clean checkout.
- `server/dist/` — bundled Beacon server and worker output.
- `playwright-report/` and `test-results/` — Playwright reports and test artifacts.
- `node_modules/` — installed dependencies.

## Feature Routing

When adding or changing a feature, start in the primary area below and update the dependent
boundaries and tests as needed.

| Feature or responsibility | Primary locations | Related verification |
| --- | --- | --- |
| Editor shell, menus, docks, and authoring workflow | `src/editor/core/`, `src/editor/`, `index.html`, `css/editor.css` | `tests-unit/`, `tests-e2e/` editor specs |
| Map painting, layers, terrain, autotiles, zones, and map connections | `src/editor/map-editor/`, `src/editor/advanced/`, `src/shared/map/` | map, terrain, zone, and advanced-map tests in `tests-unit/`; matching Playwright specs |
| HD-2D rendering, camera, materials, lighting, animation, and post effects | `src/renderer/`, related `src/editor/map-editor/` preview code | renderer-plan and renderer-golden/performance tests |
| Player runtime, scenes, menus, saves, presentation, and input | `src/engine/`, `play.html`, `css/play.css` | runtime tests in `tests-unit/`, player/playtest specs in `tests-e2e/` |
| Event commands and interpreter behavior | editor definitions in `src/editor/event-editor/`; shared helpers in `src/shared/events/`; runtime handlers in `src/engine/interpreter/commands/` | interpreter, event, dialogue, and playtest tests |
| Combat and battle effects | pure rules in `src/shared/sim/`; client scenes/runtime in `src/engine/`; server authority in `server/src/core/` | combat tests in `tests-unit/` and multiplayer/battle e2e specs |
| Multiplayer protocol, sessions, rooms, worlds, chat, and moderation | shared contracts in `src/shared/net/` and `src/shared/sim/`; client code in `src/engine/net/`; hosts in `server/src/core/`, `node/`, and `cf/` | network tests, Beacon tests, `test:net`, and multiplayer e2e specs |
| Project folders, persistence, migrations, and asset stores | `src/shared/project/`, `src/shared/assets/`; `src/editor/project-manager/`, `src/editor/persistence.ts`; `src/platform/`; `src-tauri/` | project, folder, migration, asset-store, and desktop e2e tests |
| RPG Maker MV/MZ import | `src/editor/importers/`, especially `src/editor/importers/mz/` | `mz-*` and importer tests in `tests-unit/`; import e2e specs |
| Procedural assets, audio, legacy globals, plugins, and export compatibility | `src/shared/assets/`, `src/shared/audio/`, `src/editor/export/`, `js/`, `img/`, `js/build-manifest.mjs`, `js/standalone-template.mjs` | classic compatibility tests, export tests, and relevant e2e coverage |
| Build, staging, packaging, launchers, and generated demos | `vite.config.mjs`, `scripts/`, `tools/`, `src-tauri/` | `npm run build`, packaging/export tests, and targeted launcher checks |
| Documentation and docs site | canonical source in `wiki/`; contributor guidance in `docs/`; generation in `scripts/` | `npm run docs:build` and `npm run docs:check` |

## Architectural Boundaries

- Keep `src/shared/` free of DOM, browser-global, Tauri, Node, and Cloudflare-specific imports so
  its rules remain reusable in every host and test environment.
- Keep editor event-command definitions and engine interpreter registrations behaviorally aligned.
- Preserve the stable `Assets`, `RA`, plugin, and other compatibility globals exposed by `js/` unless
  a deliberate compatibility change is documented and tested.
- Use Three.js with WebGL2 for rendering. Do not introduce WebGPU APIs or WebGPU-based skills.
- Put pure behavior in shared modules when it must run in browser, Node, Cloudflare, and unit tests;
  put host-specific I/O behind `src/platform/`, `server/src/node/`, `server/src/cf/`, or `src-tauri/`.
- Add or update tests in the existing suite that owns the behavior; do not create a parallel test
  tree without a clear boundary.
- For documentation changes, update canonical Markdown under `wiki/` or the appropriate contributor
  document first, then regenerate derived documentation when required.
