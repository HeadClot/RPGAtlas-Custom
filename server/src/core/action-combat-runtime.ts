/* RPGAtlas — Cloudflare-safe field action-combat runtime.
   This adapter is the DOM-free authoritative field runtime used by Cloudflare
   Durable Objects. It intentionally omits the interpreter, but matches the
   shared combat behavior and wire outcomes used by Node and browser hosts. */
/* eslint-disable @typescript-eslint/no-explicit-any */

import type { JsonValue, PlayerId } from "../../../src/shared/net/protocol.js";
import {
  applyHurt, attackHitsEntity, attackIsActive, createCombatState, markDead, respawnIfReady,
  startAttack, tickAttack, toCombatNetState,
} from "../../../src/shared/sim/action-combat.js";
import { CombatLedger } from "../../../src/shared/sim/combat-persistence.js";
import type { CombatEvent, CombatZoneSnapshot } from "../../../src/shared/sim/combat-persistence.js";
import { CombatEventStream, knockbackStep, playerDamageFor, selectCombatTarget } from "../../../src/shared/sim/action-combat-adapter.js";
import { isPassable } from "../../../src/shared/sim/collision.js";
import { resolveActorCombat, resolveEnemyCombat, type ResolvedEnemyCombat } from "../../../src/shared/sim/combat-profiles.js";
import type { EventNetState, ZoneRuntime, ZoneRuntimeContext } from "../../../src/shared/net/zone-runtime.js";

function pageOf(ev: any): any {
  const pages = Array.isArray(ev.pages) ? ev.pages : [];
  return pages.length ? pages[pages.length - 1] : null;
}

function dirTo(fx: number, fy: number, tx: number, ty: number): number {
  const dx = tx - fx, dy = ty - fy;
  return Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 2 : dx < 0 ? 1 : 0) : (dy > 0 ? 0 : 3);
}

export function createCloudActionCombatRuntime(ctx: ZoneRuntimeContext): ZoneRuntime {
  const world = ctx.world;
  const mapId = ctx.mapId;
  const ledger = new CombatLedger();
  let eventStream = new CombatEventStream();
  const events: any[] = [];
  let ready = !ctx.persistence;

  const record = (event: Omit<CombatEvent, "seq">): void => {
    const row = ledger.append(event);
    eventStream.append(row);
  };

  const cfgOf = (rt: any): ResolvedEnemyCombat | null => rt.page ? resolveEnemyCombat(world.proj, { combat: rt.page.combat }) : null;
  const canPass = (rt: any, x: number, y: number): boolean => {
    if (!isPassable(ctx.collision, x, y)) return false;
    if (events.some((other) => other !== rt && !other.erased && other.x === x && other.y === y && other.page && other.page.priority === "same" && !other.page.through)) return false;
    for (const player of world.roster.players.values()) {
      if (player.x === x && player.y === y) return false;
    }
    return true;
  };
  const startMove = (rt: any, dir: number): void => {
    const [dx, dy] = [[0, 1], [-1, 0], [1, 0], [0, -1], [-1, 1], [1, 1], [-1, -1], [1, -1]][dir] || [0, 0];
    rt.dir = dir; rt.tx = rt.x + dx; rt.ty = rt.y + dy; rt.moving = true;
  };
  const updateMove = (rt: any): boolean => {
    if (!rt.moving) return false;
    const speed = 0.05;
    const sx = Math.sign(rt.tx - rt.rx), sy = Math.sign(rt.ty - rt.ry);
    rt.rx += sx * speed; rt.ry += sy * speed;
    if ((sx && Math.sign(rt.tx - rt.rx) !== sx) || (sy && Math.sign(rt.ty - rt.ry) !== sy) || (!sx && !sy)) {
      rt.rx = rt.tx; rt.ry = rt.ty; rt.x = rt.tx; rt.y = rt.ty; rt.moving = false; return true;
    }
    return false;
  };
  const createEvent = (ev: any): any => {
    const page = pageOf(ev);
    const cfg = page?.combat?.enabled ? resolveEnemyCombat(world.proj, { combat: page.combat }) : null;
    return {
      ev, x: Number(ev.x) || 0, y: Number(ev.y) || 0, rx: Number(ev.x) || 0, ry: Number(ev.y) || 0,
      tx: Number(ev.x) || 0, ty: Number(ev.y) || 0, dir: Number(page?.dir) || 0,
      moving: false, erased: false, page, pageIndex: page ? events.length : -1,
      combat: cfg ? Object.assign(createCombatState(), { hp: cfg.hp, maxHp: cfg.hp, enemyId: cfg.enemyId }) : null,
    };
  };

  function damageEvent(player: any, rt: any): void {
    const cfg = cfgOf(rt); if (!cfg || !rt.combat || rt.combat.dead || rt.combat.invuln > 0) return;
    const enemy = (world.proj.enemies || []).find((e: any) => Number(e.id) === Number(cfg.enemyId));
    const def = Number(enemy?.stats?.def) || 0;
    const actor = resolveActorCombat(world.proj, player.loadout?.actorId || 1, player.loadout);
    const amount = playerDamageFor(world.proj, player.loadout || { actorId: 1 }, def);
    rt.combat.hp = Math.max(0, Number(rt.combat.hp || cfg.hp) - amount);
    applyHurt(rt.combat, cfg.invulnFrames, actor.staggerFrames);
    if (rt.combat.hp > 0 && actor.knockbackTiles > 0 && !rt.moving && knockbackStep(rt, player.combat.dir, (x, y) => canPass(rt, x, y), (dir) => startMove(rt, dir))) {
      rt.combat.knockback = Math.max(0, Number(actor.knockbackTiles) || 0) - 1;
      rt.combat.knockbackDir = player.combat.dir;
    }
    record({ tick: world.tick, kind: "hit", source: player.id, target: rt.ev.id, mapId, eventId: rt.ev.id, attackId: player.combat.attackId, x: rt.x, y: rt.y, dir: player.combat.dir, animationId: actor.hitAnimationId, sound: actor.hitSound });
    record({ tick: world.tick, kind: "damage", source: player.id, target: rt.ev.id, mapId, eventId: rt.ev.id, amount, hpAfter: rt.combat.hp, attackId: player.combat.attackId, x: rt.x, y: rt.y, animationId: cfg.hurtAnimationId, sound: cfg.hurtSound });
    if (rt.combat.hp <= 0) {
      markDead(rt.combat, cfg.persistentDefeat ? 0 : cfg.respawnFrames);
      record({ tick: world.tick, kind: "defeat", target: rt.ev.id, mapId, eventId: rt.ev.id, x: rt.x, y: rt.y, animationId: cfg.animationId, sound: cfg.defeatSound });
      if (cfg.defeatSelfSwitch) world.g.selfSw[mapId + ":" + rt.ev.id + ":" + cfg.defeatSelfSwitch] = true;
      if ((!cfg.respawnFrames || cfg.persistentDefeat) && !cfg.defeatSelfSwitch) rt.erased = true;
    }
  }

  function damagePlayer(rt: any, player: any, cfg: ResolvedEnemyCombat): void {
    if (player.combat.dead || player.combat.invuln > 0 || rt.combat.hitIds.has(player.id)) return;
    rt.combat.hitIds.add(player.id);
    const amount = Math.max(0, cfg.touchDamage);
    player.hp = Math.max(0, Number(player.hp || player.maxHp || 100) - amount);
    const actor = resolveActorCombat(world.proj, player.loadout?.actorId || 1, player.loadout);
    applyHurt(player.combat, actor.invulnFrames, cfg.staggerFrames);
    record({ tick: world.tick, kind: "damage", source: rt.ev.id, target: player.id, mapId, eventId: rt.ev.id, amount, hpAfter: player.hp, attackId: rt.combat.attackId, x: player.x, y: player.y, sound: cfg.hurtSound });
    if (player.hp <= 0) {
      const actor = resolveActorCombat(world.proj, player.loadout?.actorId || 1, player.loadout);
      const reviveFrames = Math.max(1, actor.reviveFrames || 300);
      markDead(player.combat, reviveFrames); player.revive = reviveFrames;
      record({ tick: world.tick, kind: "playerDeath", source: rt.ev.id, target: player.id, mapId, eventId: rt.ev.id, x: player.x, y: player.y, animationId: actor.defeatAnimationId, sound: actor.defeatSound });
    }
  }

  function restoreRuntimeData(data: Record<string, JsonValue>): void {
    if (Array.isArray(data.combatLedger)) {
      for (const row of data.combatLedger as any[]) ledger.append(row);
      eventStream = new CombatEventStream(ledger.toJSON());
    }
    const byId = new Map(events.map((rt) => [rt.ev.id, rt]));
    for (const saved of (data.events as any[]) || []) {
      const rt = byId.get(saved.id); if (!rt) continue;
      rt.x = rt.tx = saved.x; rt.y = rt.ty = saved.y; rt.erased = !!saved.erased;
      if (saved.combat && rt.combat) Object.assign(rt.combat, saved.combat, { hitIds: new Set() });
    }
  }

  return {
    capabilities: { actionCombat: true, persistence: !!ctx.persistence },
    ready: () => ready,
    start(): void {
      const map = (world.proj.maps || []).find((m: any) => Number(m.id) === mapId);
      for (const ev of (map?.events || [])) {
        const rt = createEvent(ev);
        const cfg = cfgOf(rt);
        if (cfg?.persistentDefeat && cfg.defeatSelfSwitch && world.g.selfSw[mapId + ":" + rt.ev.id + ":" + cfg.defeatSelfSwitch]) {
          rt.combat.dead = true;
          rt.combat.phase = "dead";
          rt.combat.respawn = 0;
          rt.erased = true;
        }
        events.push(rt);
      }
      world.evRTs = events;
      if (ctx.persistence) {
        void ctx.persistence.loadZone(mapId).then((saved) => {
          if (saved) {
            restoreRuntimeData({ events: saved.events as unknown as JsonValue[], combatLedger: saved.ledger as unknown as JsonValue[] });
          }
        }).finally(() => { ready = true; });
      }
    },
    tick(): void {
      if (!ready) return;
      for (const player of world.roster.players.values()) {
        const actor = resolveActorCombat(world.proj, player.loadout?.actorId || 1, player.loadout);
        if (player.combat.dead) {
          tickAttack(player.combat, 0, 0);
          if (respawnIfReady(player.combat)) {
            const actor = resolveActorCombat(world.proj, player.loadout?.actorId || 1, player.loadout);
            player.hp = actor.reviveHp; player.revive = 0;
            record({ tick: world.tick, kind: "revive", target: player.id, mapId, x: player.x, y: player.y, animationId: actor.reviveAnimationId, sound: actor.reviveSound });
          }
          continue;
        }
        if (attackIsActive(player.combat)) {
          for (const rt of events) if (!rt.erased && rt.combat && !rt.combat.dead && !player.combat.hitIds.has(rt.ev.id) && attackHitsEntity(player, rt, player.combat.dir, actor.hitbox, actor.range)) {
            player.combat.hitIds.add(rt.ev.id); damageEvent(player, rt);
          }
        }
        tickAttack(player.combat, actor.windupFrames, actor.activeFrames);
      }
      for (const rt of events) {
        const cfg = cfgOf(rt); if (!cfg || !rt.combat) continue;
        if (rt.moving) {
          const arrived = updateMove(rt);
          if (arrived && Number(rt.combat.knockback) > 0) {
            const remaining = Number(rt.combat.knockback) || 0;
            if (knockbackStep(rt, Number(rt.combat.knockbackDir) || rt.dir, (x, y) => canPass(rt, x, y), (dir) => startMove(rt, dir))) rt.combat.knockback = remaining - 1;
            else rt.combat.knockback = 0;
          }
        }
        if (rt.combat.dead) {
          tickAttack(rt.combat, cfg.attackWindupFrames, cfg.attackActiveFrames);
          if (!cfg.persistentDefeat && cfg.respawnFrames > 0 && respawnIfReady(rt.combat)) {
            rt.combat.hp = cfg.hp; rt.erased = false;
            record({ tick: world.tick, kind: "respawn", target: rt.ev.id, mapId, eventId: rt.ev.id, x: rt.x, y: rt.y, sound: cfg.reviveSound });
          }
          continue;
        }
        const players = [...world.roster.players.values()].filter((p) => !p.combat.dead && p.mapId === mapId);
        const target = selectCombatTarget(rt, players, 8);
        if (!rt.moving && cfg.ai === "chase" && target && Math.abs(target.x - rt.x) + Math.abs(target.y - rt.y) > cfg.attackRange) {
          const dx = target.x - rt.x, dy = target.y - rt.y;
          const dirs = Math.abs(dx) >= Math.abs(dy) ? [dx > 0 ? 2 : 1, dy > 0 ? 0 : 3] : [dy > 0 ? 0 : 3, dx > 0 ? 2 : 1];
          for (const dir of dirs) {
            const [sx, sy] = [[0, 1], [-1, 0], [1, 0], [0, -1]][dir] || [0, 0];
            if (canPass(rt, rt.x + sx, rt.y + sy)) { startMove(rt, dir); break; }
          }
        }
        if (rt.combat.phase === "idle" && rt.combat.attackCooldown <= 0 && target && cfg.touchDamage > 0) {
          rt.dir = dirTo(rt.x, rt.y, target.x, target.y);
          rt.combat.hitIds.clear();
          startAttack(rt.combat, rt.dir, cfg.attackWindupFrames, cfg.attackActiveFrames, cfg.attackRecoveryFrames);
          rt.combat.attackCooldown = cfg.attackCooldown;
          record({ tick: world.tick, kind: "telegraph", source: rt.ev.id, target: target.id, mapId, eventId: rt.ev.id, x: rt.x, y: rt.y, dir: rt.dir, animationId: cfg.telegraphAnimationId, sound: cfg.telegraphSound });
        }
        if (attackIsActive(rt.combat)) for (const player of world.roster.players.values()) {
          if (attackHitsEntity(rt, { ...player, rx: player.rx ?? player.x, ry: player.ry ?? player.y }, rt.dir, cfg.hitbox, cfg.attackRange)) damagePlayer(rt, player, cfg);
        }
        tickAttack(rt.combat, cfg.attackWindupFrames, cfg.attackActiveFrames);
      }
      if (ctx.persistence && world.tick % 30 === 0) {
        const saved: CombatZoneSnapshot = {
          events: Object.fromEntries(events.filter((rt) => rt.combat).map((rt) => [String(rt.ev.id), {
            mapId, eventId: rt.ev.id, hp: Number(rt.combat.hp || 0), maxHp: Number(rt.combat.maxHp || 0),
            dead: !!rt.combat.dead, respawn: Number(rt.combat.respawn || 0), defeated: !!rt.combat.dead,
            persistentDefeat: !!cfgOf(rt)?.persistentDefeat,
          }])),
          ledger: ledger.toJSON(),
        };
        void ctx.persistence.saveZone(mapId, saved);
      }
    },
    onAct(): void {},
    onArrive(): void {},
    onAttack(pid: PlayerId): void {
      if (!ready) return;
      const player = world.roster.players.get(pid);
      if (!player || player.moving || player.combat.dead) return;
      const actor = resolveActorCombat(world.proj, player.loadout?.actorId || 1, player.loadout);
      if (player.combat.attackCooldown > 0) return;
      if (startAttack(player.combat, player.dir, actor.windupFrames, actor.activeFrames, actor.recoveryFrames)) {
        player.combat.attackCooldown = actor.cooldown;
        record({ tick: world.tick, kind: "telegraph", source: player.id, target: 0, mapId, x: player.x, y: player.y, dir: player.dir, animationId: actor.telegraphAnimationId, sound: actor.telegraphSound });
      }
    },
    eventStates(): EventNetState[] {
      return events.map((rt) => ({ id: rt.ev.id, x: rt.x, y: rt.y, rx: rt.rx, ry: rt.ry, dir: rt.dir, moving: rt.moving, page: rt.pageIndex, erased: rt.erased, combat: rt.combat ? toCombatNetState(rt.combat) : undefined }));
    },
    drainCombatEvents(): CombatEvent[] { return eventStream.drain(); },
    snapshotData(): Record<string, JsonValue> {
      return {
        events: events.map((rt) => ({ id: rt.ev.id, x: rt.x, y: rt.y, erased: rt.erased, combat: rt.combat ? { ...toCombatNetState(rt.combat), hp: rt.combat.hp, maxHp: rt.combat.maxHp, respawn: rt.combat.respawn } : null })),
        combatLedger: ledger.toJSON() as unknown as JsonValue,
      };
    },
    restoreData(data: Record<string, JsonValue>): void {
      restoreRuntimeData(data);
    },
    noteExternalShared(): void {},
    onLeave(): void {},
    stop(): void { events.length = 0; world.evRTs = []; },
  };
}
