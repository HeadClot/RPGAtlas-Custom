# RPGAtlas — Desktop wrapper (Tauri)

This folder packages the existing static RPGAtlas editor as a native desktop
app using [Tauri 2](https://tauri.app). The web/local-server build (run
`RPGAtlas.exe`) is unaffected — the desktop wrapper is an additional target,
not a replacement. Both targets use the same editor and player frontend.

## How it works

- The editor/player are the same files served by the local web server. A small
  staging step (`scripts/stage-frontend.mjs`) copies `index.html`, `play.html`,
  `css/`, `js/`, `img/`, and `bin/` into `src-tauri/dist/`, which Tauri embeds.
- That step also writes `img/assets.json`, the manifest `js/assets.js` already
  prefers over HTTP directory-listing discovery — so custom art works inside the
  app, which has no directory listings.
- `src-tauri/src/lib.rs` exposes native file/project, asset-library, project-folder,
  and playtest commands. The frontend reaches them through the host/platform adapters;
  on the plain web build `host.isTauri` is false and callers use browser repositories instead.
- Desktop project autosave writes `game.rpgatlas` in the project folder atomically and keeps
  bounded backups under `.atlas/backup/`. The shared app-data asset library remains separate from
  project-scoped assets, while `project_assets.rs` scans the visible `assets/` folders in place.

## Prerequisites

- **Node.js 20+** (for the staging script and the Tauri CLI) — already used here.
- **Rust toolchain** — install via <https://rustup.rs>. Tauri compiles a small
  native shell in Rust.
- **Platform WebView + build tools:**
  - Windows: WebView2 runtime (preinstalled on Win 10/11) + MSVC Build Tools.
  - macOS: Xcode Command Line Tools.
  - Linux: `webkit2gtk` and related dev packages (see Tauri prerequisites).

## Develop / build

Run from the repository root:

```sh
npm install          # one-time: fetches @tauri-apps/cli
npm run dev          # live desktop app (stages frontend, then tauri dev)
npm run build        # produces an installer in src-tauri/target/release/bundle
npm run package:exe  # rebuilds the standalone RPGAtlas-Desktop.exe at the repo root
```

To refresh the desktop app after adding features, run `npm run package:exe`
(vite build → `cargo build --release` → copy the exe to the project root). On
Windows you can instead double-click **`Rebuild-Desktop-App.bat`** in the repo
root — a beginner-friendly wrapper that checks the build tools are installed,
keeps npm dependencies current, runs the same `package:exe` build, and reports
whether `RPGAtlas-Desktop.exe` was rebuilt.

## Icons

A Windows icon (`icons/icon.ico`) is included from `img/system/rpgatlas.ico`.
For full cross-platform installers, regenerate the icon set from a square
source image (the logo SVG rendered to a 1024×1024 PNG works well):

```sh
npm run tauri icon path/to/logo-1024.png
```

then add the generated files to the `bundle.icon` array in `tauri.conf.json`.

The shell deliberately contains no separate gameplay implementation. `src-tauri/src/project.rs`
owns folder creation/open/save, atomic writes, recent projects, and reveal-in-file-manager;
`src-tauri/src/project_assets.rs` owns project asset discovery; `src-tauri/src/lib.rs` registers the
commands and window lifecycle. See [`docs/architectural_overview.md`](../docs/architectural_overview.md)
for the frontend-to-shell boundary.
