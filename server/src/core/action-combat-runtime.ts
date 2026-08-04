/* RPGAtlas — Cloudflare-safe field action-combat runtime.
   This adapter intentionally implements only the DOM-free combat layer. Full
   event/interpreter behavior remains in the Node engine adapter, while both
   adapters share profiles, geometry, timing, persistence, and outcomes. */
/* eslint-disable @typescript-eslint/no-explicit-any */

import type { JsonValue, PlayerId } from "../../../src/shared/net/protocol.js";
import {
  applyHurt, attackIsActive, createCombatState, markDead, respawnIfReady,
  swordHitsEntity, startAttack, tickAttack, toCombatNetState,
} from "../../../src/shared/sim/action-combat.js";
import { CombatLedger } from "../../../src/shared/sim/combat-persistence.js";
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
  const events: any[] = [];

  const cfgOf = (rt: any): ResolvedEnemyCombat | null => rt.page ? resolveEnemyCombat(world.proj, { combat: rt.page.combat }) : null;
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
    const actor = resolveActorCombat(world.proj, 1);
    const enemy = (world.proj.enemies || []).find((e: any) => Number(e.id) === Number(cfg.enemyId));
    const def = Number(enemy?.stats?.def) || 0;
    const amount = Math.max(1, Math.floor(actor.damage * 1.35 - def * 0.6));
    rt.combat.hp = Math.max(0, Number(rt.combat.hp || cfg.hp) - amount);
    applyHurt(rt.combat, cfg.invulnFrames, cfg.staggerFrames);
    ledger.append({ tick: world.tick, kind: "hit", source: player.id, target: rt.ev.id, mapId, eventId: rt.ev.id, attackId: player.combat.attackId });
    ledger.append({ tick: world.tick, kind: "damage", source: player.id, target: rt.ev.id, mapId, eventId: rt.ev.id, amount, attackId: player.combat.attackId });
    if (rt.combat.hp <= 0) {
      markDead(rt.combat, cfg.respawnFrames);
      ledger.append({ tick: world.tick, kind: "defeat", target: rt.ev.id, mapId, eventId: rt.ev.id });
      if (cfg.defeatSelfSwitch) world.g.selfSw[mapId + ":" + rt.ev.id + ":" + cfg.defeatSelfSwitch] = true;
      if (!cfg.respawnFrames && !cfg.defeatSelfSwitch) rt.erased = true;
    }
  }

  function damagePlayer(rt: any, player: any, cfg: ResolvedEnemyCombat): void {
    if (player.combat.dead || player.combat.invuln > 0 || rt.combat.hitIds.has(player.id)) return;
    rt.combat.hitIds.add(player.id);
    const amount = Math.max(0, cfg.touchDamage);
    player.hp = Math.max(0, Number(player.hp || player.maxHp || 100) - amount);
    applyHurt(player.combat, 60, cfg.staggerFrames);
    ledger.append({ tick: world.tick, kind: "damage", source: rt.ev.id, target: player.id, mapId, eventId: rt.ev.id, amount, attackId: rt.combat.attackId });
    if (player.hp <= 0) {
      markDead(player.combat, 300); player.revive = 300;
      ledger.append({ tick: world.tick, kind: "playerDeath", source: rt.ev.id, target: player.id, mapId, eventId: rt.ev.id });
    }
  }

  return {
    capabilities: { actionCombat: true, persistence: !!ctx.persistence },
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
    },
    tick(): void {
      for (const player of world.roster.players.values()) {
        if (player.combat.dead) {
          tickAttack(player.combat, 0, 0);
          if (respawnIfReady(player.combat)) {
            const actor = resolveActorCombat(world.proj, 1);
            player.hp = actor.reviveHp; player.revive = 0;
            ledger.append({ tick: world.tick, kind: "revive", target: player.id, mapId });
          }
          continue;
        }
        if (attackIsActive(player.combat)) {
          for (const rt of events) if (!rt.erased && rt.combat && !rt.combat.dead && !player.combat.hitIds.has(rt.ev.id) && swordHitsEntity(player, rt, player.combat.dir)) {
            player.combat.hitIds.add(rt.ev.id); damageEvent(player, rt);
          }
        }
        tickAttack(player.combat, 3, 9);
      }
      for (const rt of events) {
        const cfg = cfgOf(rt); if (!cfg || !rt.combat) continue;
        if (rt.combat.dead) {
          tickAttack(rt.combat, cfg.attackWindupFrames, cfg.attackActiveFrames);
          if (cfg.respawnFrames > 0 && respawnIfReady(rt.combat)) {
            rt.combat.hp = cfg.hp; rt.erased = false;
            ledger.append({ tick: world.tick, kind: "respawn", target: rt.ev.id, mapId, eventId: rt.ev.id });
          }
          continue;
        }
        const target = [...world.roster.players.values()].find((p) => !p.combat.dead && Math.abs(p.x - rt.x) + Math.abs(p.y - rt.y) <= cfg.attackRange);
        if (rt.combat.phase === "idle" && rt.combat.attackCooldown <= 0 && target && cfg.touchDamage > 0) {
          rt.dir = dirTo(rt.x, rt.y, target.x, target.y);
          rt.combat.hitIds.clear();
          startAttack(rt.combat, rt.dir, cfg.attackWindupFrames, cfg.attackActiveFrames, cfg.attackRecoveryFrames);
          rt.combat.attackCooldown = cfg.attackCooldown;
        }
        if (attackIsActive(rt.combat)) for (const player of world.roster.players.values()) {
          if (Math.abs(player.x - rt.x) + Math.abs(player.y - rt.y) <= cfg.attackRange) damagePlayer(rt, player, cfg);
        }
        tickAttack(rt.combat, cfg.attackWindupFrames, cfg.attackActiveFrames);
      }
    },
    onAct(): void {},
    onArrive(): void {},
    onAttack(pid: PlayerId): void {
      const player = world.roster.players.get(pid);
      if (!player || player.moving || player.combat.dead) return;
      const actor = resolveActorCombat(world.proj, 1);
      startAttack(player.combat, player.dir, actor.windupFrames, actor.activeFrames, actor.recoveryFrames);
    },
    eventStates(): EventNetState[] {
      return events.map((rt) => ({ id: rt.ev.id, x: rt.x, y: rt.y, rx: rt.rx, ry: rt.ry, dir: rt.dir, moving: rt.moving, page: rt.pageIndex, erased: rt.erased, combat: rt.combat ? toCombatNetState(rt.combat) : undefined }));
    },
    snapshotData(): Record<string, JsonValue> {
      return {
        events: events.map((rt) => ({ id: rt.ev.id, x: rt.x, y: rt.y, erased: rt.erased, combat: rt.combat ? { ...toCombatNetState(rt.combat), hp: rt.combat.hp, maxHp: rt.combat.maxHp, respawn: rt.combat.respawn } : null })),
        combatLedger: ledger.toJSON() as unknown as JsonValue,
      };
    },
    restoreData(data: Record<string, JsonValue>): void {
      if (Array.isArray(data.combatLedger)) {
        for (const row of data.combatLedger as any[]) ledger.append(row);
      }
      const byId = new Map(events.map((rt) => [rt.ev.id, rt]));
      for (const saved of (data.events as any[]) || []) {
        const rt = byId.get(saved.id); if (!rt) continue;
        rt.x = rt.tx = saved.x; rt.y = rt.ty = saved.y; rt.erased = !!saved.erased;
        if (saved.combat && rt.combat) Object.assign(rt.combat, saved.combat, { hitIds: new Set() });
      }
    },
    noteExternalShared(): void {},
    onLeave(): void {},
    stop(): void { events.length = 0; world.evRTs = []; },
  };
}
