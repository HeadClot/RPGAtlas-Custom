/* RPGAtlas — editor-playtest-only Ctrl Through verification.
   Exercises the built player with the same host markers used by Playtest and
   standalone exports. GPL-3.0-or-later. */

import { test, expect } from "@playwright/test";
import { atlasQuestJson, gotoWithAtlasQuest } from "./fixtures/atlas-quest.mjs";

const START_X = 12;
const START_Y = 12;
const TARGET_X = START_X + 1;

function blockRightOfStart(project) {
  const map = project.maps.find(
    (candidate) => candidate.id === project.system.startMapId,
  );
  map.passOv[TARGET_X + START_Y * map.width] = 2;
  map.events = (map.events || []).filter(
    (event) => event.x !== TARGET_X || event.y !== START_Y,
  );
  if (map.hd2d) map.hd2d.enabled = false;
  return project;
}

async function startGame(page) {
  await expect(page.getByText("New Game", { exact: true })).toBeVisible();
  await page.getByText("New Game", { exact: true }).click();
  await expect(page.locator(".titlewin")).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => window.Atlas?.atlas?.scene))
    .toBe("map");
}

async function playerTile(page) {
  return page.evaluate(() => ({
    x: window.Atlas.atlas.player.x,
    y: window.Atlas.atlas.player.y,
  }));
}

async function tapMovement(page, key, withControl = false, expected = null) {
  if (withControl) await page.keyboard.down("Control");
  await page.keyboard.down(key);
  // Keep the edge held through two browser frames so the engine can poll the
  // key while Ctrl is still down; this replaces the old 50 ms key hold.
  await page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }));
  await page.keyboard.up(key);
  if (withControl) await page.keyboard.up("Control");
  if (expected) {
    // A Through-enabled movement is complete only when the player reaches
    // the requested tile; this is the meaningful state transition and stays
    // bounded on a stalled page.
    await expect
      .poll(() => page.evaluate(() => ({
        x: window.Atlas.atlas.player.x,
        y: window.Atlas.atlas.player.y,
      })), { timeout: 3000 })
      .toEqual(expected);
  } else {
    // A blocked attempt intentionally has no observable state transition.
    // Yield through two browser frames so the queued key edge is consumed,
    // without paying the old fixed 400 ms delay.
    await page.evaluate(() => new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    }));
  }
}

test("Ctrl walks through blocked tiles in an editor playtest", async ({
  page,
}) => {
  await gotoWithAtlasQuest(page, "/play.html?playtest=e2e", {
    transformProject: blockRightOfStart,
  });
  await startGame(page);

  expect(await playerTile(page)).toEqual({ x: START_X, y: START_Y });
  await tapMovement(page, "ArrowRight");
  expect(await playerTile(page)).toEqual({ x: START_X, y: START_Y });

  await tapMovement(page, "ArrowRight", true, { x: TARGET_X, y: START_Y });
  expect(await playerTile(page)).toEqual({ x: TARGET_X, y: START_Y });
});

test("a deployed game ignores Ctrl even with a forged playtest query", async ({
  page,
}) => {
  const project = blockRightOfStart(JSON.parse(atlasQuestJson()));
  await page.addInitScript((deployedProject) => {
    window.RPGATLAS_PROJECT = deployedProject;
  }, project);
  await page.goto("/play.html?playtest=forged");
  await startGame(page);

  expect(await playerTile(page)).toEqual({ x: START_X, y: START_Y });
  await tapMovement(page, "ArrowRight", true);
  expect(await playerTile(page)).toEqual({ x: START_X, y: START_Y });
});
