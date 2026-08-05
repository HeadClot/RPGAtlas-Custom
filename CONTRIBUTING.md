# Contributing to RPGAtlas

RPGAtlas is a browser-first RPG editor and player with optional native desktop and multiplayer
targets. This guide is for contributors working from a source checkout. Creator-facing guidance is
in the [project wiki](wiki/Home.md); the current architecture and historical implementation record
are indexed in [`docs/README.md`](docs/README.md).

## Prerequisites

- Node.js 20 or newer for local development. CI currently runs Node 24.
- A modern browser for Vite and Playwright work.
- Rust and the platform WebView toolchain only when building the Tauri desktop app.
- Windows .NET Framework C# tooling only when rebuilding the browser launcher.

## Local workflow

```text
npm install
npm run dev          # editor + player with Vite
npm test             # legacy Node test suites
npm run test:unit    # Vitest unit suites
npm run test:net     # socket/worker Vitest project
npm run test:e2e     # Playwright smoke and renderer tests
npm run typecheck
npm run lint
npm run build
```

The two browser entrypoints are `index.html` (editor) and `play.html` (player). `npm run build`
bundles their TypeScript module entries and copies the classic runtime, CSS, images, and HTML through
the build manifest. Do not open either HTML file directly from `file://`; use Vite or a static server.

## Documentation workflow

The editable creator documentation lives in `wiki/`. The committed `docs-site/` directory is a
generated static copy:

```text
npm run docs:build   # write docs-site/ from wiki/
npm run docs:check   # render in a temporary directory, compare freshness, check links and anchors
```

Update wiki Markdown first, then run `npm run docs:build`. `docs/` contains current architecture
and navigation plus historical roadmap/spec material; do not silently rewrite historical decisions
to describe today's implementation.

## Code boundaries

- `src/engine/` owns player runtime, scenes, interpreter, state, input, and multiplayer clients.
- `src/editor/` owns authoring UI, project management, importers, and editor tools.
- `src/shared/` owns schema, pure simulation, protocol, assets, and cross-target services.
- `src/renderer/` owns the Three.js HD-2D backend behind the renderer adapter.
- `src/platform/` owns browser and Tauri storage/host adapters.
- `js/` contains compatibility globals, procedural data/audio/assets, persistence/export helpers, and
  the frozen patch-notes surface.
- `server/` contains the Beacon multiplayer core and Node/Cloudflare deployment adapters.
- `src-tauri/` contains the native shell and filesystem/project commands; it does not duplicate the
  engine.

Keep public contracts additive where possible. Project files are migrated at load boundaries, and
the Beacon wire protocol is versioned separately from the project schema. See
[`docs/architectural_overview.md`](docs/architectural_overview.md) for the data flow.

## Pull-request expectations

Run the relevant focused tests while working and the full requested gates before handoff:

```text
npm run docs:check
npm run typecheck
npm run lint
npm run build
npm test
npm run test:unit
npm run test:net
npm run test:e2e
```

User-facing feature additions and substantial project changes also need a newest-first entry in
`js/patch-notes.js`. Keep behavior changes separate from documentation-only edits, and avoid
regenerating unrelated build artifacts.

RPGAtlas is licensed under GPL-3.0-or-later. See [`LICENSE`](LICENSE).
