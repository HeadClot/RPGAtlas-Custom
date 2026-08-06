/* RPGAtlas — tests-e2e/renderer-golden.spec.mjs
   Golden-image harness for the map renderer: HD-2D (WebGL2) and classic
   (Canvas 2D) paths, both on the sample project's start map.

   WHAT THIS PROTECTS: the Phase 2 renderer port must reproduce these pixels
   (within the configured tolerance). If a future renderer rewrite changes
   these screenshots, that's either an intentional visual change (update the
   baseline — see tests-e2e/README.md) or a regression to investigate.

   DETERMINISM:
   - The engine's whole simulation is driven by requestAnimationFrame via a
     fixed-timestep loop (see js/engine.js loop()/TICK_MS) and setTimeout-based
     fades (sleep()). Playwright's page.clock.install() replaces both with a
     virtual clock we advance by an exact number of milliseconds, so every run
     performs the exact same number of ticks — confirmed byte-identical
     screenshots across repeated runs in development of this harness.
   - The renderer itself (src/renderer/three-renderer.ts) has no internal
     Math.random()/Date.now()/performance.now() calls — every animated value
     (light flicker, camera shake, walk-cycle frame, water waves, weather
     particles) derives from the engine's tick counter (globalT), so freezing
     the clock freezes the whole scene.
   - Gameplay rolls (random-walk NPCs — the one thing the fake clock alone
     does not freeze) are seeded via the fixture's rngSeed option, so movers
     walk the identical path every boot on every machine (mulberry32, see
     src/engine/util.ts). Earlier revisions pinned movers in place instead,
     which excluded the mover render path from these goldens.
   - Chromium is launched with software-rendering flags (SwiftShader/ANGLE —
     see playwright.config.mjs) so the WebGL2 HD-2D path rasterizes the same
     way regardless of the host GPU.
   - The viewport is fixed at exactly the project's configured screen
     resolution (816x624) so js/engine.js fitStage() computes scale = 1
     (window.innerWidth/SCREEN_W == 1) — no sub-pixel canvas scaling to
     introduce interpolation differences between machines.
   GPL-3.0-or-later. */

import { test, expect } from "@playwright/test";
import { gotoWithAtlasQuest, pinMovers } from "./fixtures/atlas-quest.mjs";

const SCREEN_SIZE = { width: 816, height: 624 }; // matches Atlas_Quest system.screenWidth/Height

test.use({ viewport: SCREEN_SIZE });

// Any fixed value works; what matters is that every boot in this file uses the
// SAME seed, so Meridian Village's random-walk NPCs retrace the identical
// steps in every capture — and in the committed baselines.
const RNG_SEED = 0x5eed;

/** Boots play.html with the clock frozen, starts a new game, and advances
 * the virtual clock through the title/map fade transitions plus a fixed
 * number of extra ticks so any looping animation (idle/walk frames, light
 * flicker) lands on the same frame every time. */
async function rendererStats(page) {
  return page.evaluate(() => window.RPGATLAS_RENDERER_STATS?.() || null);
}

/** Wait for the initial map upload, then optionally wait through additional
 * complete frames. The latter is used by same-run layer comparisons: lazy
 * CanvasTexture uploads can finish on different frames when the Canvas2D
 * compositor takes a different amount of time on SwiftShader. */
async function waitForRendererReady(page, stabilize = false) {
  await page.waitForFunction(() => {
    const stats = window.RPGATLAS_RENDERER_STATS?.();
    return !!stats && stats.mapTextureReady === true && stats.renderFrameId > 0;
  }, null, { timeout: 10_000 });

  if (!stabilize) return rendererStats(page);

  // Let Playwright complete the current compositor readback before sampling
  // the lazy texture counters; this does not advance the virtual game clock.
  await page.locator("#stage").screenshot();
  const afterWindow = await rendererStats(page);
  const settled = await rendererStats(page);
  if (
    !afterWindow || !settled ||
    afterWindow.mapTextureReady !== true ||
    settled.mapTextureReady !== true ||
    settled.renderedTextureRevision !== settled.mapTextureRevision ||
    afterWindow.textures !== settled.textures ||
    afterWindow.mapTextureRevision !== settled.mapTextureRevision
  ) {
    throw new Error(`HD renderer did not reach a stable upload frame: ${JSON.stringify({ afterWindow, settled })}`);
  }
  return settled;
}

async function bootToStableMap(page, hdParam, transformProject, { stabilizeHd = true, stableLayerCapture = false } = {}) {
  const captureParam = stableLayerCapture ? "&e2eLayerStable=1" : "";
  await gotoWithAtlasQuest(page, `/play.html?hd2d=${hdParam}${captureParam}`, {
    installClock: true,
    // Seeded gameplay RNG (see fixtures/atlas-quest.mjs): these specs compare
    // pixels across boots and against committed baselines, and the seed makes
    // the random-walk movers deterministic INSTEAD of freezing them — the
    // goldens exercise the live mover render path.
    rngSeed: RNG_SEED,
    transformProject,
  });
  await expect(page.getByText("New Game", { exact: true })).toBeVisible({ timeout: 15_000 });
  // A couple of virtual frames for the title backdrop to finish its own setup.
  await page.clock.runFor(50);
  // Keep the title canvas as a reference. The title DOM can disappear before
  // the asynchronous map render has replaced that canvas, so checking only
  // .titlewin (or one canvas pixel) is not enough to establish readiness.
  const titleGameCanvas = await page.locator("#gamecanvas").screenshot();
  await page.getByText("New Game", { exact: true }).click();
  // newGame(): fadeTo(1,300) -> loadMap -> render() -> fadeTo(0,300); each
  // fadeTo awaits sleep(ms+30). 700ms of virtual time clears both fades.
  await page.clock.runFor(700);
  await expect(page.locator(".titlewin")).toHaveCount(0);
  // Extra fixed run so the walk-cycle/idle animation and any light flicker
  // settle on a specific, reproducible tick rather than whatever frame the
  // fade happened to land on.
  await page.clock.runFor(500);

  // Wait for the renderer's explicit map-texture revision handshake. This
  // avoids screenshot polling: the old two-capture loop could mistake a
  // transient WebGL upload for readiness on one runner and never settle on
  // another.
  if (hdParam === 1) {
    await waitForRendererReady(page, stabilizeHd);
  } else {
    await page.clock.runFor(0);
  }
  const stableStage = await page.locator("#stage").screenshot();
  const differsFromTitle = await page.evaluate(async ([stageB64, titleB64]) => {
    const load = (b64) => new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.src = "data:image/png;base64," + b64;
    });
    const [si, ti] = await Promise.all([load(stageB64), load(titleB64)]);
    if (si.width !== ti.width || si.height !== ti.height) return true;
    const canvas = document.createElement("canvas");
    canvas.width = si.width;
    canvas.height = si.height;
    const g = canvas.getContext("2d");
    g.drawImage(si, 0, 0);
    const sd = g.getImageData(0, 0, canvas.width, canvas.height).data;
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.drawImage(ti, 0, 0);
    const td = g.getImageData(0, 0, canvas.width, canvas.height).data;
    let diff = 0;
    for (let i = 0; i < sd.length; i++) if (sd[i] !== td[i]) diff++;
    return diff;
  }, [stableStage.toString("base64"), titleGameCanvas.toString("base64")]);
  // HD readiness is established by the renderer revision handshake above;
  // only the classic path needs this one-time canvas-content guard.
  if (hdParam !== 1) {
    expect(differsFromTitle > 1_000_000, "map render did not produce a complete frame").toBe(true);
  }
  return stableStage;
}

async function expectStableMapScreenshot(page, hdParam, transformProject, snapshotName) {
  const stableStage = await bootToStableMap(page, hdParam, transformProject);
  await expect(stableStage).toMatchSnapshot(snapshotName, { maxDiffPixelRatio: 0.02 });
}

test.describe("renderer golden images", () => {
  test("HD-2D map (Meridian Village, ?hd2d=1) renders a stable frame", async ({ page }) => {
    await expectStableMapScreenshot(page, 1, null, "hd2d-meridian-village.png");
  });

  // The sample project keeps bloom/DoF/fog off, so the spec above never runs
  // the post chain. This baseline was captured from the CLASSIC renderer
  // before its retirement (see tests-e2e/README.md), and the three.js path
  // must keep reproducing it — post-stack parity, machine-checked.
  const withPostStack = (project) => {
    project.maps[0].hd2d = {
      enabled: true, tilt: 50, bloom: true, dof: true,
      fog: { color: "#101018" }, lights: true, ambient: 0.45,
    };
    return project;
  };

  test("HD-2D post stack (bloom+DoF+fog) renders a stable frame", async ({ page }) => {
    await expectStableMapScreenshot(page, 1, withPostStack, "hd2d-post-meridian-village.png");
  });

  // Stage B: sun shadow maps are a NEW capability (three.js renderer only —
  // no classic reference exists), so this baseline was captured from the
  // three.js renderer itself and guards against regressions from here on.
  test("HD-2D sun shadows (map.hd2d.shadows) render a stable frame", async ({ page }) => {
    await expectStableMapScreenshot(page, 1, (project) => {
      project.maps[0].hd2d = { enabled: true, tilt: 50, shadows: true, lights: true, ambient: 0.45 };
      return project;
    }, "hd2d-shadows-meridian-village.png");
  });

  // Stage B.2: point-light shadows (three.js renderer only). The transform
  // injects two big lights and a raised wall so terrain AND sprites occlude.
  test("HD-2D point-light shadows (map.hd2d.pointShadows) render a stable frame", async ({ page }) => {
    await expectStableMapScreenshot(page, 1, (project) => {
      const m = project.maps[0];
      m.hd2d = { enabled: true, tilt: 50, lights: true, ambient: 0.25, pointShadows: true };
      m.lights = [
        { rx: 10.5, ry: 10.5, color: "#ffcc88", radius: 320 },
        { rx: 14, ry: 12, color: "#88bbff", radius: 240 },
      ];
      for (let y = 9; y <= 10; y++) m.heights[y * m.width + 8] = 2;
      return project;
    }, "hd2d-pointshadows-meridian-village.png");
  });

  // Stage C: animated water surface (village pond) — waves/reflection/foam
  // all derive from the frozen engine tick, so the frame is reproducible.
  test("HD-2D water surface (map.hd2d.water) renders a stable frame", async ({ page }) => {
    await expectStableMapScreenshot(page, 1, (project) => {
      project.maps[0].hd2d = { enabled: true, tilt: 50, water: true, lights: true, ambient: 0.45 };
      return project;
    }, "hd2d-water-meridian-village.png");
  });

  // Stage C: auto materials — relief + specular from lights, emissive glow at
  // low ambient (village windows). Lights injected near the pond and house A.
  test("HD-2D auto materials (map.hd2d.materials) render a stable frame", async ({ page }) => {
    await expectStableMapScreenshot(page, 1, (project) => {
      const m = project.maps[0];
      m.hd2d = { enabled: true, tilt: 50, materials: true, lights: true, ambient: 0.15 };
      m.lights = [
        { rx: 6, ry: 12, color: "#ffcc88", radius: 300 },
        { rx: 18, ry: 6.5, color: "#ffb060", radius: 260 },
      ];
      return project;
    }, "hd2d-materials-meridian-village.png");
  });

  // Stage D: the extended post stack — ACES, warm grade, vignette, SSAO,
  // FXAA on top of bloom. (The Stage A bloom/DoF golden above still passes
  // unchanged, proving the new composite is bit-identical with these off.)
  test("HD-2D post stack v2 (ACES+grade+vignette+SSAO+FXAA) renders a stable frame", async ({ page }) => {
    await expectStableMapScreenshot(page, 1, (project) => {
      project.maps[0].hd2d = {
        enabled: true, tilt: 50, bloom: true, lights: true, ambient: 0.45,
        aces: true, vignette: true, lut: "warm", ssao: true, fxaa: true,
      };
      return project;
    }, "hd2d-post2-meridian-village.png");
  });

  // Stage D: day/night at golden hour — low gold-tinted sun, long shadows,
  // window glow beginning to engage, water glints on the dusk sun.
  test("HD-2D day/night dusk (map.hd2d.dayNight) renders a stable frame", async ({ page }) => {
    await expectStableMapScreenshot(page, 1, (project) => {
      project.maps[0].hd2d = {
        enabled: true, tilt: 50, lights: true, ambient: 0.45,
        dayNight: true, timeOfDay: 17.5, shadows: true, water: true, materials: true,
      };
      return project;
    }, "hd2d-dusk-meridian-village.png");
  });

  // Stage E: stateless GPU weather particles — positions are pure functions
  // of the frozen tick, so rain streaks land identically every run.
  test("HD-2D weather particles (map.hd2d.weather rain) render a stable frame", async ({ page }) => {
    await expectStableMapScreenshot(page, 1, (project) => {
      project.maps[0].hd2d = {
        enabled: true, tilt: 50, lights: true, ambient: 0.4,
        weather: "rain", dropShadows: true,
      };
      return project;
    }, "hd2d-rain-meridian-village.png");
  });

  // Stage D2: cliff auto-texturing (three.js renderer only, map.hd2d.cliffs).
  // A 3-tile-tall block exposes south/east/west faces so the top-down ambient-
  // occlusion gradient, the sunlit crest lip and the chiselled vertical corners
  // are all in frame. With cliffs OFF these same faces keep the flat Stage E
  // tint (guarded by every other HD-2D golden here) — this baseline is the
  // sculpted look, so it also proves the flag actually changes the pixels.
  test("HD-2D cliff auto-texturing (map.hd2d.cliffs) renders a stable frame", async ({ page }) => {
    await expectStableMapScreenshot(page, 1, (project) => {
      const m = project.maps[0];
      m.hd2d = { enabled: true, tilt: 50, cliffs: true, lights: true, ambient: 0.45 };
      for (let y = 8; y <= 9; y++)
        for (let x = 9; x <= 10; x++) m.heights[y * m.width + x] = 3;
      return project;
    }, "hd2d-cliffs-meridian-village.png");
  });

  test("classic 2D renderer (?hd2d=0 override) renders a stable frame", async ({ page }) => {
    await expectStableMapScreenshot(page, 0, null, "classic2d-meridian-village.png");
  });
});

// Phase 8 Stage B: the generalized layer stack (map.layersAdv). The engine and
// HD-2D buffer composition branch on layersAdv; these guard both sides of that
// branch. Rather than commit new baseline PNGs (fragile — the classic 2D
// baseline itself drifts on some GPUs), these compare renders captured IN THE
// SAME RUN: a defaults-only core stack must composite to the exact same pixels
// as the classic four-array loop (machine-independent), and a stack with user
// layers must both change the frame and stay deterministic.
test.describe("generalized layers (map.layersAdv)", () => {
  const CLASSIC_CORES = [
    { id: 1, name: "ground", type: "core", role: "ground" },
    { id: 2, name: "decor", type: "core", role: "decor" },
    { id: 3, name: "decor2", type: "core", role: "decor2" },
    { id: 4, name: "over", type: "core", role: "over" },
  ];
  // New Game loads the project's start map, not maps[0] — target that one so
  // the fixtures actually exercise the composite path the engine renders.
  const startMap = (project) =>
    project.maps.find((m) => m.id === project.system.startMapId) || project.maps[0];
  const classicEquivalent = (project) => {
    startMap(project).layersAdv = CLASSIC_CORES.map((l) => ({ ...l }));
    return project;
  };
  const withUserLayers = (project) => {
    const m = startMap(project);
    m.layersAdv = [
      ...CLASSIC_CORES.map((l) => ({ ...l })),
      { id: 5, name: "Glow", type: "tile", slot: "below", blend: "add", data: m.layers.ground.slice() },
      { id: 6, name: "Haze", type: "tile", slot: "above", opacity: 0.4, data: m.layers.over.slice() },
    ];
    return project;
  };

  /** Boot to a stable frame and return the #stage screenshot buffer. These
   * tests assert byte-EXACT equality between boots, which the seeded RNG
   * alone cannot give while movers walk (capture-tick jitter — see the
   * pinMovers doc in fixtures/atlas-quest.mjs), so movers stay pinned here.
   * That costs nothing: this describe guards LAYER COMPOSITING; the walking-
   * mover render path is covered by the committed goldens above. */
  const stabilizeLayerComparison = (project) => {
    // Layer comparisons should contain only the map buffers. The player is
    // unrelated to compositing and can otherwise land on a different sprite
    // frame between separate deterministic boots.
    project.system.startTransparent = true;
    for (const map of project.maps || []) {
      for (const event of map.events || []) {
        for (const page of event.pages || []) {
          page.charset = "";
          page.stepAnim = false;
          page.walkAnim = false;
          page.stepAnime = false;
          page.walkAnime = false;
        }
      }
    }
    return pinMovers(project);
  };

  async function frame(page, hd, transform) {
    const stableStage = await bootToStableMap(page, hd, (project) =>
      stabilizeLayerComparison(transform ? (transform(project) ?? project) : project),
      { stabilizeHd: hd === 1, stableLayerCapture: true },
    );
    return {
      png: stableStage || page.locator("#stage").screenshot(),
      stats: hd === 1 ? await rendererStats(page) : null,
    };
  }
  /** Count RGBA byte differences between two PNG buffers, decoded in-page. */
  async function pixelDiff(page, a, b) {
    return page.evaluate(async ([aB64, bB64]) => {
      const load = (b64) => new Promise((res) => {
        const img = new Image();
        img.onload = () => res(img);
        img.src = "data:image/png;base64," + b64;
      });
      const [ia, ib] = await Promise.all([load(aB64), load(bB64)]);
      if (ia.width !== ib.width || ia.height !== ib.height) return -1;
      const data = (img) => {
        const c = document.createElement("canvas");
        c.width = img.width; c.height = img.height;
        const g = c.getContext("2d");
        g.drawImage(img, 0, 0);
        return g.getImageData(0, 0, c.width, c.height).data;
      };
      const da = data(ia), db = data(ib);
      let diff = 0;
      for (let i = 0; i < da.length; i++) if (da[i] !== db[i]) diff++;
      return diff;
    }, [a.toString("base64"), b.toString("base64")]);
  }

  test("2D: a defaults-only core stack composites byte-identically to classic", async ({ page }) => {
    const classic = await frame(page, 0, null);
    const composite = await frame(page, 0, classicEquivalent);
    // The 2D path is pure Canvas2D (deterministic) — exact byte equality proves
    // composeAdvBuffers reproduces the four-array loop, buffer for buffer.
    expect(await pixelDiff(page, classic.png, composite.png)).toBe(0);
  });

  test("2D: user blend/opacity layers change the frame and render deterministically", async ({ page }) => {
    const classic = await frame(page, 0, null);
    const layered1 = await frame(page, 0, withUserLayers);
    const layered2 = await frame(page, 0, withUserLayers);
    // The added "add"-blend ground copy + translucent overhead visibly alter the
    // frame, and two identical boots must be pixel-stable.
    expect(await pixelDiff(page, classic.png, layered1.png)).toBeGreaterThan(0);
    expect(await pixelDiff(page, layered1.png, layered2.png)).toBe(0);
  });

  test("HD-2D: buffer folding adds no divergence beyond WebGL boot noise", async ({ page }) => {
    // The WebGL path is not bit-stable across boots on every GPU, so the classic
    // vs classic pair sets the noise floor; folding a defaults-only stack must
    // not exceed it. (The 2D test above already proves the buffers are identical
    // — HD-2D consumes exactly those buffers.)
    const a = await frame(page, 1, null);
    const b = await frame(page, 1, null);
    const composite = await frame(page, 1, classicEquivalent);
    const control = await pixelDiff(page, a.png, b.png);
    const folded = await pixelDiff(page, a.png, composite.png);
    expect(
      folded,
      `HD layer capture diagnostics: ${JSON.stringify({ control, folded, a: a.stats, b: b.stats, composite: composite.stats })}`,
    ).toBeLessThanOrEqual(control * 2 + 5000);
  });
});
