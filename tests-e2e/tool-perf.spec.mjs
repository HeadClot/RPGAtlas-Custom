/* RPGAtlas — tests-e2e/tool-perf.spec.mjs
   Targeted editor-tool performance coverage. These are deliberately browser
   work measurements (not Playwright action latency): each scenario dispatches
   a burst of real DOM/canvas events and records the work completed before the
   next animation frame. GPL-3.0-or-later. */

import { test, expect } from "@playwright/test";
import { gotoWithAtlasQuest } from "./fixtures/atlas-quest.mjs";

async function bootEditor(page, transformProject = null) {
  await gotoWithAtlasQuest(page, "/index.html", { transformProject });
  await expect(page.locator("#save-ind")).toHaveText(/^✓ /, { timeout: 15_000 });
}

function largeEditorMap(project) {
  const W = 96, H = 96, size = W * H;
  const m = project.maps[0];
  m.width = W;
  m.height = H;
  m.layers = {
    ground: new Array(size).fill(1),
    decor: new Array(size).fill(0),
    decor2: new Array(size).fill(0),
    over: new Array(size).fill(0),
  };
  for (let i = 0; i < size; i += 11) m.layers.decor[i] = 6;
  m.events = m.events.slice(0, 24).map((event, i) => ({
    ...event,
    id: i + 1,
    x: 2 + (i * 7) % (W - 4),
    y: 2 + (i * 11) % (H - 4),
  }));
  return project;
}

async function editorMenu(page, label) {
  await page.locator("#menus .menu-label", { hasText: label }).dispatchEvent("mousedown");
}

test.describe("editor tool performance", () => {
  test("coalesces rapid Generator Hub and Character Generator updates", async ({ page }) => {
    await bootEditor(page);
    await editorMenu(page, "Generators");
    await page.locator(".menu-drop .menu-item", { hasText: "Weapon Name Generator" }).click();
    const generator = page.locator(".modal.generator-hub-modal");
    await expect(generator).toBeVisible();

    const generatorMs = await page.evaluate(async () => {
      const input = document.querySelector(".generator-hub-modal .gen-search");
      const start = performance.now();
      for (let i = 0; i < 80; i++) {
        input.value = i % 2 ? "weapon" : "spell";
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
      await new Promise((resolve) => requestAnimationFrame(resolve));
      return performance.now() - start;
    });
    expect(generatorMs).toBeLessThan(500);
    await generator.locator(".modal-btns button").first().click();

    await editorMenu(page, "Tools");
    await page.locator(".menu-drop .menu-item", { hasText: "Character Generator" }).click();
    const character = page.locator(".modal", { hasText: "Character Generator" });
    await expect(character).toBeVisible();
    const previewMs = await page.evaluate(async () => {
      const input = document.querySelector('.character-generator-modal input[type="color"]');
      const start = performance.now();
      for (let i = 0; i < 24; i++) {
        input.value = i % 2 ? "#e8b890" : "#9a6a40";
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
      await new Promise((resolve) => requestAnimationFrame(resolve));
      return performance.now() - start;
    });
    expect(previewMs).toBeLessThan(1500);
    await character.locator(".modal-btns button", { hasText: "Close" }).click();

    await editorMenu(page, "Tools");
    await page.locator(".menu-drop .menu-item", { hasText: "Asset Browser" }).click();
    const assetBrowser = page.locator(".assetbrowser");
    await expect(assetBrowser).toBeVisible();
    const assetSearchMs = await page.evaluate(async () => {
      const input = document.querySelector(".assetbrowser .ab-search");
      const start = performance.now();
      for (let i = 0; i < 80; i++) {
        input.value = i % 2 ? "tiles" : "characters";
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
      await new Promise((resolve) => requestAnimationFrame(resolve));
      return performance.now() - start;
    });
    expect(assetSearchMs).toBeLessThan(500);
  });

  test("keeps large Advanced Map and HD viewport event bursts bounded", async ({ page }) => {
    await bootEditor(page, largeEditorMap);
    await page.keyboard.press("F4");
    const advanced = page.locator("canvas.adv-canvas");
    await expect(advanced).toBeVisible();

    const advancedMs = await page.evaluate(async () => {
      const canvas = document.querySelector("canvas.adv-canvas");
      const rect = canvas.getBoundingClientRect();
      const start = performance.now();
      for (let i = 0; i < 120; i++) {
        canvas.dispatchEvent(new MouseEvent("mousemove", {
          bubbles: true,
          clientX: rect.left + 10 + (i % 40) * 4,
          clientY: rect.top + 10 + (i % 30) * 4,
        }));
      }
      await new Promise((resolve) => requestAnimationFrame(resolve));
      return performance.now() - start;
    });
    expect(advancedMs).toBeLessThan(2000);

    await page.keyboard.press("F2");
    await expect(page.locator("canvas.hd-viewport-canvas")).toBeVisible({ timeout: 15_000 });
    const hdMs = await page.evaluate(async () => {
      const canvas = document.querySelector("canvas.hd-viewport-canvas");
      const rect = canvas.getBoundingClientRect();
      const start = performance.now();
      for (let i = 0; i < 60; i++) {
        canvas.dispatchEvent(new MouseEvent("mousemove", {
          bubbles: true,
          clientX: rect.left + 20 + i * 3,
          clientY: rect.top + 20 + i * 2,
        }));
      }
      await new Promise((resolve) => requestAnimationFrame(resolve));
      return performance.now() - start;
    });
    expect(hdMs).toBeLessThan(2000);
  });
});
