/* RPGAtlas — tests-e2e/platformer.spec.mjs
   Platformer v1 acceptance slice: continuous movement/jump, collision-triggered
   checkpoint recovery, goal commands, and the project-level Canvas mode gate. */

import { test, expect } from "@playwright/test";
import { gotoWithAtlasQuest } from "./fixtures/atlas-quest.mjs";

function platformerProject(project, { hazard = false, goal = false, oneWay = false, multiplayer = false } = {}) {
  const map = project.maps.find((candidate) => candidate.id === project.system.startMapId);
  project.system.gameMode = "platformer";
  project.system.multiplayer = { ...(project.system.multiplayer || {}), enabled: multiplayer };
  project.system.startX = oneWay ? 7 : 4;
  project.system.startY = map.height - 2;
  project.system.startDir = 2;
  map.hd2d = { ...(map.hd2d || {}), enabled: false };
  map.platformerCollision = new Array(map.width * map.height).fill(2);
  for (let x = 0; x < map.width; x++) map.platformerCollision[(map.height - 1) * map.width + x] = 1;
  if (oneWay) for (let x = 6; x <= 9; x++) map.platformerCollision[(map.height - 3) * map.width + x] = 3;
  const page = (role, commands = []) => ({
    name: "Page 1", cond: { switchId: 0, varId: 0, selfSw: "", questId: 0, objectiveQuestId: 0 },
    charset: "", dir: 2, trigger: "touch", moveType: "fixed", maxDistance: 0,
    priority: "same", through: true, commands, platformer: { role },
  });
  const event = (id, x, name, role, commands = []) => ({ id, x, y: map.height - 2, name, pages: [page(role, commands)] });
  map.events = [event(100, 8, "Checkpoint", "checkpoint")];
  if (hazard) map.events.push(event(101, 12, "Hazard", "hazard"));
  if (goal) map.events.push(event(102, 12, "Goal", "goal", [{ t: "text", name: "", text: "Level complete!" }]));
  return project;
}

async function startGame(page, options) {
  await gotoWithAtlasQuest(page, "/play.html?playtest=platformer", {
    transformProject: (project) => platformerProject(project, options),
  });
  await expect(page.getByText("New Game", { exact: true })).toBeVisible();
  await page.getByText("New Game", { exact: true }).click();
  await expect(page.locator(".titlewin")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.Atlas?.atlas?.scene)).toBe("map");
}

async function hold(page, key, frames = 45) {
  await page.keyboard.down(key);
  await page.evaluate((count) => new Promise((resolve) => {
    let n = 0;
    const tick = () => { if (++n >= count) resolve(); else requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }), frames);
  await page.keyboard.up(key);
}

async function waitFrames(page, frames) {
  await page.evaluate((count) => new Promise((resolve) => {
    let n = 0;
    const tick = () => { if (++n >= count) resolve(); else requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }), frames);
}

test.describe("platformer mode", () => {
  test("launches in Canvas side-on mode and supports continuous movement and jump", async ({ page }) => {
    await startGame(page, { goal: false });
    await expect.poll(() => page.evaluate(() => ({
      mode: window.Atlas.atlas.project.system.gameMode,
      hd2d: window.Atlas.atlas.map.hd2d?.enabled === true,
    }))).toEqual({ mode: "platformer", hd2d: false });

    const before = await page.evaluate(() => ({ x: window.Atlas.atlas.player.x, y: window.Atlas.atlas.player.y }));
    await hold(page, "ArrowRight", 30);
    const moved = await page.evaluate(() => ({ x: window.Atlas.atlas.player.x, y: window.Atlas.atlas.player.y }));
    expect(moved.x).toBeGreaterThan(before.x + 0.5);
    await page.keyboard.down("Space");
    await page.waitForTimeout(120);
    const airborne = await page.evaluate(() => window.Atlas.atlas.player.y);
    await page.keyboard.up("Space");
    expect(airborne).toBeLessThan(moved.y);
  });

  test("updates a checkpoint, respawns from a hazard, and runs a goal event", async ({ page }) => {
    await startGame(page, { hazard: true });
    await hold(page, "ArrowRight", 100);
    const recovered = await page.evaluate(() => window.Atlas.atlas.player.x);
    expect(recovered).toBeGreaterThan(7);
    expect(recovered).toBeLessThan(10.5);

    await startGame(page, { goal: true });
    await hold(page, "ArrowRight", 110);
    await expect(page.getByText("Level complete!", { exact: true })).toBeVisible();
  });

  test("passes through one-way platforms from below and drops through them", async ({ page }) => {
    await startGame(page, { oneWay: true });
    const platform = await page.evaluate(() => ({
      y: window.Atlas.atlas.map.height - 3,
      bodyY: window.Atlas.atlas.player.platformer.y,
    }));

    await page.keyboard.down("Space");
    await waitFrames(page, 36);
    await page.keyboard.up("Space");
    await expect.poll(() => page.evaluate(() => ({
      grounded: !!window.Atlas.atlas.player.platformer.grounded,
      y: window.Atlas.atlas.player.platformer.y,
    }))).toMatchObject({ grounded: true });
    const landed = await page.evaluate(() => window.Atlas.atlas.player.platformer.y);
    expect(landed).toBeCloseTo(platform.y - 0.9, 1);
    expect(landed).toBeLessThan(platform.bodyY);

    await page.keyboard.down("ArrowDown");
    await page.keyboard.down("Space");
    await waitFrames(page, 10);
    await page.keyboard.up("Space");
    await page.keyboard.up("ArrowDown");
    const dropped = await page.evaluate(() => window.Atlas.atlas.player.platformer.y);
    expect(dropped).toBeGreaterThan(landed + 0.1);
    await expect.poll(() => page.evaluate(() => window.Atlas.atlas.player.platformer.grounded)).toBe(true);
    await expect.poll(() => page.evaluate(() => window.Atlas.atlas.player.platformer.y)).toBeCloseTo(
      (await page.evaluate(() => window.Atlas.atlas.map.height)) - 1.9,
      1,
    );
  });

  test("saves and loads continuous position, checkpoint, and zero coordinates safely", async ({ page }) => {
    await startGame(page, { hazard: false });
    await hold(page, "ArrowRight", 45);
    await expect.poll(() => page.evaluate(() => window.Atlas.atlas.player.x)).toBeGreaterThan(7);

    await page.evaluate(() => {
      const p = window.Atlas.atlas.player;
      p.platformer.x = 0;
      p.platformer.y = window.Atlas.atlas.map.height - 1.9;
      p.platformer.vx = 0;
      p.platformer.vy = 0;
      p.platformer.grounded = true;
      p.x = p.rx = p.prx = p.tx = 0;
      p.y = p.ry = p.pry = p.ty = p.platformer.y;
    });

    await expect(async () => {
      await page.keyboard.press("Escape");
      await expect(page.locator(".mainmenu")).toBeVisible({ timeout: 500 });
    }).toPass({ timeout: 5000 });
    await page.getByText("Save", { exact: false }).click();
    await expect(page.locator(".savewin")).toBeVisible();
    await page.getByText("Slot 1", { exact: false }).click();
    const confirmMsg = page.locator(".msgwin");
    await expect(confirmMsg).toBeVisible();
    await expect(async () => {
      await confirmMsg.click();
      await expect(confirmMsg).toHaveCount(0, { timeout: 300 });
    }).toPass({ timeout: 5000 });

    const saved = await page.evaluate(() => {
      const key = Object.keys(localStorage).find((k) => /^rpgatlas(_.+)?_save_1$/.test(k) || /^driftwood_save_1$/.test(k));
      return key ? JSON.parse(localStorage.getItem(key)) : null;
    });
    expect(saved.data.player.platformer.x).toBe(0);
    expect(saved.data.platformerCheckpoint).not.toBeNull();

    await page.evaluate(() => {
      const p = window.Atlas.atlas.player;
      p.platformer.vx = 3;
      p.platformer.vy = -2;
    });

    await page.getByText("To Title", { exact: false }).click();
    await page.getByText("Return to title", { exact: true }).click();
    await expect(page.locator(".titlewin")).toBeVisible();
    await page.getByText("Continue", { exact: true }).click();
    await expect(page.locator(".savewin")).toBeVisible();
    await page.getByText("Slot 1", { exact: false }).click();
    await expect(page.locator(".titlewin")).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => ({
      x: window.Atlas.atlas.player.platformer.x,
      vx: window.Atlas.atlas.player.platformer.vx,
      vy: window.Atlas.atlas.player.platformer.vy,
    }))).toMatchObject({ x: 0, vx: 0, vy: 0 });
  });

  test("hides Beacon multiplayer for platformer projects", async ({ page }) => {
    await gotoWithAtlasQuest(page, "/play.html?playtest=platformer", {
      transformProject: (project) => platformerProject(project, { multiplayer: true }),
    });
    await expect(page.getByText("New Game", { exact: true })).toBeVisible();
    await expect(page.getByText("Play Together", { exact: true })).toHaveCount(0);
  });

  test("standalone export launches with the platformer project mode", async ({ page }) => {
    await startGame(page, { goal: true });
    const exported = await page.evaluate(async () => {
      const io = await import("/js/editor/project-io.js");
      const project = JSON.parse(localStorage.getItem("rpgatlas_project"));
      const game = await io.buildStandaloneGame(project, window.RPGAtlasDeps.Assets);
      return game.html;
    });
    expect(exported).toContain('"gameMode":"platformer"');
    expect(exported).toContain("window.RPGAtlasDeps");
    const exportedPage = await page.context().newPage();
    await exportedPage.setContent(exported);
    await expect(exportedPage.getByText("New Game", { exact: true })).toBeVisible();
    await exportedPage.getByText("New Game", { exact: true }).click();
    await expect.poll(() => exportedPage.evaluate(() => ({
      scene: window.Atlas?.atlas?.scene,
      mode: window.Atlas?.atlas?.project?.system?.gameMode,
    }))).toEqual({ scene: "map", mode: "platformer" });
    await exportedPage.close();
  });
});
