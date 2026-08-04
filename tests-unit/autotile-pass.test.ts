/* RPGAtlas — tests-unit/autotile-pass.test.ts
   Regression for the "terrain painted with the Terrain & Autotile Studio isn't
   walkable" bug: an autotile group's `pass` flag must actually drive gameplay
   passability. Autotile reserved ids sit above the Assets.tiles array, so the
   plain `Assets.tiles[id].pass` lookup always misses for a terrain brush — the
   engine + editor resolve it through autotilePassable() from proj.autotiles.
   GPL-3.0-or-later. */

import { describe, expect, it } from "vitest";
import {
  autotilePassable, tileIdOf, AUTOTILE_BASE,
} from "../src/shared/autotile-registry";
import { withFlags } from "../src/shared/tile-flags";

const GROUPS = [
  { id: 1, name: "Grass", pass: true },
  { id: 2, name: "Wall", pass: false },
  { id: 3, name: "Path" }, // pass omitted → default walkable
];

describe("autotilePassable", () => {
  it("returns a group's explicit pass flag", () => {
    expect(autotilePassable(GROUPS, tileIdOf(1))).toBe(true);
    expect(autotilePassable(GROUPS, tileIdOf(2))).toBe(false);
  });

  it("defaults an absent pass to walkable (terrain floors walk by default)", () => {
    // This is the Studio/quick-import contract: a group created walkable — or
    // with pass left unset — must be walkable in game.
    expect(autotilePassable(GROUPS, tileIdOf(3))).toBe(true);
  });

  it("treats an unknown / dangling terrain id as blocked", () => {
    // Matches how a missing plain-tile def resolves (undefined → blocked).
    expect(autotilePassable(GROUPS, tileIdOf(99))).toBe(false);
    expect(autotilePassable(undefined, tileIdOf(1))).toBe(false);
    expect(autotilePassable([], AUTOTILE_BASE + 1)).toBe(false);
  });

  it("resolves through transform-flag bits riding on the id", () => {
    // A flipped/rotated terrain cell keeps its group's passability.
    const flagged = withFlags(tileIdOf(2), { h: true, v: false, r: true });
    expect(autotilePassable(GROUPS, flagged)).toBe(false);
    const flaggedWalk = withFlags(tileIdOf(1), { h: false, v: true, r: false });
    expect(autotilePassable(GROUPS, flaggedWalk)).toBe(true);
  });
});
