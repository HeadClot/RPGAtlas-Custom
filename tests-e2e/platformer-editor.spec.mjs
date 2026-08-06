/* RPGAtlas — tests-e2e/platformer-editor.spec.mjs
   Platformer authoring coverage: collision painting/history, resize and
   clipboard remapping, plus event-role persistence. */

import { test, expect } from "@playwright/test";
import { gotoWithAtlasQuest } from "./fixtures/atlas-quest.mjs";

function platformerEditorProject(project) {
  const map = project.maps.find((candidate) => candidate.id === project.system.startMapId);
  project.system.gameMode = "platformer";
  map.platformerCollision = new Array(map.width * map.height).fill(0);
  map.events = [{
    id: 900, x: 2, y: 2, name: "Checkpoint",
    pages: [{
      name: "Page 1",
      cond: { switchId: 0, varId: 0, selfSw: "", questId: 0, objectiveQuestId: 0 },
      charset: "", dir: 2, trigger: "touch", moveType: "fixed", maxDistance: 0,
      priority: "same", through: true, commands: [],
    }],
  }];
  return project;
}

async function bootEditor(page) {
  await gotoWithAtlasQuest(page, "/index.html", {
    transformProject: (project) => platformerEditorProject(project),
  });
  await expect(page.locator("#save-ind")).toHaveText(/^✓ /);
}

async function readProject(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem("rpgatlas_project")));
}

async function cellPoint(page, x, y) {
  const box = await page.locator("#mapcanvas").boundingBox();
  const map = await page.evaluate(() => {
    const p = JSON.parse(localStorage.getItem("rpgatlas_project"));
    return p.maps.find((m) => m.id === (p.system.startMapId || p.maps[0].id));
  });
  return {
    x: box.x + (x + 0.5) * box.width / map.width,
    y: box.y + (y + 0.5) * box.height / map.height,
  };
}

async function selectMode(page, label) {
  await page.locator("#menus .menu-label", { hasText: "Mode" }).dispatchEvent("mousedown");
  await page.locator(".menu-drop .menu-item", { hasText: label }).click();
}

async function collisionAt(page, x, y) {
  return page.evaluate(({ x, y }) => {
    const p = JSON.parse(localStorage.getItem("rpgatlas_project"));
    const m = p.maps.find((candidate) => candidate.id === (p.system.startMapId || p.maps[0].id));
    return m.platformerCollision[y * m.width + x];
  }, { x, y });
}

async function waitSaved(page) {
  await expect(page.locator("#save-ind")).toHaveText(/^● /);
  await expect(page.locator("#save-ind")).toHaveText(/^✓ /, { timeout: 5000 });
}

test.describe("platformer editor authoring", () => {
  test("builds a playable platformer template with controls and roles", async ({ page }) => {
    await page.goto("/index.html?fakehost");
    await expect(page.locator(".pm-bigbtn", { hasText: "New Project" })).toBeVisible();
    await page.locator(".pm-bigbtn", { hasText: "New Project" }).click();
    await page.locator(".pm-form .pm-input").fill("Platformer Test");
    await page.locator(".pm-template", { hasText: "Platformer game" }).click();
    await page.evaluate(() => window.__ATLAS_TEST_HOST__.setNextDirectory("/Games"));
    await page.locator(".pm-btn", { hasText: "Choose folder…" }).click();
    await page.locator(".pm-btn", { hasText: "Make my game" }).click();
    await expect(page.locator("#save-ind")).toBeVisible();
    const template = await page.evaluate(() => {
      const docs = JSON.parse(localStorage.getItem("atlas.fakehost.docs") || "{}");
      const raw = Object.values(docs).find((value) => typeof value === "string" && value.includes('"gameMode":"platformer"')) || Object.values(docs)[0];
      const project = typeof raw === "string" ? JSON.parse(raw) : raw;
      const map = project.maps[0];
      return {
        mode: project.system.gameMode,
        jumpKeyboard: project.system.input.keyboard.jump,
        jumpGamepad: project.system.input.gamepad.jump,
        collisionLength: map.platformerCollision.length,
        collisionKinds: [...new Set(map.platformerCollision)].sort((a, b) => a - b),
        roles: map.events.map((event) => event.pages[0].platformer?.role).sort(),
      };
    });
    expect(template).toEqual({
      mode: "platformer",
      jumpKeyboard: ["Space"],
      jumpGamepad: ["face_south"],
      collisionLength: 24 * 14,
      collisionKinds: [0, 1, 3],
      roles: ["checkpoint", "goal", "hazard"],
    });
  });

  test("paints collision cycles, preserves history, remaps resize/clipboard, and persists roles", async ({ page }) => {
    await bootEditor(page);
    await selectMode(page, "Platformer Collision Mode");

    const target = await cellPoint(page, 2, 2);
    const cycle = [];
    for (let i = 0; i < 4; i++) {
      await page.mouse.click(target.x, target.y);
      await waitSaved(page);
      cycle.push(await collisionAt(page, 2, 2));
    }
    expect(cycle).toEqual([1, 2, 3, 0]);

    await page.mouse.click(target.x, target.y);
    await waitSaved(page);
    expect(await collisionAt(page, 2, 2)).toBe(1);
    await page.keyboard.press("Control+z");
    await waitSaved(page);
    expect(await collisionAt(page, 2, 2)).toBe(0);
    await page.keyboard.press("Control+y");
    await waitSaved(page);
    expect(await collisionAt(page, 2, 2)).toBe(1);

    const picked = await cellPoint(page, 3, 2);
    await page.mouse.click(picked.x, picked.y);
    await page.mouse.click(picked.x, picked.y);
    await page.mouse.click(picked.x, picked.y);
    await page.mouse.click(picked.x, picked.y, { button: "right" });
    await expect(page.locator("#status-text")).toContainText("one-way");

    const dragStart = await cellPoint(page, 5, 2);
    const dragEnd = await cellPoint(page, 6, 2);
    await page.mouse.move(dragStart.x, dragStart.y);
    await page.mouse.down();
    await page.mouse.move(dragEnd.x, dragEnd.y);
    await page.mouse.up();
    await waitSaved(page);
    expect(await collisionAt(page, 5, 2)).toBe(1);
    expect(await collisionAt(page, 6, 2)).toBe(1);

    await page.locator("#menus .menu-label", { hasText: "Game" }).dispatchEvent("mousedown");
    await page.locator(".menu-drop .menu-item", { hasText: "Map Properties" }).click();
    const mapProps = page.locator(".modal").filter({ hasText: "Map Properties" });
    await expect(mapProps).toBeVisible();
    const dims = mapProps.locator('input[type="number"]');
    const oldProject = await readProject(page);
    const oldMap = oldProject.maps.find((m) => m.id === oldProject.system.startMapId);
    await dims.nth(0).fill(String(oldMap.width + 1));
    await dims.nth(1).fill(String(oldMap.height + 1));
    await mapProps.locator(".modal-btns button", { hasText: "OK" }).click();
    await waitSaved(page);
    const resized = await readProject(page);
    const resizedMap = resized.maps.find((m) => m.id === resized.system.startMapId);
    expect(resizedMap.platformerCollision).toHaveLength(resizedMap.width * resizedMap.height);
    expect(resizedMap.platformerCollision[2 * resizedMap.width + 2]).toBe(1);
    expect(resizedMap.platformerCollision[(resizedMap.height - 1) * resizedMap.width + (resizedMap.width - 1)]).toBe(0);

    await selectMode(page, "Map (Tile) Mode");
    await page.keyboard.down("Shift");
    const selectStart = await cellPoint(page, 5, 2);
    const selectEnd = await cellPoint(page, 6, 2);
    await page.mouse.move(selectStart.x, selectStart.y);
    await page.mouse.down();
    await page.mouse.move(selectEnd.x, selectEnd.y);
    await page.mouse.up();
    await page.keyboard.up("Shift");
    await page.keyboard.press("Control+c");
    await page.keyboard.press("Control+v");
    const pasteTarget = await cellPoint(page, 8, 2);
    await page.mouse.click(pasteTarget.x, pasteTarget.y);
    await waitSaved(page);
    expect(await collisionAt(page, 8, 2)).toBe(1);
    expect(await collisionAt(page, 9, 2)).toBe(1);

    await selectMode(page, "Event Mode");
    const eventPoint = await cellPoint(page, 2, 2);
    await page.mouse.dblclick(eventPoint.x, eventPoint.y);
    const eventModal = page.locator(".event-modal");
    await expect(eventModal).toBeVisible();
    await eventModal.locator(".platformer-event-role select").first().selectOption("checkpoint");
    const saveOnReach = eventModal.locator(".platformer-event-role input[type=checkbox]");
    await saveOnReach.check();
    await eventModal.locator(".modal-btns button", { hasText: "OK" }).click();
    await expect(page.locator("#save-ind")).toHaveText(/^✓ /, { timeout: 5000 });
    const persisted = await readProject(page);
    const event = persisted.maps.find((m) => m.id === persisted.system.startMapId).events[0];
    expect(event.pages[0].platformer).toEqual({ role: "checkpoint", saveOnReach: true });
  });
});
