"use strict";

// Phase 1 Stage B migrated this from extracting hdMapEnabled out of the
// engine.js source text to a behavior test against the extracted module
// (src/engine/scenes/map-runtime.ts): bundle the real module with esbuild —
// the same pattern as tests/interpreter.test.js — and drive its export. The
// deps seam reads window.RPGAtlasDeps at module evaluation and the module
// reads the ?hd2d dev override off location.search, so both are stubbed.

const assert = require("node:assert/strict");
const path = require("node:path");
const vm = require("node:vm");

(async () => {
  const { build } = require("esbuild");
  const root = path.resolve(__dirname, "..");
  const entry = `export { hdMapEnabled } from ${JSON.stringify(
    path.join(root, "src/engine/scenes/map-runtime.ts").replace(/\\/g, "/"),
  )};`;
  const out = (await build({
    stdin: { contents: entry, resolveDir: root, loader: "ts" },
    bundle: true, format: "cjs", write: false, platform: "node", logLevel: "silent",
  })).outputFiles[0].text;
  const mod = { exports: {} };
  vm.runInNewContext(out, {
    module: mod, exports: mod.exports, require, console,
    window: { RPGAtlasDeps: { Assets: { TILE: 48 }, RA: {} } },
    location: { search: "" },
    URLSearchParams,
  });
  const { hdMapEnabled } = mod.exports;

  assert.equal(hdMapEnabled(null), false);
  assert.equal(hdMapEnabled({}), false);
  assert.equal(
    hdMapEnabled({
      hd2d: { enabled: false, tilt: 25, bloom: true, dof: true, fog: { color: "#101018" }, lights: true, ambient: 0.45 },
      lights: [{ rx: 1, ry: 1, color: "#ffff00", radius: 64 }],
    }),
    false,
    "explicitly disabled HD-2D stays flat even when other HD-2D options are present",
  );
  assert.equal(
    hdMapEnabled({ hd2d: { enabled: true, tilt: 50, ambient: 0.45 } }),
    true,
    "explicitly enabled HD-2D renders through the perspective path",
  );
  assert.equal(
    hdMapEnabled({ hd2d: { tilt: 50, ambient: 0.45 } }),
    true,
    "legacy HD-2D settings without an explicit toggle still opt in",
  );
  assert.equal(
    hdMapEnabled({ lights: [{ rx: 1, ry: 1, color: "#ffff00", radius: 64 }] }),
    true,
    "legacy map lights without an explicit toggle still opt in",
  );

  console.log("HD-2D toggle tests passed.");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
