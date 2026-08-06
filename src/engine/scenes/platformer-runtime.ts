/* RPGAtlas — platformer runtime adapter.
   The physics itself lives in shared/sim/platformer.ts. This file translates
   the classic engine's player/event/map records into that pure contract. */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { Assets } from "../../shared/deps.js";
import { isAutotileId, autotilePassable } from "../../shared/map/autotile-registry.js";
import { tileId } from "../../shared/map/tile-flags.js";
import {
  DEFAULT_PLATFORMER_SETTINGS,
  PLATFORMER_COLLISION,
  createPlatformerBody,
  respawnPlatformerBody,
  stepPlatformerBody,
  type PlatformerBody,
  type PlatformerInput,
  type PlatformerCollisionKind,
} from "../../shared/sim/platformer.js";
import { ctx } from "../state/engine-context.js";
import { G } from "../state/game-state.js";

const TILE = Assets.TILE;

export function platformerEnabled(): boolean {
  return ctx.proj?.system?.gameMode === "platformer";
}

export function platformerSettings(): any {
  return { ...DEFAULT_PLATFORMER_SETTINGS, ...(ctx.proj?.system?.platformer || {}) };
}

function tilePassableAt(x: number, y: number): boolean {
  const m = ctx.map;
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

function collisionKindAt(x: number, y: number): PlatformerCollisionKind {
  const m = ctx.map;
  if (!m) return PLATFORMER_COLLISION.SOLID;
  if (x < 0 || x >= m.width) return PLATFORMER_COLLISION.SOLID;
  if (y < 0) return PLATFORMER_COLLISION.SOLID;
  if (y >= m.height) return PLATFORMER_COLLISION.EMPTY;
  const override = Number(m.platformerCollision?.[y * m.width + x]) || 0;
  if (override === PLATFORMER_COLLISION.SOLID || override === PLATFORMER_COLLISION.EMPTY || override === PLATFORMER_COLLISION.ONE_WAY) return override;
  return tilePassableAt(x, y) ? PLATFORMER_COLLISION.EMPTY : PLATFORMER_COLLISION.SOLID;
}

function bodyOf(ent: any): PlatformerBody {
  if (!ent.platformer) {
    ent.platformer = createPlatformerBody(Number(ent.x) || 0.15, Number(ent.y) || 0.1);
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

export function platformerPlayerInput(input: PlatformerInput): { fell: boolean; landed: boolean } {
  if (!platformerEnabled() || !G.player) return { fell: false, landed: false };
  const p = G.player;
  const body = bodyOf(p);
  const result = stepPlatformerBody(body, input, {
    width: Number(ctx.map?.width) || 0,
    height: Number(ctx.map?.height) || 0,
    kindAt: collisionKindAt,
  }, platformerSettings());
  syncEntity(p, body);
  return result;
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
