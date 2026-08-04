/* RPGAtlas — tests-e2e/automapF.spec.mjs
   Phase 8 Stage F: build an automap rule in the Advanced editor's Automap
   drawer, Preview it, Apply it, and prove it commits as ONE undoable step
   through the editor's own persistence (localStorage — the same JSON a saved
   project carries). Exercises the promote-on-first-edit path (a map with no
   automapRules gains the array), the Preview overlay, the Apply→pushUndo seam,
   and Ctrl+Z reverting the whole batch. Authored here; the integrator runs it
   with the full suite at merge.
   GPL-3.0-or-later. */

import { test, expect } from "@playwright/test";

const STORE = "rpgatlas_project";

test.describe("Advanced editor — automap rules", () => {
  test("build a rule, preview, apply, and undo as one step", async ({ page }) => {
    await page.goto("/index.html");

    const saveIndicator = page.locator("#save-ind");
    await expect(saveIndicator).toBeVisible();
    await expect(saveIndicator).toHaveText(/^✓ /);

    // Open the Advanced Map Editor (F4) and wait for its canvas.
    await page.keyboard.press("F4");
    await expect(page.locator("canvas.adv-canvas")).toBeVisible();

    // The currently-shown map (the Map Tree highlights it) — Apply targets it.
    const selText = await page.locator(".adv-tree-row.sel").first().innerText();
    const mapId = Number(selText.split(":")[0].trim());
    expect(Number.isFinite(mapId)).toBe(true);

    // Expand the Automap drawer.
    await page.locator(".adv-am-toggle").click();
    await expect(page.locator(".adv-automap.open")).toBeVisible();

    // Add a rule — it starts as IF terrain-is / THEN place-tile at 100%.
    await page.locator(".adv-am-addrule").click();
    await expect(page.locator(".adv-am-rule")).toHaveCount(1);

    // Make the condition "passable = true" so it matches (almost) every cell of
    // any sample map, independent of its tile content. The default THEN action
    // (place tile #1 on decor at 100%) then paints those cells.
    await page.locator(".adv-am-row .adv-am-kind").first().selectOption("passable");

    // Preview: the drawer shows the pending diff count.
    await page.locator('.adv-automap-head button:has-text("Preview")').click();
    await expect(page.locator(".adv-am-preview-note")).toBeVisible();

    // Baseline decor count for the target map (after the rule autosaved).
    const baseline = await page.waitForFunction(({ store, id }) => {
      const raw = localStorage.getItem(store);
      if (!raw) return null;
      const proj = JSON.parse(raw);
      const m = proj.maps.find((mm) => mm.id === id);
      if (!m || !Array.isArray(m.automapRules) || !m.automapRules.length) return null;
      return true;
    }, { store: STORE, id: mapId }).then(() => page.evaluate(({ store, id }) => {
      const proj = JSON.parse(localStorage.getItem(store));
      const m = proj.maps.find((mm) => mm.id === id);
      const arr = (m.layers && m.layers.decor) || [];
      let n = 0; for (const v of arr) if ((v & 0x0fffffff) === 1) n++;
      return n;
    }, { store: STORE, id: mapId }));

    // Apply — writes the tiles and takes one undo snapshot.
    await page.locator(".adv-am-applybtn").click();

    // The target map's decor now has strictly more #1 cells than the baseline.
    const applied = await page.waitForFunction(({ store, id, base }) => {
      const raw = localStorage.getItem(store);
      if (!raw) return null;
      const proj = JSON.parse(raw);
      const m = proj.maps.find((mm) => mm.id === id);
      if (!m) return null;
      const arr = (m.layers && m.layers.decor) || [];
      let n = 0; for (const v of arr) if ((v & 0x0fffffff) === 1) n++;
      return n > base ? n : null;
    }, { store: STORE, id: mapId, base: baseline }).then((h) => h.jsonValue());
    expect(applied).toBeGreaterThan(baseline);

    // Undo (Ctrl+Z) reverts the whole batch back to the baseline count.
    await page.keyboard.press("Control+z");
    const reverted = await page.waitForFunction(({ store, id, base }) => {
      const raw = localStorage.getItem(store);
      if (!raw) return null;
      const proj = JSON.parse(raw);
      const m = proj.maps.find((mm) => mm.id === id);
      if (!m) return null;
      const arr = (m.layers && m.layers.decor) || [];
      let n = 0; for (const v of arr) if ((v & 0x0fffffff) === 1) n++;
      return n === base ? true : null;
    }, { store: STORE, id: mapId, base: baseline }).then((h) => h.jsonValue());
    expect(reverted).toBe(true);

    // The rule itself survives the undo (rules are config, not on the paint stack).
    const rulesKept = await page.evaluate(({ store, id }) => {
      const proj = JSON.parse(localStorage.getItem(store));
      const m = proj.maps.find((mm) => mm.id === id);
      return Array.isArray(m.automapRules) && m.automapRules.length === 1;
    }, { store: STORE, id: mapId });
    expect(rulesKept).toBe(true);
  });
});
