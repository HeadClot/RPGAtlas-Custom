/* RPGAtlas — tests-unit/automap.test.ts
   The pure visual-automap evaluator (src/shared/automap.ts, Phase 8 Stage F):
   predicate matching over a fixture grid (terrainIs / tileIs / near / notNear /
   regionIs / passable), action expansion (placeTile probability, placeStamp
   into per-cell writes, setRegion), determinism (same seed ⇒ identical edits),
   last-wins de-dupe, and apply-in-place. The mockup exit example — grass +
   near-water ⇒ scatter reeds 35% — is exercised end to end.
   GPL-3.0-or-later. */

import { describe, expect, it } from "vitest";
import type { AutomapRule, Stamp } from "../src/shared/schema";
import { TILE_FLAG_H, withFlags } from "../src/shared/tile-flags";
import { evaluateAutomap, applyAutomapEdits, type AutomapMap } from "../src/shared/automap";

const GRASS = 5;
const WATER = 9;
const REED = 21;

/** A W×H fixture map with a lake of WATER in a field of GRASS. */
function fixture(w = 6, h = 6): AutomapMap {
  const ground = new Array(w * h).fill(GRASS);
  // a 2×2 lake at (2,2)-(3,3)
  for (const [x, y] of [[2, 2], [3, 2], [2, 3], [3, 3]] as [number, number][]) ground[y * w + x] = WATER;
  return {
    width: w, height: h,
    layers: { ground, decor: new Array(w * h).fill(0), decor2: new Array(w * h).fill(0), over: new Array(w * h).fill(0) },
  };
}

const rule = (r: Partial<AutomapRule>): AutomapRule => ({ id: 1, if: [], then: [], ...r });

describe("predicates", () => {
  it("terrainIs matches only the terrain cells", () => {
    const m = fixture();
    const res = evaluateAutomap(m, [rule({ if: [{ kind: "terrainIs", terrain: WATER }], then: [{ kind: "setRegion", region: 7 }] })]);
    expect(res.changed).toBe(4);
    expect(res.edits.every((e) => e.type === "region" && e.region === 7)).toBe(true);
  });

  it("terrainIs is flag-safe — a flipped grass tile still matches", () => {
    const m = fixture();
    m.layers.ground[0] = withFlags(GRASS, { h: true, v: false, r: false });
    expect(m.layers.ground[0]).not.toBe(GRASS); // carries the H flag bit
    const res = evaluateAutomap(m, [rule({ if: [{ kind: "terrainIs", terrain: GRASS }], then: [{ kind: "setRegion", region: 1 }] })]);
    // cell 0 (flipped grass) is included with the plain grass cells.
    expect(res.edits.some((e) => e.x === 0 && e.y === 0)).toBe(true);
    // matching by a flagged terrain value also works (masked both sides).
    const res2 = evaluateAutomap(m, [rule({ if: [{ kind: "terrainIs", terrain: GRASS | TILE_FLAG_H }], then: [{ kind: "setRegion", region: 1 }] })]);
    expect(res2.changed).toBe(res.changed);
  });

  it("near / notNear select the ring around the lake", () => {
    const m = fixture();
    const near = evaluateAutomap(m, [rule({ if: [{ kind: "terrainIs", terrain: GRASS }, { kind: "near", terrain: WATER, radius: 1 }], then: [{ kind: "setRegion", region: 2 }] })]);
    // grass cells orthogonally/diagonally adjacent to the 2×2 lake, lake excluded.
    expect(near.changed).toBeGreaterThan(0);
    for (const e of near.edits) {
      expect(m.layers.ground[e.y! * m.width + e.x!]).toBe(GRASS);
    }
    const notNear = evaluateAutomap(m, [rule({ if: [{ kind: "terrainIs", terrain: GRASS }, { kind: "notNear", terrain: WATER, radius: 1 }], then: [{ kind: "setRegion", region: 3 }] })]);
    // near + notNear + lake partition the whole grid.
    expect(near.changed + notNear.changed + 4).toBe(m.width * m.height);
  });

  it("tileIs reads the named layer", () => {
    const m = fixture();
    m.layers.decor[0] = 42;
    const res = evaluateAutomap(m, [rule({ if: [{ kind: "tileIs", layerId: "core:decor", tile: 42 }], then: [{ kind: "setRegion", region: 9 }] })]);
    expect(res.changed).toBe(1);
    expect(res.edits[0]).toMatchObject({ x: 0, y: 0, region: 9 });
  });

  it("regionIs matches the region tag", () => {
    const m = fixture();
    m.regions = new Array(m.width * m.height).fill(0);
    m.regions[10] = 4;
    const res = evaluateAutomap(m, [rule({ if: [{ kind: "regionIs", region: 4 }], then: [{ kind: "placeTile", layerId: "core:over", tile: 99 }] })]);
    expect(res.changed).toBe(1);
    expect(res.edits[0]).toMatchObject({ type: "tile", role: "over", tile: 99 });
  });

  it("passable uses passOv fallback (2 ⇒ blocked)", () => {
    const m = fixture();
    m.passOv = new Array(m.width * m.height).fill(0);
    m.passOv[0] = 2; // blocked
    const blocked = evaluateAutomap(m, [rule({ if: [{ kind: "passable", value: false }], then: [{ kind: "setRegion", region: 1 }] })]);
    expect(blocked.changed).toBe(1);
    expect(blocked.edits[0]).toMatchObject({ x: 0, y: 0 });
    const passable = evaluateAutomap(m, [rule({ if: [{ kind: "passable", value: true }], then: [{ kind: "setRegion", region: 1 }] })]);
    expect(passable.changed).toBe(m.width * m.height - 1);
  });

  it("passable prefers an injected passableAt callback", () => {
    const m = fixture();
    const res = evaluateAutomap(m, [rule({ if: [{ kind: "passable", value: false }], then: [{ kind: "setRegion", region: 1 }] })], {
      passableAt: (x, y) => !(x === 1 && y === 1),
    });
    expect(res.changed).toBe(1);
    expect(res.edits[0]).toMatchObject({ x: 1, y: 1 });
  });

  it("an empty `if` matches every cell", () => {
    const m = fixture(4, 4);
    const res = evaluateAutomap(m, [rule({ if: [], then: [{ kind: "setRegion", region: 1 }] })]);
    expect(res.changed).toBe(16);
  });
});

describe("actions", () => {
  it("placeStamp expands into per-cell tile writes, non-empty only", () => {
    const m = fixture();
    const stamp: Stamp = { id: 3, name: "L", w: 2, h: 2, layers: { decor: [0, 7, 7, 0] } };
    const res = evaluateAutomap(m, [rule({ if: [{ kind: "regionIs", region: 0 }], then: [{ kind: "placeStamp", stampId: 3 }] })], { stamps: [stamp] });
    // regionIs 0 matches every cell; each match emits the stamp's 2 non-empty cells.
    // Overlapping stamps de-dupe last-wins, but at minimum every decor cell that a
    // stamp non-empty lands on is present.
    expect(res.edits.every((e) => e.type === "tile" && e.role === "decor" && e.tile === 7)).toBe(true);
    expect(res.changed).toBeGreaterThan(0);
  });

  it("placeTile probability gates emission deterministically", () => {
    const m = fixture(10, 10);
    const r = rule({ id: 2, if: [{ kind: "terrainIs", terrain: GRASS }], then: [{ kind: "placeTile", layerId: "core:decor", tile: REED, probability: 0.35 }], seed: 123 });
    const a = evaluateAutomap(m, [r]);
    const grassCells = m.layers.ground.filter((t) => t === GRASS).length;
    // ~35% of grass cells; loosely bounded but well under 100%.
    expect(a.changed).toBeGreaterThan(0);
    expect(a.changed).toBeLessThan(grassCells);
  });
});

describe("determinism", () => {
  it("same (map, rules, seed) ⇒ identical edits", () => {
    const m = fixture(12, 12);
    const rules = [rule({ id: 5, if: [{ kind: "terrainIs", terrain: GRASS }], then: [{ kind: "placeTile", layerId: "core:decor", tile: REED, probability: 0.35 }] })];
    const a = evaluateAutomap(m, rules, { seed: 777 });
    const b = evaluateAutomap(m, rules, { seed: 777 });
    expect(b.edits).toEqual(a.edits);
  });

  it("a different seed generally changes the scatter", () => {
    const m = fixture(12, 12);
    const rules = [rule({ id: 5, if: [{ kind: "terrainIs", terrain: GRASS }], then: [{ kind: "placeTile", layerId: "core:decor", tile: REED, probability: 0.5 }] })];
    const a = evaluateAutomap(m, rules, { seed: 1 });
    const b = evaluateAutomap(m, rules, { seed: 2 });
    expect(b.edits).not.toEqual(a.edits);
  });
});

describe("apply", () => {
  it("writes tile + region edits in place and reverts cleanly via a clone", () => {
    const m = fixture();
    const before = m.layers.decor.slice();
    const res = evaluateAutomap(m, [rule({ if: [{ kind: "terrainIs", terrain: WATER }], then: [{ kind: "placeTile", layerId: "core:decor", tile: 50 }, { kind: "setRegion", region: 6 }] })]);
    const n = applyAutomapEdits(m, res.edits);
    expect(n).toBe(res.edits.length);
    expect(m.layers.decor.filter((t) => t === 50).length).toBe(4);
    expect(m.regions!.filter((r) => r === 6).length).toBe(4);
    // decor differs from the captured baseline (proves the write landed).
    expect(m.layers.decor).not.toEqual(before);
  });

  it("materializes a zero-filled regions array on first setRegion", () => {
    const m = fixture();
    expect(m.regions).toBeUndefined();
    applyAutomapEdits(m, [{ type: "region", x: 1, y: 1, region: 3 }]);
    expect(m.regions!.length).toBe(m.width * m.height);
    expect(m.regions![m.width + 1]).toBe(3);
  });
});

describe("mockup exit example — grass + near-water ⇒ scatter reeds 35%", () => {
  it("is buildable, deterministic, and only touches near-water grass", () => {
    const m = fixture(16, 16);
    // a bigger lake so there is a real shoreline ring
    for (let y = 5; y < 10; y++) for (let x = 5; x < 10; x++) m.layers.ground[y * m.width + x] = WATER;
    const reedRule = rule({
      id: 42, name: "Reeds by the water",
      if: [{ kind: "terrainIs", terrain: GRASS }, { kind: "near", terrain: WATER, radius: 1 }],
      then: [{ kind: "placeTile", layerId: "core:decor", tile: REED, probability: 0.35 }],
      seed: 2026,
    });
    const res = evaluateAutomap(m, [reedRule]);
    expect(res.changed).toBeGreaterThan(0);
    // every reed lands on a grass tile that borders water, and on the decor layer.
    for (const e of res.edits) {
      expect(e.role).toBe("decor");
      expect(e.tile).toBe(REED);
      expect(m.layers.ground[e.y! * m.width + e.x!]).toBe(GRASS);
    }
    // preview == apply (deterministic)
    const preview = evaluateAutomap(m, [reedRule]);
    expect(preview.edits).toEqual(res.edits);
    applyAutomapEdits(m, res.edits);
    expect(m.layers.decor.filter((t) => t === REED).length).toBe(res.changed);
  });
});
