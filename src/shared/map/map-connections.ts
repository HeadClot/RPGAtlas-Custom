/* RPGAtlas — shared map-connection geometry.
   Map origins are absolute tile coordinates. A connection is implicit when two
   non-overlapping map rectangles share a cardinal edge for at least one tile.
   This module is deliberately DOM-free so the editor, browser runtime, and
   Beacon collision code all agree on the same seam math. */
/* eslint-disable @typescript-eslint/no-explicit-any */

export type MapSide = "north" | "south" | "east" | "west";
export interface WorldOrigin { x: number; y: number; }
export interface MapConnection {
  aMapId: number; bMapId: number; aSide: MapSide; bSide: MapSide;
  /** First shared row/column in each map's local coordinates. */
  aStart: number; bStart: number; length: number;
}
export interface BoundaryCrossing {
  fromMapId: number; toMapId: number; fromSide: MapSide; toSide: MapSide;
  fromX: number; fromY: number; toX: number; toY: number;
}
/** Continuous equivalent of BoundaryCrossing used by bodies whose position
 * is expressed in fractional tile coordinates. `fromX/fromY` and `toX/toY`
 * are the body's top-left coordinates, not a discrete tile. */
export type ContinuousBoundaryCrossing = BoundaryCrossing;
export interface MapConnectionSegment { x1: number; y1: number; x2: number; y2: number; }
export interface CameraBounds { minX: number; minY: number; maxX: number; maxY: number; }
export interface LayoutIssue {
  kind: "invalid-origin" | "overlap" | "gap" | "loop-conflict";
  mapIds: number[]; message: string; distance?: number;
}

function originOf(map: any): WorldOrigin | null {
  const o = map && map.worldOrigin;
  if (!o || !Number.isInteger(o.x) || !Number.isInteger(o.y)) return null;
  return { x: o.x, y: o.y };
}
function validMap(map: any): boolean {
  return !!map && Number.isInteger(map.id) && Number.isInteger(map.width) &&
    Number.isInteger(map.height) && map.width > 0 && map.height > 0;
}
function rect(map: any): { x: number; y: number; right: number; bottom: number } | null {
  const o = originOf(map);
  if (!validMap(map) || !o) return null;
  return { x: o.x, y: o.y, right: o.x + map.width, bottom: o.y + map.height };
}
function overlapStart(a0: number, a1: number, b0: number, b1: number): { start: number; length: number } | null {
  const start = Math.max(a0, b0), end = Math.min(a1, b1);
  return end > start ? { start, length: end - start } : null;
}

/** Return camera-space tile bounds for an active map and its already-resolved
 * neighboring maps. The active map is always anchored at (0, 0), while
 * placed neighbors extend the legal camera area in their world-space
 * direction. Legacy maps without a world origin retain their local bounds. */
export function connectedCameraBounds(activeMap: any, neighbors: any[] = []): CameraBounds {
  if (!validMap(activeMap)) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  const activeRect = rect(activeMap);
  if (!activeRect) {
    return { minX: 0, minY: 0, maxX: activeMap.width, maxY: activeMap.height };
  }
  let minX = 0, minY = 0, maxX = activeMap.width, maxY = activeMap.height;
  for (const neighbor of Array.isArray(neighbors) ? neighbors : []) {
    const r = rect(neighbor);
    if (!r) continue;
    minX = Math.min(minX, r.x - activeRect.x);
    minY = Math.min(minY, r.y - activeRect.y);
    maxX = Math.max(maxX, r.right - activeRect.x);
    maxY = Math.max(maxY, r.bottom - activeRect.y);
  }
  return { minX, minY, maxX, maxY };
}

/** Clamp a camera origin to a world interval. If the viewport is wider than
 * the interval, keep its origin at the interval's minimum just like the
 * legacy bounded-map camera did at zero. */
export function clampCameraAxis(raw: number, viewSize: number, min: number, max: number): number {
  return Math.max(min, Math.min(raw, Math.max(min, max - viewSize)));
}

/** Return each touching pair once. Pair order is stable by input order. */
export function deriveConnections(maps: any[]): MapConnection[] {
  const list = Array.isArray(maps) ? maps : [], out: MapConnection[] = [];
  for (let i = 0; i < list.length; i++) {
    const a = list[i], ar = rect(a);
    if (!ar) continue;
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j], br = rect(b);
      if (!br) continue;
      const area = Math.min(ar.right, br.right) - Math.max(ar.x, br.x);
      const areaY = Math.min(ar.bottom, br.bottom) - Math.max(ar.y, br.y);
      if (area > 0 && areaY > 0) continue;
      const vertical = overlapStart(ar.y, ar.bottom, br.y, br.bottom);
      const horizontal = overlapStart(ar.x, ar.right, br.x, br.right);
      if (ar.right === br.x && vertical) {
        if (!(a.loop && a.loop.h) && !(b.loop && b.loop.h)) out.push({
          aMapId: a.id, bMapId: b.id, aSide: "east", bSide: "west",
          aStart: vertical.start - ar.y, bStart: vertical.start - br.y, length: vertical.length,
        });
      } else if (br.right === ar.x && vertical) {
        if (!(a.loop && a.loop.h) && !(b.loop && b.loop.h)) out.push({
          aMapId: a.id, bMapId: b.id, aSide: "west", bSide: "east",
          aStart: vertical.start - ar.y, bStart: vertical.start - br.y, length: vertical.length,
        });
      } else if (ar.bottom === br.y && horizontal) {
        if (!(a.loop && a.loop.v) && !(b.loop && b.loop.v)) out.push({
          aMapId: a.id, bMapId: b.id, aSide: "south", bSide: "north",
          aStart: horizontal.start - ar.x, bStart: horizontal.start - br.x, length: horizontal.length,
        });
      } else if (br.bottom === ar.y && horizontal) {
        if (!(a.loop && a.loop.v) && !(b.loop && b.loop.v)) out.push({
          aMapId: a.id, bMapId: b.id, aSide: "north", bSide: "south",
          aStart: horizontal.start - ar.x, bStart: horizontal.start - br.x, length: horizontal.length,
        });
      }
    }
  }
  return out;
}

/** Return the world-space seam segment for a connection, rather than the
 * zero-length bridge between two touching map rectangles. */
export function connectionSegment(connection: MapConnection, map: any): MapConnectionSegment {
  const origin = map.worldOrigin;
  if (connection.aSide === "east" || connection.aSide === "west") {
    const x = origin.x + (connection.aSide === "east" ? map.width : 0);
    return { x1: x, y1: origin.y + connection.aStart,
      x2: x, y2: origin.y + connection.aStart + connection.length };
  }
  const y = origin.y + (connection.aSide === "south" ? map.height : 0);
  return { x1: origin.x + connection.aStart, y1: y,
    x2: origin.x + connection.aStart + connection.length, y2: y };
}

function sideFor(dx: number, dy: number): MapSide | null {
  if (dx > 0 && dy === 0) return "east";
  if (dx < 0 && dy === 0) return "west";
  if (dy > 0 && dx === 0) return "south";
  if (dy < 0 && dx === 0) return "north";
  return null;
}
function opposite(side: MapSide): MapSide {
  return side === "east" ? "west" : side === "west" ? "east" : side === "south" ? "north" : "south";
}
function connectionHasSide(c: MapConnection, mapId: number, side: MapSide): boolean {
  return (c.aMapId === mapId && c.aSide === side) || (c.bMapId === mapId && c.bSide === side);
}

/** Resolve one cardinal step that would leave a map. Passability is the
 * caller's concern; this only answers spatial adjacency. */
export function resolveBoundaryCrossing(
  maps: any[], fromMapId: number, x: number, y: number, dx: number, dy: number,
): BoundaryCrossing | null {
  const side = sideFor(dx, dy);
  if (!side) return null;
  const from = Array.isArray(maps) ? maps.find((m) => Number(m.id) === Number(fromMapId)) : null;
  if (!from || !originOf(from)) return null;
  if (side === "east" && x !== from.width - 1) return null;
  if (side === "west" && x !== 0) return null;
  if (side === "south" && y !== from.height - 1) return null;
  if (side === "north" && y !== 0) return null;
  const o = originOf(from)!, wx = o.x + x + dx, wy = o.y + y + dy;
  for (const c of deriveConnections(maps)) {
    if (!connectionHasSide(c, from.id, side)) continue;
    const targetId = c.aMapId === from.id ? c.bMapId : c.aMapId;
    const target = maps.find((m) => Number(m.id) === Number(targetId));
    const toOrigin = originOf(target);
    if (!target || !toOrigin) continue;
    const tx = wx - toOrigin.x, ty = wy - toOrigin.y;
    if (tx >= 0 && ty >= 0 && tx < target.width && ty < target.height) {
      return { fromMapId: from.id, toMapId: target.id, fromSide: side,
        toSide: opposite(side), fromX: x, fromY: y, toX: tx, toY: ty };
    }
  }
  return null;
}

function sideData(connection: MapConnection, mapId: number): { side: MapSide; start: number; length: number } | null {
  if (connection.aMapId === mapId) return { side: connection.aSide, start: connection.aStart, length: connection.length };
  if (connection.bMapId === mapId) return { side: connection.bSide, start: connection.bStart, length: connection.length };
  return null;
}

/** Resolve a fractional body that has fully entered a touching map. The
 * returned destination coordinates preserve the body's world-space position;
 * the caller remains responsible for checking destination collision details. */
export function resolveContinuousBoundaryCrossing(
  maps: any[], fromMapId: number, x: number, y: number, width: number, height: number,
): ContinuousBoundaryCrossing | null {
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;
  const list = Array.isArray(maps) ? maps : [];
  const from = list.find((m) => Number(m.id) === Number(fromMapId));
  const fromRect = rect(from);
  if (!from || !fromRect) return null;
  const bodyWorld = { x: fromRect.x + x, y: fromRect.y + y };
  const bodyRight = bodyWorld.x + width, bodyBottom = bodyWorld.y + height;
  const epsilon = 1e-6;

  for (const connection of deriveConnections(list)) {
    const data = sideData(connection, from.id);
    if (!data) continue;
    const targetId = connection.aMapId === from.id ? connection.bMapId : connection.aMapId;
    const target = list.find((m) => Number(m.id) === Number(targetId));
    const targetRect = rect(target);
    if (!target || !targetRect) continue;

    const seamStart = data.side === "east" || data.side === "west"
      ? fromRect.y + data.start : fromRect.x + data.start;
    const seamEnd = seamStart + data.length;
    const seamOverlap = data.side === "east" || data.side === "west"
      ? Math.min(bodyBottom, seamEnd) - Math.max(bodyWorld.y, seamStart)
      : Math.min(bodyRight, seamEnd) - Math.max(bodyWorld.x, seamStart);
    if (seamOverlap <= epsilon) continue;

    const crossed = data.side === "east"
      ? x >= from.width - epsilon
      : data.side === "west"
        ? x + width <= epsilon
        : data.side === "south"
          ? y >= from.height - epsilon
          : y + height <= epsilon;
    if (!crossed) continue;

    const toX = bodyWorld.x - targetRect.x, toY = bodyWorld.y - targetRect.y;
    // A fast-moving body must still intersect the destination rectangle. The
    // normal solver never leaps this far, but this guard keeps malformed or
    // custom physics settings from teleporting across an unrelated map.
    if (toX + width <= 0 || toY + height <= 0 || toX >= target.width || toY >= target.height) continue;
    return {
      fromMapId: from.id, toMapId: target.id, fromSide: data.side,
      toSide: opposite(data.side), fromX: x, fromY: y, toX, toY,
    };
  }
  return null;
}

export function localToWorld(map: any, x: number, y: number): { x: number; y: number } | null {
  const o = originOf(map); return o ? { x: o.x + x, y: o.y + y } : null;
}
export function worldToLocal(map: any, x: number, y: number): { x: number; y: number } | null {
  const o = originOf(map); if (!o) return null;
  const lx = x - o.x, ly = y - o.y;
  return lx >= 0 && ly >= 0 && lx < map.width && ly < map.height ? { x: lx, y: ly } : null;
}

/** Diagnostics for the editor. Missing origins are returned separately so a
 * project with intentionally isolated legacy maps is not marked erroneous. */
export function validateLayout(maps: any[]): { issues: LayoutIssue[]; unplaced: number[] } {
  const list = Array.isArray(maps) ? maps : [], issues: LayoutIssue[] = [], unplaced: number[] = [];
  for (const m of list) {
    if (!m || m.worldOrigin == null) { if (m && m.id != null) unplaced.push(m.id); continue; }
    if (!originOf(m)) issues.push({ kind: "invalid-origin", mapIds: [m.id], message: `Map ${m.id} has a non-integer world origin.` });
  }
  for (let i = 0; i < list.length; i++) {
    const a = list[i], ar = rect(a); if (!ar) continue;
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j], br = rect(b); if (!br) continue;
      const ox = Math.min(ar.right, br.right) - Math.max(ar.x, br.x);
      const oy = Math.min(ar.bottom, br.bottom) - Math.max(ar.y, br.y);
      if (ox > 0 && oy > 0) {
        issues.push({ kind: "overlap", mapIds: [a.id, b.id], message: `Maps ${a.id} and ${b.id} overlap.` });
        continue;
      }
      const vertical = overlapStart(ar.y, ar.bottom, br.y, br.bottom);
      const horizontal = overlapStart(ar.x, ar.right, br.x, br.right);
      const xGap = br.x > ar.right ? br.x - ar.right : ar.x > br.right ? ar.x - br.right : 0;
      const yGap = br.y > ar.bottom ? br.y - ar.bottom : ar.y > br.bottom ? ar.y - br.bottom : 0;
      if (vertical && xGap > 0) issues.push({ kind: "gap", mapIds: [a.id, b.id], distance: xGap, message: `Maps ${a.id} and ${b.id} have a ${xGap}-tile horizontal gap.` });
      else if (horizontal && yGap > 0) issues.push({ kind: "gap", mapIds: [a.id, b.id], distance: yGap, message: `Maps ${a.id} and ${b.id} have a ${yGap}-tile vertical gap.` });
      const touchesH = (ar.right === br.x || br.right === ar.x) && vertical;
      const touchesV = (ar.bottom === br.y || br.bottom === ar.y) && horizontal;
      if ((touchesH && ((a.loop && a.loop.h) || (b.loop && b.loop.h))) ||
          (touchesV && ((a.loop && a.loop.v) || (b.loop && b.loop.v)))) {
        issues.push({ kind: "loop-conflict", mapIds: [a.id, b.id], message: `Maps ${a.id} and ${b.id} connect on an edge that is configured to loop.` });
      }
    }
  }
  return { issues, unplaced };
}

export function mapWorldRect(map: any): { x: number; y: number; width: number; height: number } | null {
  const o = originOf(map); return o && validMap(map) ? { x: o.x, y: o.y, width: map.width, height: map.height } : null;
}
