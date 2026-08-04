/* RPGAtlas — tests-unit/renderer-plan.test.ts
   The wall-extrusion / light-occluder suite against the typed helpers in
   src/renderer/plan.ts (ported from tests/wall-extrusion.test.js at Phase 2
   Stage A; the node:test original retired with the classic js/renderer.js
   script at Phase 2 exit). GPL-3.0-or-later. */

import { describe, expect, it } from "vitest";
import { planLightOccluders, planWalls } from "../src/renderer/plan";

const map = (width: number, height: number, heights?: number[]) => ({ width, height, heights });

describe("planWalls", () => {
  it("extrudes nothing for flat, heightless, or missing maps", () => {
    expect(planWalls(map(3, 3, new Array(9).fill(0)))).toEqual([]);
    expect(planWalls(map(2, 2))).toEqual([]);
    expect(planWalls(null)).toEqual([]);
  });

  it("exposes the full south face of a lone raised tile", () => {
    const lone = planWalls(map(3, 3, [0, 0, 0, 0, 2, 0, 0, 0, 0]));
    expect(lone).toEqual([{ tx: 1, ty: 1, h: 2, faceUnits: 2 }]);
  });

  it("occludes a face behind a taller southern neighbour", () => {
    // Column at x=0: (0,0)=2 above (0,1)=3 above (0,2)=0.
    const step = planWalls(map(1, 3, [2, 3, 0]));
    expect(step.find((w) => w.ty === 0)?.faceUnits).toBe(0); // 2 - 3 < 0, clamped
    expect(step.find((w) => w.ty === 1)?.faceUnits).toBe(3); // 3 - 0
  });

  it("exposes the full height at the south map edge", () => {
    expect(planWalls(map(1, 2, [0, 4]))).toEqual([{ tx: 0, ty: 1, h: 4, faceUnits: 4 }]);
  });

  it("shows no face between equal-height neighbours, only the leading edge", () => {
    const plateau = planWalls(map(1, 3, [1, 1, 0]));
    expect(plateau.find((w) => w.ty === 0)?.faceUnits).toBe(0); // 1 - 1
    expect(plateau.find((w) => w.ty === 1)?.faceUnits).toBe(1); // 1 - 0
  });
});

describe("planLightOccluders", () => {
  const shadowMap = map(4, 3, [0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0]);

  it("includes blocked and elevated tiles, excluding the light's own tile", () => {
    const blocked = new Set(["1,1"]);
    const occluders = planLightOccluders(
      shadowMap,
      { rx: 0, ry: 1, radius: 180 },
      (x, y) => !blocked.has(x + "," + y),
    );
    expect(occluders.some((o) => o.tx === 1 && o.ty === 1 && o.tileHeight === 0)).toBe(true);
    expect(occluders.some((o) => o.tx === 2 && o.ty === 1 && o.tileHeight === 2)).toBe(true);
    expect(occluders.some((o) => o.tx === 0 && o.ty === 1)).toBe(false);
  });

  it("returns nothing without a light", () => {
    expect(planLightOccluders(shadowMap, null, () => true)).toEqual([]);
  });
});
