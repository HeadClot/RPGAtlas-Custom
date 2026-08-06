/* RPGAtlas — platformer runtime adapter.
   The physics itself lives in shared/sim/platformer.ts. This file translates
   the classic engine's player/event/map records into that pure contract. */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { Assets } from "../../shared/deps.js";
import { isAutotileId, autotilePassable } from "../../shared/map/autotile-registry.js";
import { tileId } from "../../shared/map/tile-flags.js";
import {
  deriveConnections,
  resolveContinuousBoundaryCrossing,
  worldToLocal,
  type ContinuousBoundaryCrossing,
} from "../../shared/map/map-connections.js";
import {
  DEFAULT_PLATFORMER_SETTINGS,
  PLATFORMER_COLLISION,
  createPlatformerBody,
  respawnPlatformerBody,
  stepPlatformerBody,
  type PlatformerBody,
  type PlatformerCollisionWorld,
  type PlatformerInput,
  type PlatformerCollisionKind,
} from "../../shared/sim/platformer.js";
import { ctx } from "../state/engine-context.js";
import { G } from "../state/game-state.js";

export function platformerEnabled(): boolean {
  return ctx.proj?.system?.gameMode === "platformer";
}

export function platformerSettings(): any {
  return { ...DEFAULT_PLATFORMER_SETTINGS, ...(ctx.proj?.system?.platformer || {}) };
}

function tilePassableAt(m: any, x: number, y: number): boolean {
  if (!m || x < 0 || y < 0 || x >= m.width || y >= m.height) return false;
  const i = y * m.width + x;
  const pass = (raw: number) => {
    const id = tileId(raw || 0);
    if (!id) return false;
    if (isAutotileId(id)) return autotilePassable(ctx.proj?.autotiles, id);
    return !!Assets.tiles[id]?.pass;
  };
  const d2 = m.layers?.decor2?.[i] || 0;
  const d = m.layers?.decor?.[i] || 0;
  const g = m.layers?.ground?.[i] || 0;
  return d2 ? pass(d2) : d ? pass(d) : pass(g);
}

function collisionKindAtMap(m: any, x: number, y: number): PlatformerCollisionKind {
  if (!m) return PLATFORMER_COLLISION.SOLID;
  if (x < 0 || y < 0 || x >= m.width || y >= m.height) return PLATFORMER_COLLISION.EMPTY;
  const override = Number(m.platformerCollision?.[y * m.width + x]) || 0;
  if (override === PLATFORMER_COLLISION.SOLID || override === PLATFORMER_COLLISION.EMPTY || override === PLATFORMER_COLLISION.ONE_WAY) return override;
  return tilePassableAt(m, x, y) ? PLATFORMER_COLLISION.EMPTY : PLATFORMER_COLLISION.SOLID;
}

function collisionKindAt(x: number, y: number): PlatformerCollisionKind {
  const m = ctx.map;
  if (!m) return PLATFORMER_COLLISION.SOLID;
  if (x < 0 || x >= m.width) return PLATFORMER_COLLISION.SOLID;
  if (y < 0) return PLATFORMER_COLLISION.SOLID;
  if (y >= m.height) return PLATFORMER_COLLISION.EMPTY;
  return collisionKindAtMap(m, x, y);
}

function connectedNeighbors(active: any): any[] {
  if (!ctx.proj || !active?.worldOrigin) return [];
  const ids = new Set<number>();
  for (const connection of deriveConnections(ctx.proj.maps || [])) {
    if (connection.aMapId === active.id) ids.add(connection.bMapId);
    if (connection.bMapId === active.id) ids.add(connection.aMapId);
  }
  return (ctx.proj.maps || []).filter((map: any) => ids.has(Number(map.id)) && map.worldOrigin);
}

function connectedCollisionWorld(): PlatformerCollisionWorld {
  const active = ctx.map;
  const neighbors = connectedNeighbors(active);
  const origin = active?.worldOrigin;
  let height = Number(active?.height) || 0;
  if (origin) {
    for (const neighbor of neighbors) {
      if (!neighbor.worldOrigin) continue;
      height = Math.max(height, neighbor.worldOrigin.y - origin.y + Number(neighbor.height || 0));
    }
  }
  return {
    width: Number(active?.width) || 0,
    height,
    kindAt(x: number, y: number): PlatformerCollisionKind {
      if (!active) return PLATFORMER_COLLISION.SOLID;
      if (x >= 0 && y >= 0 && x < active.width && y < active.height) return collisionKindAtMap(active, x, y);
      if (origin) {
        const wx = origin.x + x, wy = origin.y + y;
        for (const neighbor of neighbors) {
          const local = worldToLocal(neighbor, wx, wy);
          if (local) return collisionKindAtMap(neighbor, local.x, local.y);
        }
      }
      // Preserve the platformer's existing wall/top/fall semantics when no
      // connected map owns the queried cell.
      if (x < 0 || x >= active.width || y < 0) return PLATFORMER_COLLISION.SOLID;
      return PLATFORMER_COLLISION.EMPTY;
    },
  };
}

function bodyOf(ent: any): PlatformerBody {
  if (!ent.platformer) {
    const x = Number(ent.x);
    const y = Number(ent.y);
    ent.platformer = createPlatformerBody(Number.isFinite(x) ? x : 0.15, Number.isFinite(y) ? y : 0.1);
  }
  return ent.platformer;
}

function syncEntity(ent: any, body: PlatformerBody): void {
  ent.x = body.x;
  ent.y = body.y;
  ent.tx = body.x;
  ent.ty = body.y;
  ent.rx = body.x;
  ent.ry = body.y;
  ent.moving = Math.abs(body.vx) > 0.001 || Math.abs(body.vy) > 0.001;
  // Platformer motion is continuous and must not enter the legacy timed-jump
  // branch in map.ts.
  ent.jumping = null;
  if (Math.abs(body.vx) > 0.01) ent.dir = body.vx < 0 ? 1 : 2;
}

export function ensurePlatformerPlayer(): void {
  if (!platformerEnabled() || !G.player) return;
  const p = G.player;
  const body = bodyOf(p);
  if (!G.platformerCheckpoint || G.platformerCheckpoint.mapId !== G.mapId) {
    G.platformerCheckpoint = { mapId: G.mapId, x: body.x, y: body.y, dir: p.dir || 2 };
  }
  syncEntity(p, body);
}

export function platformerPlayerInput(input: PlatformerInput): { fell: boolean; landed: boolean; crossing: ContinuousBoundaryCrossing | null } {
  if (!platformerEnabled() || !G.player) return { fell: false, landed: false, crossing: null };
  const p = G.player;
  const body = bodyOf(p);
  const result = stepPlatformerBody(body, input, connectedCollisionWorld(), platformerSettings());
  const crossing = ctx.proj?.maps
    ? resolveContinuousBoundaryCrossing(ctx.proj.maps, G.mapId, body.x, body.y, body.width, body.height)
    : null;
  syncEntity(p, body);
  return { ...result, crossing };
}

/** Validate a body placement against the currently active map. One-way tiles
 * are intentionally allowed here; the solver will resolve their vertical
 * landing on the next tick. */
export function platformerBodyFitsAt(x: number, y: number): boolean {
  const m = ctx.map, body = G.player?.platformer;
  if (!m || !body || x < 0 || y < 0 || x + body.width > m.width || y + body.height > m.height) return false;
  const footprintEpsilon = 1e-7;
  const x0 = Math.floor(x), x1 = Math.floor(x + body.width - footprintEpsilon);
  const y0 = Math.floor(y), y1 = Math.floor(y + body.height - footprintEpsilon);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    if (collisionKindAtMap(m, tx, ty) === PLATFORMER_COLLISION.SOLID) return false;
  }
  return true;
}

export function platformerPlayerGrounded(): boolean {
  return !!G.player?.platformer?.grounded;
}

export function platformerPlayerInvulnerable(): boolean {
  return Number(G.player?.platformer?.invulnerableFrames) > 0;
}

export function setPlatformerCheckpoint(rt: any, saveOnReach = false): boolean {
  if (!platformerEnabled() || !rt?.ev) return false;
  G.platformerCheckpoint = {
    mapId: G.mapId,
    x: Number(rt.ev.x) + 0.15,
    y: Number(rt.ev.y) + 0.1,
    dir: Number(rt.page?.dir) || 2,
  };
  return saveOnReach;
}

export function respawnAtPlatformerCheckpoint(): void {
  if (!platformerEnabled() || !G.player) return;
  const checkpoint = G.platformerCheckpoint;
  const x = checkpoint && checkpoint.mapId === G.mapId ? checkpoint.x : Number(ctx.proj.system.startX) + 0.15;
  const y = checkpoint && checkpoint.mapId === G.mapId ? checkpoint.y : Number(ctx.proj.system.startY) + 0.1;
  respawnPlatformerBody(bodyOf(G.player), x, y, platformerSettings());
  G.player.dir = checkpoint && checkpoint.mapId === G.mapId ? checkpoint.dir : Number(ctx.proj.system.startDir) || 2;
  syncEntity(G.player, bodyOf(G.player));
}

function overlapsEvent(p: any, rt: any): boolean {
  const body = bodyOf(p);
  const ex = Number(rt.ev?.x) || 0;
  const ey = Number(rt.ev?.y) || 0;
  return body.x < ex + 1 && body.x + body.width > ex && body.y < ey + 1 && body.y + body.height > ey;
}

export function platformerEvents(): any[] {
  if (!platformerEnabled() || !G.player) return [];
  const out: any[] = [];
  for (const rt of ctx.evRTs || []) {
    if (rt.erased || !rt.page?.platformer || !overlapsEvent(G.player, rt)) continue;
    if (Number(rt.platformerCooldown) > 0) {
      rt.platformerCooldown--;
      continue;
    }
    rt.platformerCooldown = 30;
    out.push(rt);
  }
  return out;
}

export function platformerActionEvent(): any {
  if (!platformerEnabled() || !G.player) return null;
  const p = G.player;
  const body = bodyOf(p);
  return (ctx.evRTs || []).find((rt: any) => {
    if (rt.erased || !rt.page || rt.page.platformer || rt.page.trigger !== "action") return false;
    const ex = Number(rt.ev?.x) || 0;
    const ey = Number(rt.ev?.y) || 0;
    return body.x < ex + 1.35 && body.x + body.width > ex - 0.35 && body.y < ey + 1.35 && body.y + body.height > ey - 0.35;
  }) || null;
}

export function platformerCollisionAt(x: number, y: number): PlatformerCollisionKind {
  return collisionKindAt(x, y);
}
