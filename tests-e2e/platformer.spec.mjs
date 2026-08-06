/* RPGAtlas — tests-e2e/platformer.spec.mjs
   Platformer v1 acceptance slice: continuous movement/jump, collision-triggered
   checkpoint recovery, goal commands, and the project-level Canvas mode gate. */

import { test, expect } from "@playwright/test";
import { gotoWithAtlasQuest } from "./fixtures/atlas-quest.mjs";

function platformerProject(project, { hazard = false, goal = false } = {}) {
  const map = project.maps.find((candidate) => candidate.id === project.system.startMapId);
  project.system.gameMode = "platformer";
  project.system.startX = 4;
  project.system.startY = map.height - 2;
  project.system.startDir = 2;
  map.hd2d = { ...(map.hd2d || {}), enabled: false };
  map.platformerCollision = new Array(map.width * map.height).fill(2);
  for (let x = 0; x < map.width; x++) map.platformerCollision[(map.height - 1) * map.width + x] = 1;
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

  test("standalone export keeps the platformer project mode", async ({ page }) => {
    await startGame(page, { goal: true });
    const exported = await page.evaluate(async () => {
      const io = await import("/js/editor/project-io.js");
      const project = JSON.parse(localStorage.getItem("rpgatlas_project"));
      const game = await io.buildStandaloneGame(project, window.RPGAtlasDeps.Assets);
      return game.html;
    });
    expect(exported).toContain('"gameMode":"platformer"');
    expect(exported).toContain("window.RPGAtlasDeps");
  });
});
