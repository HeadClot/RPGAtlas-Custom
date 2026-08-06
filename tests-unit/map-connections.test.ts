import { describe, expect, it } from "vitest";
import {
  connectionSegment,
  clampCameraAxis,
  connectedCameraBounds,
  deriveConnections,
  resolveContinuousBoundaryCrossing,
  resolveBoundaryCrossing,
  validateLayout,
  localToWorld,
  worldToLocal,
} from "../src/shared/map/map-connections";

type ConnMap = { id: number; width: number; height: number; worldOrigin?: { x: number; y: number }; loop?: { h?: boolean; v?: boolean } };
const map = (id: number, x: number, y: number, width = 4, height = 3, extra: Partial<ConnMap> = {}): ConnMap => ({
  id, width, height, worldOrigin: { x, y }, loop: undefined, ...extra,
});

describe("map connection geometry", () => {
  it("returns a full shared seam segment instead of a point", () => {
    const eastMaps = [map(1, 0, 2), map(2, 4, 0, 5, 6)];
    const east = deriveConnections(eastMaps)[0];
    expect(connectionSegment(east, eastMaps[0])).toEqual({ x1: 4, y1: 2, x2: 4, y2: 5 });

    const southMaps = [map(1, 0, 0), map(2, 0, 3)];
    const south = deriveConnections(southMaps)[0];
    expect(connectionSegment(south, southMaps[0])).toEqual({ x1: 0, y1: 3, x2: 4, y2: 3 });
  });

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

  it("resolves fractional bodies across every cardinal seam", () => {
    const east = resolveContinuousBoundaryCrossing([map(1, 0, 0), map(2, 4, 0)], 1, 4.1, 1.2, 0.7, 0.9);
    expect(east).toMatchObject({ fromSide: "east", toMapId: 2, toY: 1.2 });
    expect(east?.toX).toBeCloseTo(0.1);
    const west = resolveContinuousBoundaryCrossing([map(1, 0, 0), map(2, -4, 0)], 1, -0.8, 1.2, 0.7, 0.9);
    expect(west).toMatchObject({ fromSide: "west", toMapId: 2, toY: 1.2 });
    expect(west?.toX).toBeCloseTo(3.2);
    const north = resolveContinuousBoundaryCrossing([map(1, 0, 0), map(2, 0, -3)], 1, 1.2, -0.95, 0.7, 0.9);
    expect(north).toMatchObject({ fromSide: "north", toMapId: 2, toX: 1.2 });
    expect(north?.toY).toBeCloseTo(2.05);
    const south = resolveContinuousBoundaryCrossing([map(1, 0, 0), map(2, 0, 3)], 1, 1.2, 3.05, 0.7, 0.9);
    expect(south).toMatchObject({ fromSide: "south", toMapId: 2, toX: 1.2 });
    expect(south?.toY).toBeCloseTo(0.05);
  });

  it("requires body overlap with a seam and rejects gaps or looped edges", () => {
    expect(resolveContinuousBoundaryCrossing([map(1, 0, 0), map(2, 4, 3)], 1, 4.1, 2.1, 0.7, 0.9)).toBeNull();
    expect(resolveContinuousBoundaryCrossing([map(1, 0, 0), map(2, 5, 0)], 1, 4.1, 1.2, 0.7, 0.9)).toBeNull();
    expect(resolveContinuousBoundaryCrossing([
      map(1, 0, 0, 4, 3, { loop: { h: true } }), map(2, 4, 0),
    ], 1, 4.1, 1.2, 0.7, 0.9)).toBeNull();
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

  it("extends camera bounds across an east or west neighbor", () => {
    const active = map(1, 0, 0);
    expect(connectedCameraBounds(active, [map(2, 4, 0)])).toEqual({ minX: 0, minY: 0, maxX: 8, maxY: 3 });
    expect(connectedCameraBounds(active, [map(2, -4, 0)])).toEqual({ minX: -4, minY: 0, maxX: 4, maxY: 3 });
  });

  it("extends camera bounds across a north or south neighbor", () => {
    const active = map(1, 0, 0);
    expect(connectedCameraBounds(active, [map(2, 0, 3)])).toEqual({ minX: 0, minY: 0, maxX: 4, maxY: 6 });
    expect(connectedCameraBounds(active, [map(2, 0, -3)])).toEqual({ minX: 0, minY: -3, maxX: 4, maxY: 3 });
  });

  it("keeps legacy maps isolated and anchors oversized views", () => {
    const active = { id: 1, width: 4, height: 3 };
    expect(connectedCameraBounds(active, [map(2, 4, 0)])).toEqual({ minX: 0, minY: 0, maxX: 4, maxY: 3 });
    expect(clampCameraAxis(10, 8, 0, 4)).toBe(0);
    expect(clampCameraAxis(-10, 2, -4, 4)).toBe(-4);
    expect(clampCameraAxis(10, 2, -4, 4)).toBe(2);
  });
});
