# RPGAtlas — Desktop wrapper (Tauri)

This folder packages the existing static RPGAtlas editor as a native desktop
app using [Tauri 2](https://tauri.app). The web/local-server build (run
`RPGAtlas.exe`) is unaffected — the desktop wrapper is an additional target,
not a replacement.

## How it works

- The editor/player are the same files served by the local web server. A small
  staging step (`scripts/stage-frontend.mjs`) copies `index.html`, `play.html`,
  `css/`, `js/`, `img/`, and `bin/` into `src-tauri/dist/`, which Tauri embeds.
- That step also writes `img/assets.json`, the manifest `js/assets.js` already
  prefers over HTTP directory-listing discovery — so custom art works inside the
  app, which has no directory listings.
- `src-tauri/src/lib.rs` exposes the native project-folder and playtest commands.
  The frontend reaches them through the typed host adapter in
  `src/platform/tauri/project-host.ts`; on the plain web build the browser
  repository is selected instead.
- Desktop projects autosave atomically to `game.rpgatlas` in the active project
  folder. The `.atlas/` directory holds the asset index, generated caches, and
  rolling backups; `saves/` holds playtest slots. Browser mode still uses
  browser storage.

## Prerequisites

- **Bun 1.3.14** (for dependency installation and the frontend toolchain).
- **Node.js 24 or newer** (for the compatibility-sensitive staging hook and Tauri CLI).
- **Rust toolchain** — install via <https://rustup.rs>. Tauri compiles a small
  native shell in Rust.
- **Platform WebView + build tools:**
  - Windows: WebView2 runtime (preinstalled on Win 10/11) + MSVC Build Tools.
  - macOS: Xcode Command Line Tools.
  - Linux: `webkit2gtk` and related dev packages (see Tauri prerequisites).

## Develop / build

Run from the repository root:

```sh
bun install          # one-time: fetches @tauri-apps/cli
bun run dev          # live desktop app (stages frontend, then tauri dev)
bun run build        # produces an installer in src-tauri/target/release/bundle
bun run package:exe  # rebuilds the standalone RPGAtlas-Desktop.exe at the repo root
```

`bun run stage` only stages the frontend. Use it when inspecting the embedded
files without building the native shell. The staging step copies the
editor/player assets and generates the asset manifest needed because a desktop
webview has no HTTP directory listings.

To refresh the desktop app after adding features, run `bun run package:exe`
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
