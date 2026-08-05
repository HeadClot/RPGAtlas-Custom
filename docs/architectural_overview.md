# RPGAtlas architecture overview

This document describes the current branch. Historical phase decisions and acceptance gates remain
in the roadmap/spec files indexed by [`docs/README.md`](README.md).

## Product surfaces

RPGAtlas has four related surfaces that share the same project model and runtime assets:

| Surface | Entry | Responsibility |
|---|---|---|
| Browser editor | `index.html` → `src/editor/main.ts` | Map, event, database, asset, import, and project authoring |
| Browser player | `play.html` → `src/engine/main.ts` | Playtest and exported-game runtime |
| Desktop app | `src-tauri/` | Native window, project manager, folder persistence, and playtest host |
| Beacon server | `server/` | Server-authoritative multiplayer rooms and persistent worlds |

The editor and player are still ordinary web assets. The desktop app embeds a staged copy of the
same frontend, while Beacon shares pure simulation and protocol code with the client. No surface
maintains a second project schema.

## Frontend module graph

```text
index.html                         play.html
    │                                  │
src/editor/main.ts              src/engine/main.ts
    │                                  │
src/editor/boot.ts              src/engine/boot.ts
    │                                  │
    └────────────── src/shared/ ───────┘
                     │
       schema · services · assets · sim · net
                     │
           js/ compatibility globals
```

### TypeScript modules

- `src/editor/` owns editor state, workspace/docks, map and advanced-map tools, database tabs,
  event/graph authoring, project manager, importers, and editor utilities.
- `src/engine/` owns the game loop, scene stack, interpreter, messages, menus, battle runtime,
  saves/options, plugin runtime, playtest bridge, and multiplayer client sessions.
- `src/shared/` contains the project schema and runtime guards, pure simulation, event/map helpers,
  asset stores, storage/service interfaces, project migration helpers, and the Beacon wire protocol.
- `src/renderer/` exposes the process-wide `Renderer` adapter and the Three.js implementation.
- `src/platform/browser/` and `src/platform/tauri/` implement the storage and host seams without
  leaking platform details into editor or engine code.

### Classic compatibility layer

The `js/` directory is intentional. Procedural asset/data/audio generators, plugin-facing globals,
message/input helpers, project I/O, and export templates remain classic scripts for compatibility.
The HTML pages load these scripts before the TypeScript entries; shared module code reads the stable
surface through `window.RPGAtlasDeps` and the dependency seam in `src/shared/deps.ts`.

Vite bundles only the TypeScript entry modules. The passthrough build in `vite.config.mjs` keeps
runtime-fetched paths such as `css/`, `img/`, classic `js/`, and the two HTML pages stable. This is
why an export can remain self-contained without changing every asset URL to a content hash.

## Project data and persistence

The project document is the shared boundary between authoring and play:

```text
editor state ──migrate/validate──> Project JSON ──load──> engine state
      │                                  │
      ├── browser repository              ├── game.rpgatlas in desktop folders
      └── standalone export               └── embedded assets in exported games
```

- `src/shared/schema.ts` defines the typed project document and runtime validation guards.
- Load/import boundaries migrate older documents and backfill additive fields; the engine and editor
  consume the current shape after that boundary.
- Browser projects and save slots use browser storage. Desktop projects write `game.rpgatlas`
  atomically in the project folder and maintain bounded backups under `.atlas/backup/`.
- Assets are referenced by stable keys. Browser and Tauri stores provide different implementations
  behind shared `AssetStore` and `ProjectRepository` contracts.
- Export templates embed the project and only the assets it references; they do not turn the editor
  into a runtime dependency for players.

## Rendering

`src/renderer/index.ts` is the renderer selection seam. The current backend is Three.js, exposed as
the process-wide `Renderer` instance. `src/engine/render-glue.ts` and editor HD-2D preview code use
that adapter rather than importing Three.js directly.

The renderer preserves the established canvas/shader and draw-order contract while adding HD-2D
terrain extrusion, lighting, water, materials, camera effects, and post-processing. Large maps are
chunked and advanced layers are composited selectively. Renderer golden tests in Playwright protect
the pixel-sensitive path; `rendererBackend` remains a diagnostic value, not a runtime feature flag.

## Events, plugins, and scripts

The editor stores event pages and command data in the project document. The interpreter registry in
`src/engine/interpreter/` dispatches those commands in the player. Graph pages compile or map to the
same command model rather than introducing a second runtime.

Project plugins run through `src/engine/plugin-runtime.ts` and receive the frozen `atlas` bridge plus
the `game` script API from `src/engine/script-api.ts`. The public surface is documented in
[Plugin & Script API](../wiki/Plugin-and-Script-API.md); additions should remain additive and error-
isolated so old plugins continue to load.

## Multiplayer and Beacon

```text
client input intent ──WebSocket──> Beacon room/world
        ▲                              │
        └──── snapshots, deltas, directives ────┘
```

- `src/shared/net/protocol.ts` is the versioned JSON wire contract and owns structural decoders and
  message limits.
- `src/engine/net/` owns client sessions, room/world hosts, relay transport, moderation UI, and
  presentation directives.
- `server/src/core/` owns room/world lifecycle, connections, interest management, motion, event
  runtime, battle authority, persistence seams, and limits.
- `server/src/node/` adapts the core to `ws`, worker threads, filesystem persistence, and CLI startup.
- `server/src/cf/` adapts the same core concepts to Cloudflare Workers and Durable Objects.

Clients send intents; the server owns authoritative world state and broadcasts snapshots/deltas. The
wire carries server-assigned identity and gameplay state, not peer-to-peer connections or player IPs.
Cloudflare and Node deployment capabilities can differ; current hosting limitations are documented in
[Hosting a World](../wiki/Hosting-a-World.md) and `server/README.md`.

## Desktop and packaging

```text
npm run build
    ├── dist/                    browser build + passthrough runtime
    ├── scripts/stage-frontend   staged frontend for Tauri
    └── scripts/package-exe      launcher/native packaging workflows
```

The Tauri shell exposes native project/file commands and a dedicated playtest window. It does not
reimplement editor or player behavior. `src-tauri/src/project.rs` owns project-folder creation,
atomic saves, backups, recent projects, and open/reveal operations; `project_assets.rs` owns project-
scoped asset discovery. Browser callers fall back to browser repositories when `host.isTauri` is false.

The browser launcher (`RPGAtlas.exe`) serves the frontend locally. `RPGAtlas-Desktop.exe` is the
native Tauri shell. Exported game EXEs and HTML files use the standalone runtime and do not require
the editor, launcher, or Beacon server unless the author enabled multiplayer.

## Change and verification rules

When changing a public contract, update its source-level documentation and the matching creator or
contributor reference. Run the focused tests for the subsystem, then the documentation check and
the normal typecheck/lint/build gates. Substantial user-facing changes require a newest-first entry
in `js/patch-notes.js`.
