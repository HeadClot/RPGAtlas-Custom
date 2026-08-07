/* RPGAtlas — Android-oriented player coverage.
   Playwright's Pixel 5 profile gives the repeatable touch/viewport gate used
   in CI; a connected Android emulator remains useful for manual Chrome smoke. */

import { test, expect } from "@playwright/test";
import { gotoWithAtlasQuest } from "./fixtures/atlas-quest.mjs";

test.describe("Android touch player", () => {
  test.use({ viewport: { width: 851, height: 393 } });

  test("does not mount player controls in the editor", async ({ page }) => {
    await page.goto("/index.html");
    await expect(page.locator(".touch-controls")).toHaveCount(0);
    await expect(page.locator("#menubar")).toBeVisible();
  });

  test("shows landscape controls and starts through the A button", async ({ page }) => {
    await gotoWithAtlasQuest(page, "/play.html");

    await expect(page.locator(".touch-controls")).toBeVisible();
    await expect(page.locator(".touch-rotate-hint")).toBeHidden();
    await expect(page.locator(".touch-control")).toHaveCount(9);

    await page.locator(".touch-action-a").tap();
    await expect(page.locator(".titlewin")).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => window.Atlas?.atlas?.scene)).toBe("map");
    await expect.poll(async () => (await page.locator("#stage").screenshot()).length).toBeGreaterThan(2048);
  });

  test("uses the D-pad for movement and B for the player menu", async ({ page }) => {
    await gotoWithAtlasQuest(page, "/play.html");
    await page.locator(".touch-action-a").tap();
    await expect.poll(() => page.evaluate(() => window.Atlas?.atlas?.scene)).toBe("map");

    const before = await page.evaluate(() => ({
      x: window.Atlas.atlas.player.x,
      y: window.Atlas.atlas.player.y,
    }));
    const right = page.locator(".touch-dpad-right");
    await right.dispatchEvent("pointerdown", { pointerId: 21, pointerType: "touch", button: 0, isPrimary: true });
    await expect.poll(() => page.evaluate(() => window.Atlas.atlas.player.x)).toBeGreaterThan(before.x);
    await right.dispatchEvent("pointerup", { pointerId: 21, pointerType: "touch", button: 0, isPrimary: true });
    await expect.poll(() => page.evaluate(() => !window.Atlas.atlas.player.moving)).toBe(true);

    await page.locator(".touch-action-b").tap();
    await expect(page.locator(".mainmenu")).toBeVisible();
    await page.locator(".touch-action-b").tap();
    await expect(page.locator(".mainmenu")).toHaveCount(0);
    expect(before.y).toBeGreaterThanOrEqual(0);
  });

  test("shows portrait guidance and hides controls until landscape", async ({ page }) => {
    await gotoWithAtlasQuest(page, "/play.html");
    await page.setViewportSize({ width: 393, height: 852 });
    await expect(page.locator(".touch-rotate-hint")).toBeVisible();
    await expect(page.locator(".touch-controls")).toBeHidden();

    await page.setViewportSize({ width: 852, height: 393 });
    await expect(page.locator(".touch-rotate-hint")).toBeHidden();
    await expect(page.locator(".touch-controls")).toBeVisible();
  });

  test("tap-to-move remains available on the map canvas", async ({ page }) => {
    await gotoWithAtlasQuest(page, "/play.html");
    await page.locator(".touch-action-a").tap();
    await expect.poll(() => page.evaluate(() => window.Atlas?.atlas?.scene)).toBe("map");

    const before = await page.evaluate(() => ({
      x: window.Atlas.atlas.player.x,
      y: window.Atlas.atlas.player.y,
    }));
    const canvas = page.locator("#gamecanvas");
    const box = await canvas.boundingBox();
    await canvas.tap({ position: { x: box.width * 0.75, y: box.height * 0.5 } });
    await expect.poll(() => page.evaluate(() => ({
      x: window.Atlas.atlas.player.x,
      y: window.Atlas.atlas.player.y,
    }))).not.toEqual(before);
  });
});
