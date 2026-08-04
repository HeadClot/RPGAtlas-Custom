import { describe, expect, it } from "vitest";
import {
  deriveConnections,
  resolveBoundaryCrossing,
  validateLayout,
  localToWorld,
  worldToLocal,
} from "../src/shared/map-connections";

type ConnMap = { id: number; width: number; height: number; worldOrigin?: { x: number; y: number }; loop?: { h?: boolean; v?: boolean } };
const map = (id: number, x: number, y: number, width = 4, height = 3, extra: Partial<ConnMap> = {}): ConnMap => ({
  id, width, height, worldOrigin: { x, y }, loop: undefined, ...extra,
});

describe("map connection geometry", () => {
  it("derives an east/west connection with the shared offset", () => {
    const cs = deriveConnections([map(1, 0, 2), map(2, 4, 0, 5, 6)]);
    expect(cs).toEqual([{ aMapId: 1, bMapId: 2, aSide: "east", bSide: "west", aStart: 0, bStart: 2, length: 3 }]);
  });

  it("derives north/south connections and ignores corner contact", () => {
    expect(deriveConnections([map(1, 0, 0), map(2, 0, 3)])).toHaveLength(1);
    expect(deriveConnections([map(1, 0, 0), map(2, 4, 3)])).toEqual([]);
  });

  it("resolves a crossing into target-local coordinates", () => {
    const maps = [map(1, 0, 0), map(2, 4, 1, 4, 3)];
    expect(resolveBoundaryCrossing(maps, 1, 3, 1, 1, 0)).toMatchObject({
      fromMapId: 1, toMapId: 2, toX: 0, toY: 0, fromSide: "east", toSide: "west",
    });
    expect(resolveBoundaryCrossing(maps, 1, 3, 0, 1, 0)).toBeNull();
  });

  it("rejects overlaps and looped connection edges", () => {
    expect(deriveConnections([map(1, 0, 0), map(2, 2, 0)])).toEqual([]);
    expect(deriveConnections([map(1, 0, 0, 4, 3, { loop: { h: true } }), map(2, 4, 0)])).toEqual([]);
    expect(validateLayout([map(1, 0, 0), map(2, 2, 0)]) .issues[0].kind).toBe("overlap");
    expect(validateLayout([map(1, 0, 0), map(2, 5, 0)]) .issues[0].kind).toBe("gap");
  });

  it("keeps missing origins isolated and reports malformed origins", () => {
    const result = validateLayout([{ id: 1, width: 4, height: 3 }, { ...map(2, 0, 0), worldOrigin: { x: 1.5, y: 0 } }]);
    expect(result.unplaced).toEqual([1]);
    expect(result.issues[0].kind).toBe("invalid-origin");
    expect(deriveConnections([{ id: 1, width: 4, height: 3 }, map(2, 4, 0)])).toEqual([]);
  });

  it("round-trips world and local coordinates", () => {
    const m = map(7, -3, 8);
    expect(localToWorld(m, 2, 1)).toEqual({ x: -1, y: 9 });
    expect(worldToLocal(m, -1, 9)).toEqual({ x: 2, y: 1 });
    expect(worldToLocal(m, 99, 99)).toBeNull();
  });
});
