# RPGAtlas Architecture Overview

This document describes the current RPGAtlas implementation. It is a practical map for
contributors, not a historical phase specification. The public creator workflow is documented in
[`../wiki/Home.md`](../wiki/Home.md); setup and verification commands are in
[`README.md`](README.md).

## System context

RPGAtlas is one game-authoring product with several hosts:

| Host | Entry point | Purpose |
|---|---|---|
| Browser/Vite | `index.html` | Editor and project authoring |
| Browser/Vite | `play.html` | Playtest and exported-game runtime |
| Tauri desktop | `src-tauri/` | Project Manager, folder projects, native dialogs, and dedicated playtest |
| Windows launcher | `tools/` and `bin/` | Serves the browser app locally or wraps a standalone export |
| Beacon Node | `server/src/node/` | Server-authoritative friend rooms and persistent worlds |
| Beacon Cloudflare | `server/src/cf/` | Durable Object room/world deployment |

The project document is the central domain object. It contains the system settings, database,
maps, events, plugins, custom assets, advanced layers, quests, action-combat profiles, and
multiplayer configuration. Browser projects use storage adapters; desktop projects persist to
`game.rpgatlas` inside a project folder.

## Building blocks

### Editor

`src/editor/` is organized by authoring concern:

- `boot.ts` and `main.ts` compose the editor and load the selected project.
- `workspace.ts`, `menu-registry.ts`, `keymap.ts`, and `command-palette.ts` expose editor actions.
- `map-editor/` handles classic painting, HD-2D preview, World View, Map Connections, history,
  clipboard, and map rendering.
- `advanced/` handles unlimited layers, terrain/autotile studio, stamps, zones, and Automap.
- `database/` handles system, actors, classes, skills, items, enemies, combat profiles, HUD,
  multiplayer, quests, tilesets, and other project data.
- `event-editor/` defines event commands, conditions, pages, move routes, Atlas Graph, and quick
  event templates.
- `tools/` contains asset/audio/resource managers, dialogue, generators, plugins, search, and the
  character generator.
- `importers/` converts RPG Maker MV/MZ projects and produces an import report.
- `project-manager/` owns desktop New/Open/recent-project flows and folder migration.
- `persistence.ts` binds browser recovery and desktop atomic folder saves to the active project.

### Engine

`src/engine/` is the player runtime:

- `boot.ts`, `main.ts`, and `loop.ts` initialize the project, input, audio, renderer, and fixed
  update loop.
- `scenes/` implements title, map, menus, shops, front/side-view battles, game over, and
  presentation effects.
- `interpreter/` registers and executes event commands. Its command definitions are shared with
  the editor's event-command UI.
- `state/` owns live game state, defaults, saves, options, and window presentation settings.
- `plugin-runtime.ts` and `script-api.ts` expose the compatibility bridge documented in the
  [Plugin & Script API](../wiki/Plugin-and-Script-API.md).
- `net/` and `co-op.ts` implement solo/room/world sessions, relay transport, social UI, passport
  handling, moderation, and server-authoritative snapshots.
- `playtest-bridge.ts` connects the editor and player during F5 playtests.

### Shared core

`src/shared/` is intentionally dependency-light so the same rules can run in the browser, unit
tests, Beacon Node, and Cloudflare:

- `schema.ts` defines the project and runtime data shapes and migration-compatible defaults.
- `sim/` contains deterministic world, player, party, collision, timers, and action-combat rules.
- `net/` contains protocol, transport, room-code, relay, passport, and chat primitives.
- `autotile*`, `layer-*`, `stamp-ops`, `terrain-kinds`, and `zone-*` support advanced maps.
- `asset-*`, `audio-*`, `anim-player`, and `battle-fx` are shared presentation/data services.
- `services.ts` defines host-neutral seams for assets, saves, projects, rendering, and plugins.

### Renderer and platform adapters

`src/renderer/` contains the Three.js/WebGL2 HD-2D renderer and render plan. The classic canvas
renderer and the HD-2D renderer consume the same project/map data. `src/platform/browser/` provides
browser storage and IndexedDB asset access; `src/platform/tauri/` provides native project and
asset access through typed Tauri commands.

The compatibility layer under `js/` still supplies procedural assets, audio, data defaults,
legacy globals, and export support. `Assets`, `RA`, and the plugin bridge remain stable globals for
existing project plugins.

### Beacon server

Beacon shares simulation and protocol code with the client:

- `server/src/core/` owns connections, room/world orchestration, moderation, persistence contracts,
  interest management, and authoritative action combat.
- `server/src/node/` provides the plain-Node WebSocket server, worker-per-room/world adapters,
  file persistence, and operator console.
- `server/src/cf/` provides Durable Object room/world targets and KV project loading.

Friend rooms use full engine workers by default on Node. `--no-engine-rooms` opts into the lighter
walk/emote/chat room mode. Persistent worlds require `--world`; authored server-side NPCs, events,
and cutscenes require `--engine-events`, with `--zone-workers` for multi-map sharding.

## Main data flows

### Editor boot

1. `index.html` loads the editor module and compatibility dependencies.
2. `src/editor/boot.ts` chooses browser storage or the desktop Project Manager host.
3. The selected project is migrated and validated through shared schema helpers.
4. Persistence binds the active project, the editor state is composed, and the workspace becomes
   interactive.
5. Desktop folder projects use `game.rpgatlas`; `.atlas/` holds indexes, caches, and backups.

### Playtest

1. The editor saves the current project through its active repository.
2. Browser playtests open `play.html`; Tauri playtests use the dedicated native window.
3. `src/engine/boot.ts` loads the project, applies system settings, prepares assets, installs the
   interpreter and plugin bridge, and enters the title or map scene.
4. The fixed loop drives input, event interpretation, simulation, interpolation, UI, and render.

### Multiplayer

1. The title screen creates or joins a room using a room code, or connects to a configured world.
2. The client sends validated input intents through the relay transport.
3. Beacon owns authoritative movement, collision, presence, event execution where enabled, and
   action-combat outcomes.
4. Snapshots/deltas reconcile remote players, HP, combat phases, VFX/SFX events, defeat, revive,
   and map-transfer state.

### Standalone export

1. The editor serializes the project and collects the runtime manifest.
2. Only referenced custom assets are embedded.
3. `js/standalone-template.mjs` assembles the self-contained HTML payload.
4. Web/HTML exports contain the playable page; Windows EXE export appends that payload to the
   launcher; native game EXE packaging uses the Tauri shell.

## Extension surfaces

- Plugins run in project order at boot and receive `atlas`, `game`, and the legacy `dw` alias.
- Plugin hooks cover map load, update, render, message transformation, transitions, custom event
  commands, battles, zones, and multiplayer presence/messages.
- The Script event command uses the same `atlas` and `game` APIs inside an event.
- Event command definitions in `src/editor/event-editor/command-defs.ts` and runtime registrations
  under `src/engine/interpreter/commands/` must remain behaviorally aligned.
- The project schema and migration code are compatibility boundaries: new optional fields should
  preserve old projects and exports.

## Quality and compatibility constraints

- The browser, standalone, Tauri, Node, and Cloudflare targets must consume compatible project
  data and shared simulation rules.
- Do not use WebGPU APIs; the renderer is Three.js/WebGL2.
- Keep pure shared modules free of DOM and host-specific imports.
- Test new shared behavior under the appropriate Node/Vitest and network configurations.
- Preserve plugin globals and migration behavior unless a documented compatibility change is made.
- Run docs generation/checks whenever wiki navigation or links change.

## Related documents

- [`README.md`](README.md) — current repository setup and build commands.
- [`server/README.md`](../server/README.md) — Beacon deployment and CLI reference.
- [`src-tauri/README.md`](../src-tauri/README.md) — desktop packaging and staging.
- [`../wiki/Plugin-and-Script-API.md`](../wiki/Plugin-and-Script-API.md) — creator extension API.
- `PRODUCTION_ROADMAP.md`, `MULTIPLAYER_ROADMAP.md`, `MZ_MV_MIGRATION_ROADMAP.md`, and the dated
  phase specifications — historical design and implementation records.
