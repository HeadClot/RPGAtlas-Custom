/* RPGAtlas — js/build-manifest.mjs
   Single source of truth for the frontend files that the build/export/packaging
   pipelines depend on. Plain ESM, no dependencies, so it is importable from both
   browser ES modules (js/editor/project-io.js) and Node tooling
   (scripts/stage-frontend.mjs, scripts/package-exe.mjs, Vite config, Vitest).

   Keep this list authoritative: the standalone HTML export, the Tauri staging
   step, and the packaged exe all read from here, which removes the
   packaging-drift risk called out in the production roadmap. GPL-3.0-or-later. */

/* Filenames for the single-file player runtime bundle (Phase 1). The engine no
   longer ships as one fetchable classic script (js/engine.js moved into ES
   modules under src/engine/); the Vite plugin `atlas-player-bundle` produces a
   single inlinable IIFE instead. project-io.js resolves which URL to fetch:
   PLAYER_BUNDLE_DEV_URL under `npm run dev` (middleware, always fresh) vs
   PLAYER_BUNDLE_FILE from a built/preview/Tauri/EXE app (emitted into dist). */
export const PLAYER_BUNDLE_DEV_URL = "/__atlas/player-bundle.js";
export const PLAYER_BUNDLE_FILE = "player-bundle.js";

/* Ordered list of sources inlined into a single-file standalone game export.
   Order matters: the CSS (first entry) is embedded as a <style>, the classic
   runtime scripts run in sequence to populate globals, and the player bundle
   (last entry) runs as a module. This mirrors the classic <script> load order
   in play.html. The last entry is a placeholder — project-io.js swaps it for
   the environment-correct player bundle URL (dev vs dist) via
   resolvePlayerBundleUrl() before fetching.

   js/runtime/input.js, js/quests.js and js/journal-view.js are hard boot
   dependencies of the engine (createInputSystem, RPGAtlasQuests.create,
   RPGAtlasJournalView.create); their earlier omission made every exported
   game crash on boot (bug predating Phase 0, fixed 2026-07-01). */
export const STANDALONE_EXPORT_FILES = [
  "css/play.css",
  "js/assets.js",
  "js/sfx.js",
  "js/data.js",
  "js/runtime/messages.js",
  "js/runtime/input.js",
  "js/quests.js",
  "js/journal-view.js",
  PLAYER_BUNDLE_FILE,
];

/* Top-level paths (files and directories) that make up the complete frontend
   the editor and player need at runtime. Copied verbatim into the Tauri dist by
   scripts/stage-frontend.mjs; also the set Vite must pass through untouched so
   the classic js/ scripts, css/, and runtime-fetched assets under img/ and bin/
   remain available at their current relative URLs in dev and in the build. */
export const FRONTEND_INCLUDE = [
  "index.html",
  "play.html",
  "css",
  "js",
  "img",
  "bin",
];

/* The two HTML entry points Vite builds as multi-page bundles. */
export const HTML_ENTRIES = ["index.html", "play.html"];

/* Directories that Vite must serve/copy through byte-identical (no bundling or
   transforming). Derived from FRONTEND_INCLUDE minus the HTML entries. */
export const PASSTHROUGH_DIRS = FRONTEND_INCLUDE.filter(
  (name) => !HTML_ENTRIES.includes(name),
);
