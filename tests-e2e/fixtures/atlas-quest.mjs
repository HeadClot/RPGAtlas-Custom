/* RPGAtlas — tests-e2e/fixtures/atlas-quest.mjs
   Shared helpers for seeding the bundled sample project ("Atlas Quest") into
   the app's storage before a spec navigates to index.html/play.html.

   Both the editor and player load a project from localStorage under the
   "rpgatlas_project" key (see js/editor/project-io.js loadStoredProject and
   js/engine.js loadProject). Seeding that key before navigation is the
   supported, non-invasive way to get a real project into either page without
   touching engine/editor source. GPL-3.0-or-later. */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const projectPath = join(here, "..", "..", "Atlas_Quest.json");

let cached = null;
let seedScriptId = 0;
export function atlasQuestJson() {
  if (!cached) cached = readFileSync(projectPath, "utf8");
  return cached;
}

/** Freeze random-walk NPCs (moveType "random" → "fixed") at their authored
 * spot and facing. Still required by specs that assert byte-EXACT pixel
 * equality across two boots: even with the RNG seeded (rngSeed below), the
 * capture can land ±1 game tick between boots — loop.ts re-arms rAF only
 * after its async render() resolves, so tick alignment inside a
 * clock.runFor() window is real-time dependent — and a WALKING mover differs
 * by a few pixels between adjacent ticks. Everything else in the frame is a
 * function of virtual TIME (identical at capture), so pinning the movers is
 * exactly what restores byte equality. Committed-baseline goldens should NOT
 * pin: they compare within maxDiffPixelRatio tolerance, which absorbs the
 * tick jitter, and seeded walking movers keep the mover render path covered. */
export function pinMovers(project) {
  for (const m of project.maps) {
    for (const e of m.events || []) {
      for (const p of e.pages || []) if (p.moveType === "random") p.moveType = "fixed";
    }
  }
  return project;
}

/**
 * Seeds localStorage with the Atlas Quest sample project, then navigates to
 * `path`. An init script writes the seed before the app's first script runs,
 * so each helper call needs only one real application navigation. The unique
 * sessionStorage marker keeps the init script from reseeding a later reload
 * in the same test; this matters to tests that boot multiple project variants
 * on one page.
 *
 * `installClock: true` installs Playwright's fake clock before the navigation,
 * so it is in place before js/engine.js boot() ever calls
 * requestAnimationFrame(loop) — needed for deterministic golden-image
 * captures (see tests-e2e/renderer-golden.spec.mjs).
 *
 * `rngSeed` closes the one nondeterminism the fake clock does NOT freeze:
 * gameplay rolls (random-walk NPCs, encounter timing, battle rolls) come from
 * the engine's seedable random source (src/engine/util.ts). Passing a seed
 * sets window.RPGATLAS_RNG_SEED via an init script BEFORE any engine module
 * runs, so under the frozen clock every boot performs the identical roll
 * sequence — movers walk the exact same path every run. That keeps committed
 * screenshot baselines reproducible (within tolerance — see the pinMovers
 * note on capture-tick jitter) with movers actually moving, where the old
 * pin-everything approach removed the mover render path from coverage.
 * Players are unaffected: without a seed the engine stays on plain
 * Math.random().
 */
export async function gotoWithAtlasQuest(
  page,
  path,
  { installClock = false, transformProject = null, rngSeed = null } = {},
) {
  // `transformProject` mutates (or replaces) the parsed project before seeding
  // — used by the renderer goldens to switch on per-map HD-2D settings the
  // sample project leaves off (bloom/DoF/fog post stack).
  let json = atlasQuestJson();
  if (transformProject) {
    const project = JSON.parse(json);
    json = JSON.stringify(transformProject(project) ?? project);
  }
  const seedKey = `__rpgatlas_e2e_seed_${++seedScriptId}`;
  await page.addInitScript(
    ({ seeded, key }) => {
      // The Playwright page starts at about:blank. Its opaque origin has no
      // app storage; the guard also keeps this script harmless there.
      if (location.origin === "null" || sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
      localStorage.setItem("rpgatlas_project", seeded);
    },
    { seeded: json, key: seedKey },
  );
  if (installClock) {
    // Fixed epoch start so any incidental Date.now()/timestamp text in the
    // UI (e.g. save-slot listings) is also reproducible across runs.
    await page.clock.install({ time: new Date("2024-01-01T00:00:00Z") });
  }
  if (rngSeed != null) {
    // Init scripts run before any page module, so src/engine/util.ts sees the
    // hook at import time and the very first roll is already seeded.
    await page.addInitScript((seed) => {
      window.RPGATLAS_RNG_SEED = seed;
    }, rngSeed);
  }
  await page.goto(path);
}
