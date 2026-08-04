/* RPGAtlas — tests-e2e/export.spec.mjs
   Standalone-export smoke test (Phase 1 Stage A safety net).

   The standalone HTML export is the highest-severity thing this refactor can
   break — a regression means users can no longer ship their games. Before
   Stage A the export fetched js/engine.js and inlined it; Stage A replaces that
   with the single-file player bundle (esbuild IIFE of src/engine/main.ts,
   emitted to dist/player-bundle.js). This spec drives the REAL export code path
   (js/editor/project-io.js#buildStandaloneGame) inside the built editor page,
   then loads the produced HTML in a fresh page and asserts the exported game
   boots to a working title screen.

   History: Stage A's audit found the export had been broken since before
   Phase 0 — STANDALONE_EXPORT_FILES omitted js/quests.js, js/journal-view.js
   and js/runtime/input.js, which the engine unconditionally requires at boot
   (window.RPGAtlasQuests.create / window.RPGAtlasJournalView.create /
   createInputSystem), so every exported game crashed with "Cannot read
   properties of undefined (reading 'create')" before showing any UI. Fixed
   2026-07-01 by adding the three files to the manifest; this test asserts the
   working boot and guards the composition from regressing again.

   GPL-3.0-or-later. */

import { test, expect } from "@playwright/test";
import { atlasQuestJson } from "./fixtures/atlas-quest.mjs";

async function buildExportHtml(page) {
  // Seed the sample project, then drive buildStandaloneGame in page context —
  // the same code the editor's "Export → Standalone HTML" menu item calls.
  await page.goto("/index.html");
  await page.evaluate((json) => localStorage.setItem("rpgatlas_project", json), atlasQuestJson());
  await page.goto("/index.html");
  await expect(page.locator("#menubar")).toBeVisible();

  return page.evaluate(async () => {
    const io = await import("/js/editor/project-io.js");
    const Assets = window.RPGAtlasDeps.Assets;
    const proj = JSON.parse(localStorage.getItem("rpgatlas_project"));
    const game = await io.buildStandaloneGame(proj, Assets);
    return game.html;
  });
}

test.describe("standalone export", () => {
  test("buildStandaloneGame inlines the player bundle and the classic deps", async ({ page }) => {
    const html = await buildExportHtml(page);

    // Non-trivial single-file document (project + assets + runtime inlined).
    expect(html.length).toBeGreaterThan(100_000);
    // Player bundle is inlined as a module (replacing the old inline engine.js);
    // its presence is proven by the engine's own boot-time global reads. (Since
    // the Stage B game-state extraction the quests global is read through the
    // src/shared/deps.ts seam, so the marker is the create call itself rather
    // than the old direct `window.` access.)
    expect(html).toMatch(/<script type="module">/);
    expect(html).toContain("RPGAtlasQuests.create");
    // Classic deps still inlined ahead of it, populating window globals —
    // including the engine's hard boot dependencies (quest runtime, journal
    // view, input system) whose omission used to crash every exported game.
    expect(html).toContain("window.createMessageSystem = createMessageSystem;");
    expect(html).toContain("window.RPGAtlasQuests = {");
    expect(html).toContain("window.RPGAtlasJournalView = {");
    expect(html).toContain("window.createInputSystem = createInputSystem;");
    expect(html).toContain("window.RPGAtlasDeps = {");
    // The project JSON and title screen title are embedded.
    expect(html).toContain('id="rpgatlas-project"');
    expect(html).toContain("Atlas Quest");
  });

  test("exported game boots to the title screen with no errors", async ({ page, context }) => {
    const html = await buildExportHtml(page);

    const game = await context.newPage();
    const errors = [];
    game.on("pageerror", (err) => errors.push(String(err)));
    game.on("console", (msg) => {
      if (msg.type() !== "error") return;
      // Exported games are single-file: any relative fetch (asset discovery
      // probes) 404s harmlessly, same noise-filter as the player boot spec.
      if (/Failed to load resource.*404/.test(msg.text())) return;
      errors.push(msg.text());
    });

    // setContent runs the inlined scripts in order, exactly as opening the
    // exported .html file would.
    await game.setContent(html, { waitUntil: "load" });

    // Same title-screen assertions as the play.html boot spec: showTitle()
    // renders `.titlewin` with the project title and a `.titlemenu`.
    await expect(game.locator(".titlewin .title-name")).toHaveText("Atlas Quest");
    await expect(game.locator(".titlemenu")).toBeVisible();
    await expect(game.getByText("New Game", { exact: true })).toBeVisible();

    expect(errors, `console/page errors:\n${errors.join("\n")}`).toEqual([]);

    await game.close();
  });
});
