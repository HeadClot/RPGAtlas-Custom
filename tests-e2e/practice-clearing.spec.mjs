import { test, expect } from "@playwright/test";
import { gotoWithPracticeClearing } from "./fixtures/practice-clearing.mjs";

test("Practice Clearing is a playable authored field-combat slice", async ({ page }) => {
  await gotoWithPracticeClearing(page);
  await expect(page.locator("body")).toBeVisible();
  const project = await page.evaluate(() => JSON.parse(localStorage.getItem("rpgatlas_project") || "{}"));
  expect(project.maps.find((map) => map.id === 1)?.name).toBe("Practice Clearing");
  expect(project.maps.find((map) => map.id === 2)?.worldOrigin).toEqual({ x: 8, y: 0 });
  expect(project.maps[0].events.filter((event) => event.pages?.[0]?.combat?.enabled)).toHaveLength(2);
});
