/* RPGAtlas — src/renderer/plan.ts
   Pure height-extrusion / light-occlusion geometry helpers, ported verbatim
   from js/renderer.js (Phase 2 Stage A). No DOM, no GPU, no engine imports —
   unit-testable in bare node (tests-unit/renderer-plan.test.ts; the classic
   copy keeps its node:test suite until the classic script retires).
   The classic file resolved TILE from window.Assets at load; here callers may
   pass the tile size, defaulting to the engine's 48px tile.
   Copyright (C) 2026 RPGAtlas contributors — GPL-3.0-or-later (see LICENSE). */

export const DEFAULT_TILE = 48;

export interface PlanMap {
  width: number;
  height: number;
  heights?: ArrayLike<number> | null;
}

export interface WallPlan {
  tx: number;
  ty: number;
  h: number;
  /** How far the south wall is exposed over its southern neighbour (units of
   *  height) — the only face a fixed top-down summary needs. */
  faceUnits: number;
}

export interface LightLike {
  rx: number;
  ry: number;
  radius: number;
}

export interface OccluderPlan {
  tx: number;
  ty: number;
  tileHeight: number;
}

/** One entry per elevated tile. */
export function planWalls(map: PlanMap | null | undefined): WallPlan[] {
  const out: WallPlan[] = [];
  if (!map || !map.heights) return out;
  const w = map.width,
    h = map.height,
    hts = map.heights;
  const at = (x: number, y: number) =>
    x < 0 || y < 0 || x >= w || y >= h ? 0 : Number(hts[y * w + x] || 0);
  for (let ty = 0; ty < h; ty++) {
    for (let tx = 0; tx < w; tx++) {
      const e = at(tx, ty);
      if (e <= 0) continue;
      const south = at(tx, ty + 1);
      out.push({ tx, ty, h: e, faceUnits: Math.max(0, e - south) });
    }
  }
  return out;
}

/** Nearby tiles that block light: impassable or elevated cells within radius,
 *  excluding the light's own tile. Pure; used by tests and host tooling. */
export function planLightOccluders(
  map: PlanMap | null | undefined,
  light: LightLike | null | undefined,
  tilePassable: (x: number, y: number) => boolean,
  tile: number = DEFAULT_TILE,
): OccluderPlan[] {
  const out: OccluderPlan[] = [];
  if (!map || !light || typeof tilePassable !== "function") return out;
  const radius = Math.max(0, Number(light.radius) || 0);
  const lightX = Number(light.rx);
  const lightY = Number(light.ry);
  if (!Number.isFinite(lightX) || !Number.isFinite(lightY) || radius <= 0) return out;
  const minTx = Math.max(0, Math.floor(lightX - radius / tile - 1));
  const maxTx = Math.min(map.width, Math.ceil(lightX + radius / tile + 1));
  const minTy = Math.max(0, Math.floor(lightY - radius / tile - 1));
  const maxTy = Math.min(map.height, Math.ceil(lightY + radius / tile + 1));
  for (let ty = minTy; ty < maxTy; ty++) {
    for (let tx = minTx; tx < maxTx; tx++) {
      if (tx === Math.floor(lightX) && ty === Math.floor(lightY)) continue;
      const tileHeight = map.heights ? Number(map.heights[ty * map.width + tx] || 0) : 0;
      if (tilePassable(tx, ty) && tileHeight <= 0) continue;
      const dx = (tx - lightX) * tile;
      const dy = (ty - lightY) * tile;
      if (Math.sqrt(dx * dx + dy * dy) > radius + tile) continue;
      out.push({ tx, ty, tileHeight });
    }
  }
  return out;
}
