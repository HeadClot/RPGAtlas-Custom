/* RPGAtlas — vite.config.mjs
   Multi-page Vite setup. Phase 1 Stage A introduces the module build: the two
   HTML pages load their runtime through Vite module entries
   (/src/editor/main.ts and /src/engine/main.ts), served natively with HMR in
   dev and bundled by `vite build`. Everything else under js/ stays a
   byte-identical classic script.

   HTML-pipeline approach (chosen for smallest behavioral surface):
   The obvious route — feeding the HTML pages to Rollup as inputs — was tried
   and rejected: Vite's HTML crawl also rewrites the <link rel="stylesheet"> and
   favicon into hashed assets/ URLs. That breaks project-io.js and assets.js,
   which fetch "css/play.css", "img/system/icon_set.png", etc. by LITERAL path
   at runtime; the export would then point at a hash that changes every build.

   So we bundle ONLY the two module entries (rollupOptions.input = the .ts
   files, not the HTML). The passthrough plugin then:
     1. copies css/, img/, bin/, and the remaining classic js/ files verbatim
        (byte-identical URLs preserved), and
     2. copies index.html / play.html verbatim EXCEPT for the single final
        <script type="module" src="/src/…/main.ts"> tag, which it rewrites to
        the built, content-hashed entry chunk (relative ./assets/… URL).
   Net result: the ONLY behavioral change in dist is that one script tag; CSS,
   favicon, classic js/, and every runtime-fetched asset stay exactly as today.

   GPL-3.0-or-later. */

import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { HTML_ENTRIES, PASSTHROUGH_DIRS } from "./js/build-manifest.mjs";
import { atlasPlayerBundle } from "./vite/atlas-player-bundle.mjs";

const root = dirname(fileURLToPath(import.meta.url));

// Named Rollup inputs -> the source module entries the two HTML pages load.
const ENTRY_SOURCES = {
  editor: "src/editor/main.ts",
  engine: "src/engine/main.ts",
};
// Which built entry each HTML page swaps its dev-time module <script> for.
const HTML_ENTRY_MAP = {
  "index.html": { name: "editor", devSrc: "/src/editor/main.ts" },
  "play.html": { name: "engine", devSrc: "/src/engine/main.ts" },
};

/* Emit the frontend into dist/: bundled module entries (from Rollup) plus the
   verbatim passthrough of css/, img/, bin/, classic js/, and the two HTML pages
   (with only their final module <script> tag rewritten to the built chunk). */
function passthroughFrontend() {
  const outDir = join(root, "dist");
  return {
    name: "rpgatlas-passthrough-frontend",
    apply: "build",
    // After Rollup writes its chunks we know the hashed entry filenames; wipe
    // Rollup's throwaway top-level output layout, then lay the real frontend
    // down alongside the assets/ chunks it produced.
    writeBundle(_options, bundle) {
      // Map each named entry -> its emitted (hashed) fileName.
      const entryFile = {};
      for (const chunk of Object.values(bundle)) {
        if (chunk.type === "chunk" && chunk.isEntry && chunk.name) {
          entryFile[chunk.name] = chunk.fileName;
        }
      }

      for (const name of PASSTHROUGH_DIRS) {
        const src = join(root, name);
        const dest = join(outDir, name);
        mkdirSync(dirname(dest), { recursive: true });
        cpSync(src, dest, { recursive: true });
      }

      for (const htmlName of HTML_ENTRIES) {
        const { name: entryName, devSrc } = HTML_ENTRY_MAP[htmlName];
        const builtFile = entryFile[entryName];
        if (!builtFile) throw new Error(`no built chunk for entry "${entryName}"`);
        let html = readFileSync(join(root, htmlName), "utf8");
        // Rewrite the single dev module entry to the built, hashed chunk.
        // base:"./" -> relative URL so file:// (Tauri/EXE) and http both work.
        html = html.replace(
          `<script type="module" src="${devSrc}"></script>`,
          `<script type="module" src="./${builtFile}"></script>`,
        );
        writeFileSync(join(outDir, htmlName), html);
      }
    },
  };
}

export default {
  root,
  base: "./",
  // The passthrough plugin owns all static files; no public/ dir.
  publicDir: false,
  appType: "mpa",
  plugins: [atlasPlayerBundle(), passthroughFrontend()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    // Keep the engine/editor entries un-lowered (they shipped un-transpiled as
    // inline modules before Phase 1) — behavior-frozen.
    target: "esnext",
    rollupOptions: {
      // Bundle ONLY the two module entries (NOT the HTML) so Vite never
      // rewrites the CSS <link>/favicon (see header). The HTML is passthrough.
      input: Object.fromEntries(
        Object.entries(ENTRY_SOURCES).map(([name, rel]) => [name, join(root, rel)]),
      ),
    },
  },
};
