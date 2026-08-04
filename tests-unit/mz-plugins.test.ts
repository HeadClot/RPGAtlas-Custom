/* RPGAtlas — tests-unit/mz-plugins.test.ts
   Project Compass M5·A: the plugin manifest guidance table. RPG Maker JS plugins
   can't auto-convert, so the import report names each add-on and says — honestly,
   for kids — whether Atlas already does that. This spec covers name normalization
   (author-prefix stripping + CamelCase splitting), the verdict matcher over real
   community plugin names, `buildPluginReport` over a manifest, and the end-to-end
   proof that a fixture import attaches an add-ons section. GPL-3.0-or-later. */

import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildPluginReport,
  fsSource,
  guidePlugin,
  normalizePluginName,
  runRmImport,
  type FsReadFns,
} from "../src/editor/importers/mz";
import type { Project } from "../src/shared/schema";

const root = (name: string): string =>
  fileURLToPath(new URL("../tests/fixtures/" + name, import.meta.url));

function walk(dir: string, base: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(abs, base));
    else out.push(relative(base, abs).replace(/\\/g, "/"));
  }
  return out;
}

const nodeFns: FsReadFns = {
  async listFiles(r) { return walk(r, r); },
  async readText(abs) { return readFileSync(abs, "utf8"); },
  async readBytes(abs) { return new Uint8Array(readFileSync(abs)); },
  join: (r, rel) => join(r, rel),
};

const freshBase = (): Project =>
  JSON.parse(readFileSync(fileURLToPath(new URL("../Atlas_Quest.json", import.meta.url)), "utf8")) as Project;

describe("normalizePluginName — strip author prefixes + split CamelCase", () => {
  it("strips YEP_ and splits CamelCase", () => {
    expect(normalizePluginName("YEP_QuestJournal")).toBe("quest journal");
  });
  it("strips VisuStella's numeric tier", () => {
    expect(normalizePluginName("VisuMZ_2_QuestSystem")).toBe("quest system");
    expect(normalizePluginName("VisuMZ_1_MessageCore")).toBe("message core");
  });
  it("strips MOG_/Galv_/Orange prefixes", () => {
    expect(normalizePluginName("MOG_BattleHud")).toBe("battle hud");
    expect(normalizePluginName("OrangeMovementEx")).toBe("movement ex");
  });
  it("leaves a bare name alone", () => {
    expect(normalizePluginName("CommunityBasic")).toBe("community basic");
  });
});

describe("guidePlugin — verdict matcher", () => {
  it("quest journals are built in (points at the Quests panel)", () => {
    const g = guidePlugin("YEP_QuestJournal");
    expect(g.verdict).toBe("builtin");
    expect(g.pointer).toMatch(/Quests/i);
    const mz = guidePlugin("VisuMZ_2_QuestSystem");
    expect(mz.verdict).toBe("builtin");
  });
  it("message cores map to Atlas's text codes (partial)", () => {
    expect(guidePlugin("YEP_MessageCore").verdict).toBe("partial");
    expect(guidePlugin("VisuMZ_1_MessageCore").verdict).toBe("partial");
  });
  it("battle systems are partial (Atlas has its own)", () => {
    expect(guidePlugin("YEP_BattleEngineCore").verdict).toBe("partial");
    expect(guidePlugin("VisuMZ_2_BattleSystemCTB").verdict).toBe("partial");
  });
  it("pixel/diagonal movement isn't supported (none)", () => {
    expect(guidePlugin("OrangeMovementEx").verdict).toBe("none");
    expect(guidePlugin("Galv_DiagonalMovement").verdict).toBe("none");
    expect(guidePlugin("QMovement").verdict).toBe("none");
  });
  it("core/basic tweaks are partial (screen size came across)", () => {
    expect(guidePlugin("CommunityBasic").verdict).toBe("partial");
    expect(guidePlugin("VisuMZ_0_CoreEngine").verdict).toBe("partial");
  });
  it("lighting and HUDs are none, but reassure the game still plays", () => {
    expect(guidePlugin("Terrax_Lighting").verdict).toBe("none");
    expect(guidePlugin("MOG_BattleHud").verdict).toBe("none");
  });
  it("an unrecognized add-on is unknown (settings kept, won't run)", () => {
    const g = guidePlugin("SomeUniqueHomebrewThing");
    expect(g.verdict).toBe("unknown");
    expect(g.advice).toMatch(/won't run|kept its settings|missing/i);
    expect(g.pointer).toBeUndefined();
  });
  it("every advice line is kid-friendly — no code noise", () => {
    for (const name of ["YEP_QuestJournal", "OrangeMovementEx", "CommunityBasic", "Nonsense"]) {
      const g = guidePlugin(name);
      expect(g.advice).not.toMatch(/undefined|NaN|\bError\b|\.ts:|null/);
      expect(g.advice.length).toBeGreaterThan(10);
    }
  });
});

describe("buildPluginReport — a manifest → the report's add-ons section", () => {
  it("carries name, on/off, param count, and a verdict per add-on", () => {
    const out = buildPluginReport([
      { name: "YEP_QuestJournal", status: true, parameters: { "Show Tracker": "true" } },
      { name: "OrangeMovementEx", status: false, parameters: {} },
      { name: "CommunityBasic", status: true, parameters: { screenWidth: "816", screenHeight: "624" } },
    ]);
    expect(out.map((p) => p.name)).toEqual(["YEP_QuestJournal", "OrangeMovementEx", "CommunityBasic"]);
    expect(out.map((p) => p.verdict)).toEqual(["builtin", "none", "partial"]);
    expect(out.map((p) => p.on)).toEqual([true, false, true]);
    expect(out.map((p) => p.paramCount)).toEqual([1, 0, 2]);
  });
  it("empty / missing manifest → no section", () => {
    expect(buildPluginReport([])).toEqual([]);
    expect(buildPluginReport(undefined)).toEqual([]);
  });
  it("handles an unnamed / param-less entry safely", () => {
    const out = buildPluginReport([{ name: "", status: true }]);
    expect(out[0].name).toBe("(unnamed add-on)");
    expect(out[0].paramCount).toBe(0);
    expect(out[0].verdict).toBe("unknown");
  });
});

describe("runRmImport → the saved report carries the add-ons section", () => {
  it("attaches all four fixture plugins with the right verdicts", async () => {
    const outcome = await runRmImport(fsSource(root("mz-project"), nodeFns), freshBase());
    const plugins = outcome.report.plugins;
    expect(plugins).toBeTruthy();
    expect(plugins!.map((p) => p.name)).toEqual([
      "CoveText", "YEP_QuestJournal", "CommunityBasic", "OrangeMovementEx",
    ]);
    const byName = Object.fromEntries(plugins!.map((p) => [p.name, p]));
    expect(byName.CoveText.verdict).toBe("unknown"); // self-made demo → not recognized
    expect(byName.YEP_QuestJournal.verdict).toBe("builtin");
    expect(byName.CommunityBasic.verdict).toBe("partial");
    expect(byName.OrangeMovementEx.verdict).toBe("none");
    expect(byName.OrangeMovementEx.on).toBe(false); // status:false in the fixture
    // The doc survives onto the project so File ▸ Import Report can reopen it.
    expect(outcome.project.importReport!.plugins!.length).toBe(4);
  });
});
