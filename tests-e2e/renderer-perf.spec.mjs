/* RPGAtlas — tests-e2e/renderer-perf.spec.mjs
   Phase 2 exit criterion: the 60 fps @1080p performance budget, as a CI
   regression gate.

   WHAT THIS PROTECTS: the sample map at 1920x1080 with EVERY HD-2D feature
   enabled at once (sun + point-light shadows, water reflections, auto
   materials, rain particles, day/night, bloom + DoF + SSAO + ACES + grade +
   vignette + FXAA) must keep rendering under a fixed frame-time budget.

   CALIBRATION: CI and this harness rasterize through SwiftShader (software
   rendering — see playwright.config.mjs), where this worst-case scene
   measured ~167 ms/frame at capture time (2026-07-02, typical dev machine).
   Real GPUs — integrated included — run the same GL workload one to two
   orders of magnitude faster, which is how a software-measured ~170 ms maps
   to comfortably under 16.6 ms on integrated hardware (spot-verified on a
   real GPU at parity sign-off). The local budget below gives ~1.8x headroom
   for machine variance; GitHub's shared SwiftShader runner uses an 800 ms
   budget because its observed all-features frame time is roughly 650 ms. If
   this spec starts failing, profile the change before changing a budget.
   Override either environment with:
   RPGATLAS_PERF_BUDGET_MS. GPL-3.0-or-later. */

import { test, expect } from "@playwright/test";
import { gotoWithAtlasQuest } from "./fixtures/atlas-quest.mjs";
import { makeRand, measureFrameStats, measureFrames } from "./fixtures/perf.mjs";

const BUDGET_MS = Number(process.env.RPGATLAS_PERF_BUDGET_MS) || (process.env.CI ? 800 : 300);
const WARMUP_FRAMES = 30;
const MEASURE_FRAMES = 90;
const CLASSIC_BUDGET_MS = Number(process.env.RPGATLAS_CLASSIC2D_PERF_BUDGET_MS) || 100;

test.use({ viewport: { width: 1920, height: 1080 } });

function classicStress(project) {
  const W = 160, H = 160, size = W * H;
  const rand = makeRand(20260805);
  const m = project.maps[0];
  m.width = W;
  m.height = H;
  m.layers = {
    ground: new Array(size).fill(1),
    decor: new Array(size).fill(0),
    decor2: new Array(size).fill(0),
    over: new Array(size).fill(0),
  };
  for (let i = 0; i < size; i++) {
    const r = rand();
    if (r < 0.12) m.layers.ground[i] = 2;
    else if (r < 0.17) m.layers.decor[i] = 6;
    else if (r < 0.19) m.layers.over[i] = 15;
  }
  const page = JSON.parse(JSON.stringify(m.events[0].pages[0]));
  page.commands = [];
  page.moveType = "fixed";
  m.events = [];
  for (let i = 0; i < 240; i++) {
    m.events.push({
      id: i + 1,
      name: "classic-perf-" + i,
      x: 1 + Math.floor(rand() * (W - 2)),
      y: 1 + Math.floor(rand() * (H - 2)),
      pages: [JSON.parse(JSON.stringify(page))],
    });
  }
  m.hd2d = { enabled: false };
  m.lights = [];
  return project;
}

test.describe("renderer performance budget", () => {
  test("all-features HD-2D frame time at 1080p stays inside the budget", async ({ page }) => {
    test.setTimeout(120_000);
    await gotoWithAtlasQuest(page, "/play.html?hd2d=1&perf=renderer", {
      transformProject: (project) => {
        project.system.screenWidth = 1920;
        project.system.screenHeight = 1080;
        const m = project.maps[0];
        m.hd2d = {
          enabled: true, tilt: 50, lights: true, ambient: 0.4,
          shadows: true, pointShadows: true, water: true, materials: true,
          weather: "rain", dropShadows: true, dayNight: true, timeOfDay: 16,
          bloom: true, dof: true, ssao: true, aces: true, vignette: true,
          lut: "warm", fxaa: true, fog: { color: "#101018" },
        };
        m.lights = [
          { rx: 10.5, ry: 10.5, color: "#ffcc88", radius: 320 },
          { rx: 14, ry: 12, color: "#88bbff", radius: 240 },
          { rx: 18, ry: 6, color: "#ffb060", radius: 260 },
          { rx: 6, ry: 6, color: "#88ffaa", radius: 220 },
        ];
        return project;
      },
    });
    await expect(page.getByText("New Game", { exact: true })).toBeVisible({ timeout: 15_000 });
    await page.getByText("New Game", { exact: true }).click();
    await expect(page.locator(".titlewin")).toHaveCount(0, { timeout: 15_000 });

    const avgMs = await measureFrames(page, { warmup: WARMUP_FRAMES, frames: MEASURE_FRAMES });
    const stats = await page.evaluate(() => window.RPGATLAS_RENDERER_STATS());

    console.log(
      `[perf] all-features 1080p: ${avgMs.toFixed(2)} ms/frame avg over ${MEASURE_FRAMES} frames (budget ${BUDGET_MS} ms, SwiftShader)`,
    );
    expect(avgMs).toBeLessThan(BUDGET_MS);
    expect(stats).not.toBeNull();
    expect(stats.timings).toMatchObject({
      setupMs: expect.any(Number),
      sunShadowMs: expect.any(Number),
      pointShadowMs: expect.any(Number),
      reflectionMs: expect.any(Number),
      sceneMs: expect.any(Number),
      postMs: expect.any(Number),
    });
  });

  test("classic 2D frame cadence on a large map stays inside the budget", async ({ page }) => {
    test.setTimeout(120_000);
    await gotoWithAtlasQuest(page, "/play.html?hd2d=0", { transformProject: classicStress });
    await expect(page.getByText("New Game", { exact: true })).toBeVisible({ timeout: 15_000 });
    await page.getByText("New Game", { exact: true }).click();
    await expect(page.locator(".titlewin")).toHaveCount(0, { timeout: 15_000 });

    const stats = await measureFrameStats(page, { warmup: 30, frames: 90 });
    console.log(
      `[perf] classic 2D 160x160/240 events: ${stats.avgMs.toFixed(2)} ms/frame avg, ${stats.p95Ms.toFixed(2)} ms p95 (budget ${CLASSIC_BUDGET_MS} ms)`,
    );
    await expect(page.locator("#glcanvas")).toHaveCount(0);
    expect(stats.avgMs).toBeLessThan(CLASSIC_BUDGET_MS);
  });
});
