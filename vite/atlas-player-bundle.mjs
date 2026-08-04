/* RPGAtlas — vite/atlas-player-bundle.mjs
   Vite plugin that produces the single-file player runtime that the standalone
   HTML/EXE export inlines in place of the old js/engine.js.

   Before Phase 1 the export fetched js/engine.js (a classic-script IIFE) and
   inlined it as a <script type="module">. Now the engine lives under
   src/engine/ as ES module source, so it can no longer be fetched as one file;
   this plugin bundles src/engine/main.ts into ONE IIFE with esbuild so the
   export keeps a single inlinable artifact:

   - dev:  a middleware serves /__atlas/player-bundle.js, bundling on demand so
           exports produced from `npm run dev` always reflect the latest source.
   - build: emits player-bundle.js into dist/ from the same esbuild invocation,
           so exports produced from a built/preview/Tauri app work identically.

   esbuild is used directly (it is already a transitive dependency of Vite, and
   is declared as an explicit devDependency in package.json). IIFE + no minify
   mirrors the previous inline-module shape as closely as possible; target is
   left at esbuild's default (esnext) so no syntax is lowered relative to the
   engine source that shipped un-transpiled before. GPL-3.0-or-later. */

import { build } from "esbuild";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = dirname(here);
const ENTRY = join(root, "src", "engine", "main.ts");

/* Public URL/filename the export references (mirrored in project-io.js). */
export const PLAYER_BUNDLE_DEV_URL = "/__atlas/player-bundle.js";
export const PLAYER_BUNDLE_FILE = "player-bundle.js";

/* Bundle src/engine/main.ts to a single IIFE string. Shared by dev + build. */
async function bundlePlayer() {
  const result = await build({
    entryPoints: [ENTRY],
    bundle: true,
    format: "iife",
    minify: false,
    sourcemap: false,
    write: false,
    platform: "browser",
    // No target override: keep the same (un-lowered) syntax the engine shipped
    // with as an inline module before Phase 1 — behavior-frozen.
    logLevel: "silent",
  });
  return result.outputFiles[0].text;
}

export function atlasPlayerBundle() {
  return {
    name: "atlas-player-bundle",

    // Dev: serve a freshly-bundled player at a stable URL so buildStandaloneGame
    // (which fetches this path in dev — see project-io.js) always inlines the
    // latest engine source.
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url || req.url.split("?")[0] !== PLAYER_BUNDLE_DEV_URL) {
          next();
          return;
        }
        try {
          const code = await bundlePlayer();
          res.setHeader("Content-Type", "text/javascript; charset=utf-8");
          res.setHeader("Cache-Control", "no-store");
          res.end(code);
        } catch (error) {
          server.config.logger.error(
            "[atlas-player-bundle] dev bundle failed: " + (error && error.message),
          );
          res.statusCode = 500;
          res.end("/* atlas-player-bundle failed */");
        }
      });
    },

    // Build: emit player-bundle.js into dist/ from the same esbuild invocation.
    // Runs in the passthrough plugin's writeBundle (which wipes/recreates dist),
    // so we emit in closeBundle instead — after dist has been populated.
    async closeBundle() {
      if (this.meta && this.meta.watchMode) return;
      const { mkdirSync, writeFileSync } = await import("node:fs");
      const outDir = join(root, "dist");
      mkdirSync(outDir, { recursive: true });
      writeFileSync(join(outDir, PLAYER_BUNDLE_FILE), await bundlePlayer());
    },
  };
}
