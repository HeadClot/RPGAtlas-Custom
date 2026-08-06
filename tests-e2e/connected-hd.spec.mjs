/* RPGAtlas — connected HD-2D runtime coverage.
   The connection editor already proves the shared worldOrigin placement model;
   this spec proves that the same touching maps remain in the WebGL renderer and
   compose into one active-map-relative scene. */

import { test, expect } from "@playwright/test";
import { gotoWithAtlasQuest } from "./fixtures/atlas-quest.mjs";

const connectedHdProject = (project) => {
  const makeMap = (source, id, name, x, fill) => {
    const m = { ...source, id, name, width: 8, height: 8 };
    const cells = m.width * m.height;
    m.worldOrigin = { x, y: 0 };
    m.layers = {
      ground: new Array(cells).fill(fill),
      decor: new Array(cells).fill(0),
      decor2: new Array(cells).fill(0),
      over: new Array(cells).fill(0),
    };
    m.heights = new Array(cells).fill(0);
    m.shadows = new Array(cells).fill(0);
    m.passOv = new Array(cells).fill(0);
    m.regions = new Array(cells).fill(0);
    m.events = [];
    m.lights = [];
    return m;
  };

  const first = project.maps[0];
  const second = project.maps[1] || project.maps[0];
  const active = makeMap(first, first.id, "HD West", 0, 1);
  const neighbor = makeMap(second, second.id === active.id ? first.id + 1 : second.id, "HD East", 8, 2);
  active.hd2d = { enabled: true, tilt: 50, ambient: 0.45, lights: true };
  neighbor.hd2d = { enabled: false, tilt: 25, ambient: 0.1 };
  project.maps = [active, neighbor];
  project.system.startMapId = active.id;
  project.system.startX = 3;
  project.system.startY = 3;
  return project;
};

test("touching maps render through one HD-2D world surface", async ({ page }) => {
  await gotoWithAtlasQuest(page, "/play.html?hd2d=1", {
    transformProject: connectedHdProject,
  });
  await expect(page.getByText("New Game", { exact: true })).toBeVisible({ timeout: 15_000 });
  await page.getByText("New Game", { exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.Atlas?.atlas?.scene)).toBe("map");
  await expect.poll(() => page.evaluate(() => window.RPGATLAS_RENDERER_STATS?.()?.surfaceCount)).toBe(2);
  await expect.poll(() => page.evaluate(() => window.RPGATLAS_RENDERER_STATS?.()?.mapTextureReady)).toBe(true);
  await expect(page.locator("#glcanvas")).toBeVisible();

  const frameSize = await page.locator("#glcanvas").evaluate((el) => ({
    width: el.width,
    height: el.height,
    pixels: el.toDataURL().length,
  }));
  expect(frameSize.width).toBeGreaterThan(0);
  expect(frameSize.height).toBeGreaterThan(0);
  expect(frameSize.pixels).toBeGreaterThan(2048);
});

test("the existing HD-2D editor viewport includes placed neighbors", async ({ page }) => {
  await page.goto("/index.html");
  await expect(page.locator("#save-ind")).toBeVisible();
  await page.evaluate(() => {
    const project = JSON.parse(localStorage.getItem("rpgatlas_project") || "{}");
    const maps = (project.maps || []).slice(0, 2);
    const first = maps[0];
    const second = maps[1];
    if (!first || !second) return;
    first.worldOrigin = { x: 0, y: 0 };
    second.worldOrigin = { x: first.width, y: 0 };
    first.hd2d = { ...(first.hd2d || {}), enabled: true };
    project.maps = maps;
    project.system.startMapId = first.id;
    localStorage.setItem("rpgatlas_project", JSON.stringify(project));
  });
  await page.reload();
  await expect(page.locator("#save-ind")).toHaveText(/^✓ /);
  await page.locator("#menus .menu-label", { hasText: "View" }).dispatchEvent("mousedown");
  await page.locator(".menu-drop .menu-item", { hasText: "HD-2D Viewport" }).click();
  await expect(page.locator("#dock-root canvas.hd-viewport-canvas")).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.RPGATLAS_HD_VIEWPORT_STATS?.()?.surfaceCount)).toBe(2);
  await expect(page.locator("#dock-root .hd-viewport-msg")).toHaveCSS("display", "none");
});
