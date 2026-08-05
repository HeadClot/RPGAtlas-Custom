# RPGAtlas Contributor Documentation

This directory contains current engineering guidance plus historical design records. For the
creator-facing manual, start with [`../wiki/Home.md`](../wiki/Home.md). For a quick local setup,
use the commands below; for the system map, read [`architectural_overview.md`](architectural_overview.md).

## Local development

RPGAtlas uses Node.js 20 or newer for the main toolchain. From the repository root:

```sh
npm install
npm run dev
```

The Vite server serves `index.html` (editor) and `play.html` (player). The Windows launcher can
also start the dev server automatically from a source checkout.

## Verification commands

```sh
npm run typecheck
npm run lint
npm run test:unit
npm run test:net
npm run test:e2e
npm run build
npm run docs:build
npm run docs:check
```

Use `npm run test:unit -- tests-unit/tutorials.test.ts tests-unit/md-render.test.ts` for a fast
documentation-focused check. The Beacon server has its own target checks:

```sh
cd server
npm install
npm run typecheck
npm run build
```

## Source map

- `src/editor/` — editor boot/composition roots, `core/` shell infrastructure, map tools, database,
  event editor, importers, project manager, export, and feature-grouped authoring tools.
- `src/engine/` — player boot, scenes, interpreter, menus, saves, plugins, co-op sessions, and
  client-side network runtime.
- `src/shared/` — stable contract primitives plus feature groups for project persistence, maps,
  assets, audio, events, presentation, networking protocol, and deterministic simulation.
- `src/renderer/` — Three.js HD-2D renderer and render planning.
- `src/platform/` — browser storage plus Tauri project and asset adapters.
- `js/` — compatibility globals, procedural assets/audio/data, legacy project I/O, and standalone
  export assembly.
- `server/src/` — Beacon's shared-authority Node and Cloudflare server targets.
- `src-tauri/` — native desktop host, project-folder commands, and packaged playtest window.
- `scripts/` — staging, docs generation, fixtures, demos, and packaging.
- `tests-unit/` and `tests-e2e/` — pure-core/unit tests and browser coverage.

## Documentation workflow

The Markdown files under `wiki/` are canonical. After editing them:

```sh
npm run docs:build
npm run docs:check
```

`docs-site/` is committed because it is ready to serve from GitHub Pages, but its HTML and CSS
should be regenerated rather than edited by hand. The in-app `Help ▸ Detailed Tutorials` content
lives in `src/editor/core/tutorials-data.ts`; keep its terminology and command examples aligned with
the wiki and `server/README.md`.

## Historical specifications

The dated `phase-*`, `mp-*`, `mig-*`, and `harbor-*` documents record the design and implementation
history of completed work. They are not the current user manual. Current behavior belongs in the
wiki, this contributor guide, the architecture overview, or the specialized server/Tauri READMEs.

## Contribution conventions

- Preserve compatibility of the plugin bridge and project migration paths.
- Do not use WebGPU APIs; the renderer uses Three.js and WebGL2.
- Keep new shared rules pure where possible so they can run in browser, Node, and Cloudflare tests.
- Add or update tests for behavior changes.
- Append an independent `PATCH_NOTES.push({...})` entry to the end of `js/patch-notes.js` for
  substantial user-facing changes, including major documentation updates. Include an immutable
  ISO-8601 `timestamp` with the author’s local UTC offset; the editor sorts entries newest-first.
- Run the relevant verification gates before handing off a change.

RPGAtlas is licensed under GPL-3.0-or-later. See [`../LICENSE`](../LICENSE).
