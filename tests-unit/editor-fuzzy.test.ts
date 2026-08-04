/* RPGAtlas — tests-unit/editor-fuzzy.test.ts
   The command-palette scorer (src/editor/fuzzy.ts, Phase 3 Stage A).
   GPL-3.0-or-later. */

import { describe, expect, it } from "vitest";
import { fuzzyScore } from "../src/editor/fuzzy";

const score = (q: string, t: string) => {
  const s = fuzzyScore(q, t);
  expect(s, `"${q}" should match "${t}"`).not.toBeNull();
  return s as number;
};

describe("fuzzyScore", () => {
  it("empty query matches everything neutrally", () => {
    expect(fuzzyScore("", "File ▸ Save Project")).toBe(0);
  });

  it("is case-insensitive and rejects non-subsequences", () => {
    expect(fuzzyScore("SAVE", "File ▸ Save Project")).not.toBeNull();
    expect(fuzzyScore("xyz", "File ▸ Save Project")).toBeNull();
    expect(fuzzyScore("savee", "File ▸ Save")).toBeNull(); // exhausted text
  });

  it("ranks exact substring above subsequence", () => {
    expect(score("save", "File ▸ Save Project")).toBeGreaterThan(score("save", "Set Audio Volume…"));
  });

  it("ranks a word-start substring above a mid-word one", () => {
    expect(score("pro", "Export Project")).toBeGreaterThan(score("pro", "Reproduce"));
  });

  it("ranks earlier substrings above later ones at equal word-startness", () => {
    expect(score("map", "Map (Tile) Mode")).toBeGreaterThan(score("map", "Fit Map In View"));
  });

  it("ranks word-start subsequences (initials) above scattered ones", () => {
    // "ssp" as initials of Set Start Position vs. scattered inside a long label
    expect(score("ssp", "Set Start Position…")).toBeGreaterThan(score("ssp", "Es s p"));
  });

  it("ignores spaces in the query so category-plus-label hints work", () => {
    expect(fuzzyScore("file save", "File ▸ Save Project")).not.toBeNull();
  });
});
