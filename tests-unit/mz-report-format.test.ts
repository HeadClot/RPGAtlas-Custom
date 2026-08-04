/* RPGAtlas — tests-unit/mz-report-format.test.ts
   Project Compass M6·A: the pure report-format helpers that back the wizard's
   text export and re-import banner. `reportDocToText` must read like the
   on-screen report (good news first, honest caveats, add-ons, next steps) and
   stay kid-safe — no stack traces (locked decision 6); `reimportDelta` must only
   celebrate when a fresh import genuinely picked up more than last time.
   GPL-3.0-or-later (see LICENSE). */

import { describe, expect, it } from "vitest";
import { reportDocToText, reimportDelta } from "../src/editor/importers/mz/report-format";
import type { ImportReportDoc } from "../src/shared/schema";

const emptySummary = {
  maps: 0, actors: 0, skills: 0, items: 0, weapons: 0, armors: 0,
  enemies: 0, troops: 0, commonEvents: 0, switches: 0, variables: 0,
};

function doc(over: Partial<ImportReportDoc> = {}): ImportReportDoc {
  return {
    source: "mz",
    when: Date.UTC(2026, 6, 5),
    gameTitle: "Cove Test",
    summary: { ...emptySummary, maps: 2, actors: 2, enemies: 2 },
    lines: [],
    ...over,
  };
}

describe("reportDocToText", () => {
  it("leads with the game name, format, and the good-news counts", () => {
    const txt = reportDocToText(doc());
    expect(txt).toContain("Your RPG Maker MZ game is in RPGAtlas!");
    expect(txt).toContain("Cove Test");
    expect(txt).toContain("• 2 maps");
    expect(txt).toContain("• 2 heroes");
    expect(txt).toContain("• 2 enemies");
    // Zero-count rows are omitted, not printed as "0 skills".
    expect(txt).not.toMatch(/• 0 /);
  });

  it("names MV vs MZ from the source", () => {
    expect(reportDocToText(doc({ source: "mv" }))).toContain("RPG Maker MV");
  });

  it("says everything came cleanly when there are no caveat lines", () => {
    expect(reportDocToText(doc())).toContain("Everything came across cleanly");
  });

  it("groups honest caveats under the same headings as the on-screen report", () => {
    const txt = reportDocToText(doc({
      lines: [
        { area: "skills", kind: "partial", what: "the Fireball skill", detail: "power estimated" },
        { area: "commands", kind: "todo", what: "damage formulas", count: 7 },
        { area: "items", kind: "skipped", what: "the Rusty Key key-item" },
        { area: "system", kind: "converted", what: "front-view battles" },
      ],
    }));
    expect(txt).toContain("A few things need a note");
    expect(txt).toContain("Came in a little differently:");
    expect(txt).toContain("the Fireball skill — power estimated");
    expect(txt).toContain("Saved for a later update:");
    expect(txt).toContain("damage formulas (seen 7 times)");
    expect(txt).toContain("Left out on purpose:");
    expect(txt).toContain("the Rusty Key key-item");
    expect(txt).toContain("Notes:");
  });

  it("renders the add-ons section with a verdict word per plugin", () => {
    const txt = reportDocToText(doc({
      plugins: [
        { name: "YEP_QuestJournal", on: true, paramCount: 3, verdict: "builtin", advice: "Quest journal.", pointer: "the Quests panel" },
        { name: "OrangeMovementEx", on: false, paramCount: 0, verdict: "none", advice: "Pixel movement." },
      ],
    }));
    expect(txt).toContain("Add-ons (plugins) — 2 found:");
    expect(txt).toContain("YEP_QuestJournal — Atlas already does this");
    expect(txt).toContain("kept its 3 settings");
    expect(txt).toContain("Look in the Quests panel.");
    expect(txt).toContain("OrangeMovementEx — Atlas doesn't do this");
    expect(txt).toContain("was turned off");
  });

  it("ends with next steps and a dated provenance line, and stays kid-safe", () => {
    const txt = reportDocToText(doc({
      lines: [{ area: "commands", kind: "todo", what: "a script", detail: "reads $gameMap" }],
    }));
    expect(txt).toContain("What next?");
    expect(txt).toContain("Playtest (F5)");
    expect(txt).toContain("2026-07-05");
    // No stack-trace / code noise anywhere in the text (locked decision 6).
    expect(txt).not.toMatch(/undefined|NaN|\bError\b|\.ts:/);
  });
});

describe("reimportDelta", () => {
  const prev = (todos: number): ImportReportDoc =>
    doc({ lines: Array.from({ length: todos }, (_, i) => ({ area: "x", kind: "todo" as const, what: "todo " + i })) });

  it("is neutral with no previous report", () => {
    const d = reimportDelta(undefined, prev(3));
    expect(d.improved).toBe(false);
    expect(d.headline).toBeNull();
    expect(d.prevTodo).toBe(0);
  });

  it("celebrates when the fresh import has fewer todos", () => {
    const d = reimportDelta(prev(5), prev(2));
    expect(d.improved).toBe(true);
    expect(d.resolved).toBe(3);
    expect(d.headline).toMatch(/3 things/);
    expect(d.headline).toMatch(/come across/);
  });

  it("uses singular copy when exactly one thing resolved", () => {
    const d = reimportDelta(prev(2), prev(1));
    expect(d.resolved).toBe(1);
    expect(d.headline).toMatch(/1 thing that was/);
  });

  it("weights aggregated todo counts, not just line count", () => {
    const before = doc({ lines: [{ area: "c", kind: "todo", what: "formulas", count: 7 }] });
    const after = doc({ lines: [{ area: "c", kind: "todo", what: "formulas", count: 2 }] });
    const d = reimportDelta(before, after);
    expect(d.prevTodo).toBe(7);
    expect(d.nowTodo).toBe(2);
    expect(d.resolved).toBe(5);
    expect(d.improved).toBe(true);
  });

  it("says nothing-new when the todo count is unchanged", () => {
    const d = reimportDelta(prev(3), prev(3));
    expect(d.improved).toBe(false);
    expect(d.headline).toMatch(/hasn't learned anything new/);
  });
});
