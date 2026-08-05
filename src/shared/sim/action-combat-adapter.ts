/* RPGAtlas — shared authoritative field-combat adapter helpers.
   The adapter is deliberately data-only: runtimes provide movement and
   presentation sinks, while target choice, damage resolution, event ordering,
   and knockback rules stay identical in browser, Node, and Cloudflare. */

import type { PlayerId } from "../net/protocol.js";
import type { Project } from "../schema.js";
import { resolveActorCombat, type ResolvedActorCombat, type ResolvedEnemyCombat } from "./combat-profiles.js";
import type { CombatEvent } from "./combat-persistence.js";

export interface CombatPosition { id?: number | string; x: number; y: number; }

export class CombatEventStream {
  private next = 1;
  private readonly pending: CombatEvent[] = [];
  private readonly history: CombatEvent[] = [];

  constructor(initial: CombatEvent[] = []) {
    for (const event of initial) {
      const seq = Number(event.seq) || this.next++;
      this.next = Math.max(this.next, seq + 1);
      this.history.push({ ...event, seq });
    }
  }

  append(event: Omit<CombatEvent, "seq"> | CombatEvent): CombatEvent {
    const seq = Number((event as CombatEvent).seq) > 0 ? Number((event as CombatEvent).seq) : this.next++;
    const row = { ...event, seq } as CombatEvent;
    this.next = Math.max(this.next, seq + 1);
    this.pending.push(row);
    this.history.push(row);
    if (this.history.length > 1024) this.history.splice(0, this.history.length - 1024);
    return row;
  }

  drain(): CombatEvent[] {
    return this.pending.splice(0, this.pending.length);
  }

  cursor(): number { return this.next - 1; }
  historyRows(): CombatEvent[] { return this.history.map((event) => ({ ...event })); }
}

/** Stable nearest-player selection. Ties resolve to the lowest numeric id so
 *  two authorities fed the same world always choose the same target. */
export function selectCombatTarget<T extends CombatPosition>(enemy: CombatPosition, players: Iterable<T>, maxDistance = Infinity): T | null {
  let selected: T | null = null;
  let selectedDistance = Infinity;
  for (const player of players) {
    const distance = Math.abs(player.x - enemy.x) + Math.abs(player.y - enemy.y);
    if (distance > maxDistance) continue;
    const id = Number(player.id ?? Number.MAX_SAFE_INTEGER);
    const selectedId = Number(selected?.id ?? Number.MAX_SAFE_INTEGER);
    if (distance < selectedDistance || (distance === selectedDistance && id < selectedId)) {
      selected = player;
      selectedDistance = distance;
    }
  }
  return selected;
}

export function actorCombatFor(project: Partial<Project>, loadout: { actorId: number; level?: number; weaponId?: number; weapon2Id?: number; armorId?: number }): ResolvedActorCombat {
  return resolveActorCombat(project, Number(loadout.actorId) || 1, loadout);
}

export function playerDamageFor(project: Partial<Project>, loadout: { actorId: number; level?: number; weaponId?: number; weapon2Id?: number; armorId?: number }, enemyDef = 0): number {
  const actor = actorCombatFor(project, loadout);
  return Math.max(1, Math.floor(actor.damage * 1.35 - Math.max(0, Number(enemyDef) || 0) * 0.6));
}

/** Attempt a single collision-tested knockback step. The caller repeats this
 * after each completed movement step for multi-tile knockback. */
export function knockbackStep(
  entity: CombatPosition,
  dir: number,
  canStep: (x: number, y: number) => boolean,
  startMove: (dir: number) => void,
): boolean {
  const offsets: Record<number, [number, number]> = {
    0: [0, 1], 1: [-1, 0], 2: [1, 0], 3: [0, -1],
    4: [-1, 1], 5: [1, 1], 6: [-1, -1], 7: [1, -1],
  };
  const [dx, dy] = offsets[Number(dir)] || [0, 0];
  if (dx && dy && (!canStep(entity.x + dx, entity.y) || !canStep(entity.x, entity.y + dy))) return false;
  if (!canStep(entity.x + dx, entity.y + dy)) return false;
  startMove(dir);
  return true;
}

export function combatEventPosition(entity: CombatPosition): Pick<CombatEvent, "x" | "y"> {
  return { x: Number(entity.x) || 0, y: Number(entity.y) || 0 };
}

export type { ResolvedActorCombat, ResolvedEnemyCombat };
export type CombatTargetId = PlayerId | string;
