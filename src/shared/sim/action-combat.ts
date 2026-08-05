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

export function swordHitsEntity(
  attacker: { x: number; y: number; rx: number; ry: number },
  target: { x: number; y: number; rx: number; ry: number },
  dir: number,
): boolean {
  if (rectsOverlap(swordHitboxAt(attacker.rx, attacker.ry, dir), entityHurtbox(target))) return true;
  const [dx, dy] = [[0, 1], [-1, 0], [1, 0], [0, -1], [-1, 1], [1, 1], [-1, -1], [1, -1]][dir] || [0, 0];
  return target.x === attacker.x + dx && target.y === attacker.y + dy;
}
