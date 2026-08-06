/* RPGAtlas — shared deterministic field-combat primitives.
   This module intentionally has no DOM, renderer, audio, or engine imports. It
   owns the timing and geometry contract used by solo play and authoritative
   multiplayer runtimes. GPL-3.0-or-later. */

import type { GridDir } from "../net/protocol.js";

export type CombatPhase = "idle" | "windup" | "active" | "recovery" | "hurt" | "dead";

export interface ActionCombatConfig {
  enabled: boolean;
  enemyId: number;
  ai: "none" | "chase" | string;
  hp: number;
  touchDamage: number;
  knockbackTiles: number;
  invulnFrames: number;
  defeatSelfSwitch: "" | "A" | "B" | "C" | "D" | string;
  /** Enemy contact attack cadence. 0 keeps the legacy immediate-touch path. */
  attackCooldown?: number;
  /** Enemy attack telegraph before its contact hit becomes active. */
  attackWindupFrames?: number;
  /** Active contact window. */
  attackActiveFrames?: number;
  /** Recovery after an enemy attack. */
  attackRecoveryFrames?: number;
  /** Manhattan/tile range used by authoritative contact attacks. */
  attackRange?: number;
  /** Stagger applied when this enemy is hit. */
  staggerFrames?: number;
  /** Optional delayed respawn for authored persistent enemies. */
  respawnFrames?: number;
  /** Keep a defeated event defeated across persisted map reloads. */
  persistentDefeat?: boolean;
  /** Reusable attack geometry. */
  hitbox?: "directional" | "adjacent" | "radius" | string;
  animationId?: number;
  telegraphAnimationId?: number;
  hitAnimationId?: number;
  hurtAnimationId?: number;
  defeatAnimationId?: number;
  reviveAnimationId?: number;
  attackSound?: string;
  telegraphSound?: string;
  hitSound?: string;
  hurtSound?: string;
  defeatSound?: string;
  reviveSound?: string;
}

export interface CombatState {
  phase: CombatPhase;
  dir: GridDir | number;
  framesLeft: number;
  totalFrames: number;
  attackId: number;
  /** Runtime-only hit registry; never serialized directly. */
  hitIds: Set<number | string>;
  invuln: number;
  hurtFlash: number;
  stagger: number;
  attackCooldown: number;
  dead: boolean;
  respawn: number;
  /** Remaining authoritative knockback steps and their direction. */
  knockback?: number;
  knockbackDir?: number;
  /** Action-RPG resource/cooldown state. Optional so legacy combat snapshots
   * remain byte-compatible while no abilities are authored. */
  resourceCooldowns: Record<string, number>;
  activeAbilityId: number;
  activeAbilityKind: "skill" | "item" | null;
  states: import("../schema.js").CombatStateEffect[];
}

export interface CombatNetState {
  phase: CombatPhase;
  dir: number;
  framesLeft: number;
  totalFrames: number;
  attackId: number;
  invuln: number;
  stagger: number;
  dead: boolean;
  hurtFlash: number;
  resourceCooldowns: Record<string, number>;
  activeAbilityId: number;
  activeAbilityKind: "skill" | "item" | null;
  states: Array<{ stateId: number; remainingFrames: number; tickFrames: number; stacks: number }>;
}

export const DEFAULT_ACTION_COMBAT: Omit<ActionCombatConfig, "enabled" | "enemyId" | "ai" | "hp" | "touchDamage" | "knockbackTiles" | "invulnFrames" | "defeatSelfSwitch"> = {
  attackCooldown: 45,
  attackWindupFrames: 0,
  attackActiveFrames: 1,
  attackRecoveryFrames: 0,
  attackRange: 1,
  staggerFrames: 10,
  respawnFrames: 0,
};

export function normalizeActionCombat(source: Partial<ActionCombatConfig> | null | undefined): ActionCombatConfig {
  const s = source || {};
  return {
    enabled: !!s.enabled,
    enemyId: Math.max(0, Number(s.enemyId) || 0),
    ai: typeof s.ai === "string" ? s.ai : "none",
    hp: Math.max(0, Number(s.hp) || 0),
    touchDamage: Math.max(0, Number(s.touchDamage) || 0),
    knockbackTiles: Math.max(0, Math.min(8, Number(s.knockbackTiles) || 0)),
    invulnFrames: Math.max(0, Number(s.invulnFrames) || 0),
    defeatSelfSwitch: ["", "A", "B", "C", "D"].includes(String(s.defeatSelfSwitch || ""))
      ? String(s.defeatSelfSwitch || "")
      : "",
    attackCooldown: Math.max(0, Number(s.attackCooldown ?? DEFAULT_ACTION_COMBAT.attackCooldown) || 0),
    attackWindupFrames: Math.max(0, Number(s.attackWindupFrames ?? DEFAULT_ACTION_COMBAT.attackWindupFrames) || 0),
    attackActiveFrames: Math.max(1, Number(s.attackActiveFrames ?? DEFAULT_ACTION_COMBAT.attackActiveFrames) || 1),
    attackRecoveryFrames: Math.max(0, Number(s.attackRecoveryFrames ?? DEFAULT_ACTION_COMBAT.attackRecoveryFrames) || 0),
    attackRange: Math.max(1, Number(s.attackRange ?? DEFAULT_ACTION_COMBAT.attackRange) || 1),
    staggerFrames: Math.max(0, Number(s.staggerFrames ?? DEFAULT_ACTION_COMBAT.staggerFrames) || 0),
    respawnFrames: Math.max(0, Number(s.respawnFrames ?? DEFAULT_ACTION_COMBAT.respawnFrames) || 0),
    persistentDefeat: !!s.persistentDefeat,
    hitbox: typeof s.hitbox === "string" ? s.hitbox : "directional",
    animationId: Math.max(0, Number(s.animationId) || 0),
    telegraphAnimationId: Math.max(0, Number(s.telegraphAnimationId) || 0),
    hitAnimationId: Math.max(0, Number(s.hitAnimationId) || 0),
    hurtAnimationId: Math.max(0, Number(s.hurtAnimationId) || 0),
    defeatAnimationId: Math.max(0, Number(s.defeatAnimationId) || 0),
    reviveAnimationId: Math.max(0, Number(s.reviveAnimationId) || 0),
    attackSound: String(s.attackSound ?? ""),
    telegraphSound: String(s.telegraphSound ?? ""),
    hitSound: String(s.hitSound ?? ""),
    hurtSound: String(s.hurtSound ?? ""),
    defeatSound: String(s.defeatSound ?? ""),
    reviveSound: String(s.reviveSound ?? ""),
  };
}

export function createCombatState(): CombatState {
  return {
    phase: "idle",
    dir: 0,
    framesLeft: 0,
    totalFrames: 0,
    attackId: 0,
    hitIds: new Set(),
    invuln: 0,
    hurtFlash: 0,
    stagger: 0,
    attackCooldown: 0,
    dead: false,
    respawn: 0,
    knockback: 0,
    knockbackDir: 0,
    resourceCooldowns: {},
    activeAbilityId: 0,
    activeAbilityKind: null,
    states: [],
  };
}

export function attackFrame(state: Pick<CombatState, "framesLeft" | "totalFrames" | "phase">): number {
  return state.totalFrames > 0 ? state.totalFrames - state.framesLeft : 999;
}

export function attackIsActive(state: Pick<CombatState, "framesLeft" | "totalFrames" | "phase">): boolean {
  return state.phase === "active";
}

export function startAttack(state: CombatState, dir: number, windup = 3, active = 9, recovery = 6): boolean {
  if (state.dead || state.phase !== "idle" || state.stagger > 0) return false;
  const w = Math.max(0, windup | 0), a = Math.max(1, active | 0), r = Math.max(0, recovery | 0);
  state.dir = dir;
  state.framesLeft = w + a + r;
  state.totalFrames = state.framesLeft;
  state.attackId += 1;
  state.hitIds.clear();
  state.phase = w > 0 ? "windup" : "active";
  return true;
}

export function tickAttack(state: CombatState, windup = 3, active = 9): void {
  if (state.invuln > 0) state.invuln--;
  if (state.hurtFlash > 0) state.hurtFlash--;
  if (state.stagger > 0) state.stagger--;
  if (state.attackCooldown > 0) state.attackCooldown--;
  if (state.phase === "idle") return;
  if (state.phase === "hurt") {
    if (state.stagger <= 0) state.phase = "idle";
    return;
  }
  if (state.phase === "dead") {
    if (state.respawn > 0) state.respawn--;
    return;
  }
  state.framesLeft--;
  const elapsed = attackFrame(state);
  if (elapsed < windup) state.phase = "windup";
  else if (elapsed < windup + active) state.phase = "active";
  else if (state.framesLeft > 0) state.phase = "recovery";
  else {
    state.phase = "idle";
    state.framesLeft = 0;
    state.totalFrames = 0;
  }
}

/** Complete a delayed respawn and reset transient combat state. Returns true
 *  only on the tick the state becomes alive again; the owning simulation is
 *  responsible for restoring its HP/resource values. */
export function respawnIfReady(state: CombatState): boolean {
  if (!state.dead || state.respawn !== 0) return false;
  state.dead = false;
  state.phase = "idle";
  state.framesLeft = 0;
  state.totalFrames = 0;
  state.invuln = 0;
  state.hurtFlash = 0;
  state.stagger = 0;
  state.attackCooldown = 0;
  state.knockback = 0;
  state.knockbackDir = 0;
  state.hitIds.clear();
  return true;
}

export function applyHurt(state: CombatState, invulnFrames: number, staggerFrames: number): void {
  if (state.dead) return;
  state.invuln = Math.max(state.invuln, Math.max(0, invulnFrames | 0));
  state.stagger = Math.max(state.stagger, Math.max(0, staggerFrames | 0));
  state.hurtFlash = 12;
  state.phase = "hurt";
}

export function markDead(state: CombatState, respawnFrames = 0): void {
  state.dead = true;
  state.phase = "dead";
  state.framesLeft = 0;
  state.totalFrames = 0;
  state.respawn = Math.max(0, respawnFrames | 0);
  state.knockback = 0;
  state.knockbackDir = 0;
}

export function toCombatNetState(state: CombatState): CombatNetState {
  return {
    phase: state.phase,
    dir: Number(state.dir) || 0,
    framesLeft: state.framesLeft,
    totalFrames: state.totalFrames,
    attackId: state.attackId,
    invuln: state.invuln,
    stagger: state.stagger,
    dead: state.dead,
    hurtFlash: state.hurtFlash,
    resourceCooldowns: { ...(state.resourceCooldowns || {}) },
    activeAbilityId: Number(state.activeAbilityId) || 0,
    activeAbilityKind: state.activeAbilityKind || null,
    states: (state.states || []).map((s) => ({ stateId: s.stateId, remainingFrames: s.remainingFrames, tickFrames: Number(s.tickFrames) || 0, stacks: Number(s.stacks) || 1 })),
  };
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export interface Rect { x: number; y: number; w: number; h: number; }

export function entityHurtbox(ent: { rx: number; ry: number }): Rect {
  return { x: ent.rx + 0.12, y: ent.ry + 0.10, w: 0.76, h: 0.86 };
}

export function swordHitboxAt(x: number, y: number, dir: number): Rect {
  if (dir === 6) return { x: x - 0.34, y: y - 0.34, w: 0.82, h: 0.82 };
  if (dir === 7) return { x: x + 0.52, y: y - 0.34, w: 0.82, h: 0.82 };
  if (dir === 4) return { x: x - 0.34, y: y + 0.52, w: 0.82, h: 0.82 };
  if (dir === 5) return { x: x + 0.52, y: y + 0.52, w: 0.82, h: 0.82 };
  if (dir === 3) return { x: x + 0.10, y: y - 0.48, w: 0.80, h: 0.62 };
  if (dir === 1) return { x: x - 0.48, y: y + 0.14, w: 0.62, h: 0.78 };
  if (dir === 2) return { x: x + 0.86, y: y + 0.14, w: 0.62, h: 0.78 };
  return { x: x + 0.10, y: y + 0.86, w: 0.80, h: 0.62 };
}

export type CombatHitbox = "directional" | "adjacent" | "radius" | string;

const CARDINAL_DIRS = [0, 1, 2, 3] as const;
const DIR_OFFSETS: Record<number, [number, number]> = {
  0: [0, 1], 1: [-1, 0], 2: [1, 0], 3: [0, -1],
  4: [-1, 1], 5: [1, 1], 6: [-1, -1], 7: [1, -1],
};

function tileOffset(dir: number, distance: number): [number, number] {
  const [dx, dy] = DIR_OFFSETS[Number(dir)] || [0, 1];
  return [dx * distance, dy * distance];
}

/** Return the hit rectangles used by one authored attack. Directional attacks
 * retain the original sword geometry at range 1 and extend that geometry
 * along the facing direction for larger ranges. */
export function attackHitboxesAt(x: number, y: number, dir: number, hitbox: CombatHitbox = "directional", range = 1): Rect[] {
  const r = Math.max(1, Math.floor(Number(range) || 1));
  if (hitbox === "radius") return [];
  if (hitbox === "adjacent") {
    return CARDINAL_DIRS.map((d) => swordHitboxAt(x, y, d));
  }
  const out: Rect[] = [];
  for (let distance = 1; distance <= r; distance++) {
    const [dx, dy] = tileOffset(dir, distance - 1);
    out.push(swordHitboxAt(x + dx, y + dy, dir));
  }
  return out;
}

/** Shared authored hit test. Radius attacks use the documented Manhattan
 * diamond; adjacent attacks cover the four immediate cardinal tiles; the
 * default directional path remains the legacy sword collider. */
export function attackHitsEntity(
  attacker: { x: number; y: number; rx: number; ry: number },
  target: { x: number; y: number; rx: number; ry: number },
  dir: number,
  hitbox: CombatHitbox = "directional",
  range = 1,
): boolean {
  const distance = Math.abs(target.x - attacker.x) + Math.abs(target.y - attacker.y);
  if (hitbox === "radius") return distance > 0 && distance <= Math.max(1, Math.floor(Number(range) || 1));
  if (hitbox === "adjacent") {
    return distance === 1 && CARDINAL_DIRS.some((d) => {
      const [dx, dy] = tileOffset(d, 1);
      return target.x === attacker.x + dx && target.y === attacker.y + dy;
    });
  }
  if (attackHitboxesAt(attacker.rx, attacker.ry, dir, hitbox, range).some((box) => rectsOverlap(box, entityHurtbox(target)))) return true;
  const [dx, dy] = tileOffset(dir, 1);
  for (let step = 1; step <= Math.max(1, Math.floor(Number(range) || 1)); step++) {
    if (target.x === attacker.x + dx * step && target.y === attacker.y + dy * step) return true;
  }
  return false;
}

export function swordHitsEntity(
  attacker: { x: number; y: number; rx: number; ry: number },
  target: { x: number; y: number; rx: number; ry: number },
  dir: number,
): boolean {
  return attackHitsEntity(attacker, target, dir, "directional", 1);
}
