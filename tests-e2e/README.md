# tests-e2e/ — Playwright end-to-end + golden-image harness

Phase 0 safety net for the editor (`index.html`) and player (`play.html`).
These tests exercise the **built** app (`npm run build` output served via
`vite preview`), not the dev server — see `playwright.config.mjs`
`webServer.command`. That's deliberate: we want to catch regressions in what
actually ships to `dist/`, not just what the dev server happens to serve.

## Running

```
npm run test:e2e          # headless, builds first (webServer does this for you)
npx playwright show-report  # after a run, opens the HTML report
```

The dev server is NOT used here (no `npm run dev`). `playwright.config.mjs`'s
`webServer` block runs `npm run build && npm run preview -- --port 4173
--strictPort` and waits for `http://localhost:4173` to answer before tests
start. `reuseExistingServer` is on locally (so repeat local runs skip the
rebuild if a preview server is already up on that port) and off in CI (`CI`
env var set), so CI always tests a fresh build.

Note: `vite preview` binds the IPv6 loopback (`::1`) by default in this
toolchain, not `127.0.0.1` — the config's `baseURL`/`webServer.url` use
`localhost` rather than a hardcoded `127.0.0.1` for that reason.

## Spec files

- **`editor.spec.mjs`** — editor smoke tests.
  - *boots*: `index.html` loads, `#menubar`/`#mapcanvas`/`#palette` are
    visible, at least one menu renders, and no unexpected console errors
    fire (benign `img/*` 404 probes are filtered — see inline comment;
    `js/assets.js` `discoverExternalAssets()` optimistically probes for an
    asset manifest and directory listings that don't exist for the
    tileset-only sample project, and already handles that itself).
  - *paints*: selects a palette tile, clicks the map canvas, and asserts the
    map actually changed. There are no debug globals exposed by
    `js/editor.js` (it's a single closed IIFE), so the assertion reads the
    project JSON the editor itself persists to
    `localStorage["rpgatlas_project"]` (`saveProject`/`loadStoredProject` in
    `js/editor/project-io.js`) before and after painting, and diffs the
    map's `layers`. This is the same data the app treats as ground truth,
    not a reimplementation of it.

- **`player.spec.mjs`** — player smoke tests, using the bundled sample
  project ("Atlas Quest", `Atlas_Quest.json` at the repo root) seeded into
  `localStorage["rpgatlas_project"]` before navigation (see
  `fixtures/atlas-quest.mjs` — both the editor and `js/engine.js`
  `loadProject()` read a project from that key).
  - *boots*: `play.html` reaches the title screen (`.titlewin` showing
    "Atlas Quest", `.titlemenu` with "New Game"), no unexpected console
    errors.
  - *starts*: clicking "New Game" reaches the map. `js/engine.js` also
    exposes no debug globals, so this is asserted by screenshotting `#stage`
    and checking it isn't a blank/uniform frame (PNG size heuristic — see
    the comment by `isNonBlankPng`). This deliberately doesn't read
    `#gamecanvas` pixels directly: the sample's start map has HD-2D enabled,
    which renders through a separate WebGL `#glcanvas` that the three.js
    renderer (`src/renderer/three-renderer.ts`)
    inserts *behind* `#gamecanvas` (which the engine leaves transparent over
    the map in that mode) — screenshotting the composited stage covers both
    render paths uniformly.
  - *save/load round-trip*: opens the pause menu (default "cancel" binding:
    Escape/X), saves to slot 1, confirms the `localStorage` save key exists,
    dismisses the "Game saved" confirmation window, returns to the title
    screen, and loads slot 1 back — asserting we land back on the map.

  Note on timing: right after "New Game", there's a brief window (fade
  transitions + map load, per `js/engine.js` `newGame()`) where the map
  loop's input handling isn't reading key presses yet. Rather than a fixed
  sleep, the spec retries the Escape press inside `expect(...).toPass()`
  until the pause menu actually appears — bounded and deterministic, but
  tolerant of a slower CI runner.

- **`renderer-golden.spec.mjs`** — golden-image tests for the map renderer.
  See "Golden images" below.

- **`fixtures/atlas-quest.mjs`** — shared helper (`gotoWithAtlasQuest`) that
  seeds `Atlas_Quest.json` into `localStorage` before navigating, optionally
  also installing Playwright's fake clock first (`installClock: true`) so it
  intercepts `requestAnimationFrame`/`setTimeout` from the very first frame
  of `boot()`.

## Golden images — what they protect and how they work

`renderer-golden.spec.mjs` captures the sample project's start map
("Meridian Village") through both render paths the engine supports:

- `hd2d-meridian-village.png` — the WebGL2 HD-2D path (`?hd2d=1` override;
  Meridian Village also has `hd2d.enabled: true` in the project data, so
  this is also what a plain boot renders).
- `classic2d-meridian-village.png` — the Canvas 2D path (`?hd2d=0` forces it
  off on the same map, via the dev override in `js/engine.js` `hdWanted()`).
- `hd2d-post-meridian-village.png` — the HD-2D path with the classic post
  stack (bloom + DoF + fog) switched on via the fixture's `transformProject`
  hook (the sample project keeps them off). **Captured from the classic
  raw-WebGL2 renderer before its retirement**, so the three.js path is held
  to the classic output, not to itself.
- The Phase 2 feature goldens (`hd2d-shadows-…`, `hd2d-pointshadows-…`,
  `hd2d-water-…`, `hd2d-materials-…`, `hd2d-post2-…`, `hd2d-dusk-…`,
  `hd2d-rain-…`) were captured from the three.js renderer itself — no
  classic reference exists for the new capabilities; they guard against
  regressions from their capture point onward.

**These began as the Phase 2 renderer port's pixel-accuracy contract.**
The port reached strict parity on these baselines (Stage A, 2026-07-01) and
the classic raw-WebGL2 renderer was retired at Phase 2 exit — the three.js
renderer (`src/renderer/`) is now the only HD-2D renderer, still pinned to
the classic-era baselines above. If a change makes these fail, `npm run
test:e2e` shows a diff image in the HTML report — that's either an
intentional visual change (update the baseline, see below) or a regression
worth investigating before it ships.

### Determinism

Rendering a live game frame is normally nondeterministic (real-time
animation, fades, physics-adjacent camera shake). This harness pins all of
that down instead of relying on being "close enough":

1. **Virtual clock.** `js/engine.js`'s entire simulation is driven off
   `requestAnimationFrame` through a fixed-timestep loop (`loop()`/
   `TICK_MS`), and its fade transitions are `setTimeout`-based
   (`sleep(ms)`). `page.clock.install()` (Playwright's fake-timers API)
   replaces both before the page ever calls `boot()`, and the spec advances
   it by an exact number of milliseconds (`page.clock.runFor(...)`) through
   the title-click fade-in/out and a fixed settle period. Every run performs
   the exact same number of engine ticks — verified byte-identical
   screenshots across repeated runs while building this harness.
2. **No hidden randomness in the renderer.** `src/renderer/three-renderer.ts`
   has no internal `Math.random()`/`Date.now()`/`performance.now()` — light
   flicker, camera shake, walk-cycle frame selection, water waves, and
   weather particles are all derived from the engine's own tick counter
   (`globalT`, passed in as `extra.t`), which the frozen clock makes
   reproducible.
3. **Forced software GPU rendering.** `playwright.config.mjs` launches
   Chromium with `--use-gl=angle --use-angle=swiftshader
   --enable-unsafe-swiftshader`, so the WebGL2 HD-2D path rasterizes via
   SwiftShader on every machine (dev laptops and CI runners alike) instead
   of depending on whatever real GPU/driver happens to be present.
4. **Exact 1x viewport.** The test viewport is fixed at 816x624 — the sample
   project's configured screen resolution
   (`system.screenWidth`/`screenHeight`). `js/engine.js` `fitStage()` scales
   the stage by `min(window.innerWidth/SCREEN_W, ..., maxScale)`, so at
   exactly this viewport size the scale is `1` — no sub-pixel canvas scaling
   to introduce interpolation differences between machines.
5. **Small tolerance, not pixel-perfect.** `expect.toHaveScreenshot` is
   configured with `maxDiffPixelRatio: 0.02` (see `playwright.config.mjs`)
   to absorb whatever sub-pixel/AA noise remains, rather than requiring
   byte-for-byte equality.

### Updating baselines

After an intentional rendering change:

```
npx playwright test tests-e2e/renderer-golden.spec.mjs --update-snapshots
```

Review the new PNGs under `tests-e2e/__snapshots__/<platform>/` before
committing — a diff you didn't expect is a regression, not a baseline
update.

### Cross-platform baselines (Windows vs. Linux CI)

`playwright.config.mjs` sets:

```js
snapshotPathTemplate: "{testDir}/__snapshots__/{platform}/{testFileName}/{arg}{ext}"
```

so Windows and Linux each get their own baseline directory
(`__snapshots__/win32/...` vs. `__snapshots__/linux/...`) rather than
sharing one set of PNGs that would never match across font hinting /
sub-pixel rounding differences between operating systems, even with
SwiftShader forcing the same rasterizer.

**Current state:** only the `win32` baseline (captured on this dev machine)
is committed. The CI workflow (`.github/workflows/ci.yml`, `e2e` job) runs
on `ubuntu-latest`, where no `linux` baseline exists yet. Playwright's
default `updateSnapshots: "missing"` behavior means that first CI run will
*write* a fresh `linux` baseline from whatever the runner produces and the
test will **pass** (there's nothing to diff against yet) — it does not fail
the build, but it also isn't actually protecting anything until that
baseline is reviewed and checked in. The CI job uploads
`tests-e2e/__snapshots__/linux/` as a build artifact
(`e2e-golden-snapshots-linux`) specifically so a maintainer can eyeball that
first-run output and commit it; every run after that is a real diff.

If Linux rendering ever turns out to be too unstable to pin down this way
(e.g. font/driver variance inside SwiftShader itself), the fallback is to
mark the golden assertions CI-skipped there with a comment explaining why,
and keep them as a local-only (Windows dev machine) regression check. That
hasn't been necessary yet — this is a documented escape hatch, not something
currently in effect.
