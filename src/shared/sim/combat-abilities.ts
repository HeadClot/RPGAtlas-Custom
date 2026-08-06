/* Shared real-time Action Combat ability rules.
 *
 * This module intentionally has no editor, browser, Node, or Cloudflare
 * dependencies. The editor uses it for previews/diagnostics and each runtime
 * uses the same normalization, cost, cooldown, target, and state rules. */

import type {
  ActionAbilityProfile, ActionStateProfile, ActionTargetMode, CombatHotbarSlot,
  CombatStateEffect, EnemyCombatAbility, Project, Skill, Item,
} from "../schema.js";

export type ActionKind = "skill" | "item";

export interface ResolvedActionAbility extends ActionAbilityProfile {
  kind: ActionKind;
  id: number;
  name: string;
  windupFrames: number;
  activeFrames: number;
  recoveryFrames: number;
  cooldownFrames: number;
  range: number;
  hitbox: "directional" | "adjacent" | "radius" | string;
  targetMode: ActionTargetMode;
  mpCost: number;
  tpCost: number;
  damage: number;
  damageScale: number;
  knockbackTiles: number;
  staggerFrames: number;
  stateChance: number;
  consumeOnStart: boolean;
}

export interface ActionResources {
  mp: number;
  maxMp?: number;
  tp: number;
  maxTp?: number;
  cooldowns?: Record<string, number>;
}

export interface AbilityUseCheck {
  ok: boolean;
  reason?: "disabled" | "missing" | "unavailable" | "cooldown" | "mp" | "tp" | "items";
  remaining?: number;
}

export interface ActionTarget {
  id: number | string;
  x: number;
  y: number;
  team?: "ally" | "enemy" | string;
  hp?: number;
  dead?: boolean;
}

const DEFAULT_ABILITY: Required<Pick<ResolvedActionAbility,
  "windupFrames" | "activeFrames" | "recoveryFrames" | "cooldownFrames" | "range" |
  "hitbox" | "targetMode" | "mpCost" | "tpCost" | "damage" | "damageScale" |
  "knockbackTiles" | "staggerFrames" | "stateChance" | "consumeOnStart">> = {
  windupFrames: 0, activeFrames: 1, recoveryFrames: 0, cooldownFrames: 0,
  range: 1, hitbox: "directional", targetMode: "facing", mpCost: 0, tpCost: 0,
  damage: 0, damageScale: 1, knockbackTiles: 0, staggerFrames: 0,
  stateChance: 100, consumeOnStart: true,
};

function number(value: unknown, fallback: number, min = 0, max = 999999): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}

function record(project: Partial<Project>, kind: ActionKind, id: number): Skill | Item | undefined {
  const list = kind === "skill" ? project.skills : project.items;
  return (list || []).find((entry) => Number(entry.id) === Number(id));
}

/** Resolve an explicitly action-enabled shared Skill or Item record. */
export function resolveActionAbility(project: Partial<Project>, kind: ActionKind, id: number): ResolvedActionAbility | null {
  const source = record(project, kind, id);
  const authored = source?.actionCombat;
  if (!source || !authored || authored.enabled === false) return null;
  const p: any = { ...DEFAULT_ABILITY, ...authored };
  return {
    ...authored,
    kind,
    id: Number(id),
    name: String(source.name || (kind === "skill" ? "Skill" : "Item")),
    windupFrames: number(p.windupFrames, DEFAULT_ABILITY.windupFrames, 0, 180),
    activeFrames: number(p.activeFrames, DEFAULT_ABILITY.activeFrames, 1, 180),
    recoveryFrames: number(p.recoveryFrames, DEFAULT_ABILITY.recoveryFrames, 0, 600),
    cooldownFrames: number(p.cooldownFrames, DEFAULT_ABILITY.cooldownFrames, 0, 3600),
    range: number(p.range, DEFAULT_ABILITY.range, 1, 16),
    hitbox: String(p.hitbox || DEFAULT_ABILITY.hitbox),
    targetMode: String(p.targetMode || DEFAULT_ABILITY.targetMode),
    mpCost: number(p.mpCost ?? (kind === "skill" ? source.mp : 0), 0, 0, 999999),
    tpCost: number(p.tpCost ?? (kind === "skill" ? (source as Skill).tpCost : 0), 0, 0, 999999),
    damage: number(p.damage ?? (kind === "skill" ? (source as Skill).power : 0), 0, 0, 999999),
    damageScale: number(p.damageScale, DEFAULT_ABILITY.damageScale, 0, 100),
    knockbackTiles: number(p.knockbackTiles, DEFAULT_ABILITY.knockbackTiles, 0, 8),
    staggerFrames: number(p.staggerFrames, DEFAULT_ABILITY.staggerFrames, 0, 600),
    stateChance: number(p.stateChance, DEFAULT_ABILITY.stateChance, 0, 100),
    consumeOnStart: p.consumeOnStart !== false,
  };
}

export function actionAbilityKey(kind: ActionKind, id: number): string {
  return kind + ":" + Number(id);
}

/** Merge class defaults with actor overrides and always return eight stable
 * slots. Empty/invalid entries are omitted rather than silently becoming an
 * accidental Skill 0. */
export function resolveActorHotbar(project: Partial<Project>, actorId: number, slots = 8): Array<CombatHotbarSlot | null> {
  const actor = (project.actors || []).find((a) => Number(a.id) === Number(actorId));
  const cls = (project.classes || []).find((c) => Number(c.id) === Number(actor?.classId));
  const source = actor?.combat?.hotbar || cls?.actionCombat?.hotbar || [];
  const allowed = new Set((cls?.actionCombat?.allowedSkillIds || []).map(Number));
  const learned = new Set<number>([
    ...(cls?.learnings || []).filter((learning) => Number(learning.level) <= Number(actor?.level || 1)).map((learning) => Number(learning.skillId)),
    ...(((actor as any)?.skills || []).map(Number)),
  ]);
  return Array.from({ length: Math.max(1, Math.min(8, Number(slots) || 8)) }, (_, index) => {
    const row = source[index];
    if (!row || !["skill", "item"].includes(String(row.kind)) || Number(row.id) <= 0) return null;
    const item = record(project, row.kind as ActionKind, Number(row.id));
    if (!item?.actionCombat || item.actionCombat.enabled === false) return null;
    if (row.kind === "skill" && allowed.size && !allowed.has(Number(row.id))) return null;
    if (row.kind === "skill" && learned.size && !learned.has(Number(row.id))) return null;
    return { kind: row.kind as ActionKind, id: Number(row.id) };
  });
}

export function canUseActionAbility(
  ability: ResolvedActionAbility | null,
  resources: ActionResources,
  kind: ActionKind = ability?.kind || "skill",
  inventoryCount = 1,
): AbilityUseCheck {
  if (!ability) return { ok: false, reason: "missing" };
  if (ability.enabled === false) return { ok: false, reason: "disabled" };
  const remaining = Number(resources.cooldowns?.[actionAbilityKey(kind, ability.id)] || 0);
  if (remaining > 0) return { ok: false, reason: "cooldown", remaining };
  if (resources.mp < ability.mpCost) return { ok: false, reason: "mp" };
  if (resources.tp < ability.tpCost) return { ok: false, reason: "tp" };
  if (kind === "item" && inventoryCount < 1) return { ok: false, reason: "items" };
  return { ok: true };
}

export function spendActionAbility(ability: ResolvedActionAbility, resources: ActionResources, kind = ability.kind): void {
  resources.mp = Math.max(0, Number(resources.mp) - ability.mpCost);
  resources.tp = Math.max(0, Number(resources.tp) - ability.tpCost);
  const cooldowns = resources.cooldowns || (resources.cooldowns = {});
  cooldowns[actionAbilityKey(kind, ability.id)] = ability.cooldownFrames;
}

export function tickActionCooldowns(resources: ActionResources): void {
  for (const key of Object.keys(resources.cooldowns || {})) {
    const left = Math.max(0, Number(resources.cooldowns?.[key]) - 1);
    if (left) resources.cooldowns![key] = left;
    else delete resources.cooldowns![key];
  }
}

/** Target selection is deterministic: ties keep source order. */
export function selectActionTargets(
  source: { x: number; y: number; team?: string },
  candidates: ActionTarget[],
  mode: ActionTargetMode,
  range = 1,
): ActionTarget[] {
  const distance = (target: ActionTarget) => Math.abs(target.x - source.x) + Math.abs(target.y - source.y);
  const valid = candidates.filter((target) => !target.dead && (target.x !== source.x || target.y !== source.y));
  if (mode === "self") return [];
  if (mode === "allEnemies") return valid.filter((target) => target.team !== source.team);
  if (mode === "allAllies") return candidates.filter((target) => target.team === source.team && !target.dead);
  const pool = mode === "nearestAlly" ? valid.filter((target) => target.team === source.team) : valid.filter((target) => target.team !== source.team);
  const inRange = pool.filter((target) => distance(target) <= Math.max(1, Math.floor(Number(range) || 1)));
  if (mode === "radius") return inRange;
  return inRange.sort((a, b) => distance(a) - distance(b))[0] ? [inRange.sort((a, b) => distance(a) - distance(b))[0]] : [];
}

export function enemyAbilityConditionMet(
  row: EnemyCombatAbility,
  context: { hpPct?: number; distance?: number; states?: number[]; switches?: Record<number, boolean> },
): boolean {
  const condition = row.condition;
  if (!condition || condition.kind === "always") return true;
  if (condition.kind === "hpBelow") return Number(context.hpPct) <= Number(condition.pct ?? 100);
  if (condition.kind === "hpAbove") return Number(context.hpPct) >= Number(condition.pct ?? 0);
  if (condition.kind === "distanceBelow") return Number(context.distance) <= Number(condition.distance ?? 1);
  if (condition.kind === "distanceAbove") return Number(context.distance) >= Number(condition.distance ?? 1);
  if (condition.kind === "stateSelf") return !!context.states?.includes(Number(condition.stateId));
  if (condition.kind === "switch") return !!context.switches?.[Number(condition.switchId)];
  return false;
}

/** Weighted deterministic selection. Pass a seeded/random value from the
 * caller; the shared function itself never touches Math.random. */
export function selectEnemyCombatAbility(
  rows: EnemyCombatAbility[],
  context: Parameters<typeof enemyAbilityConditionMet>[1],
  roll = 0,
): EnemyCombatAbility | null {
  const valid = rows.filter((row) => Number(row.weight) > 0 && enemyAbilityConditionMet(row, context));
  const total = valid.reduce((sum, row) => sum + Number(row.weight), 0);
  if (!total) return null;
  let cursor = ((Number(roll) % 1) + 1) % 1 * total;
  for (const row of valid) {
    cursor -= Number(row.weight);
    if (cursor < 0) return row;
  }
  return valid[valid.length - 1] || null;
}

export function applyActionState(
  effects: CombatStateEffect[],
  stateId: number,
  profile: ActionStateProfile,
): CombatStateEffect[] {
  if (!profile.enabled || Number(stateId) <= 0) return effects;
  const duration = Math.max(1, Math.floor(Number(profile.durationFrames) || 1));
  const existing = effects.find((effect) => Number(effect.stateId) === Number(stateId));
  const stacking = String(profile.stacking || "refresh");
  if (!existing) effects.push({ stateId: Number(stateId), remainingFrames: duration, tickFrames: Math.max(1, Number(profile.tickIntervalFrames) || duration), stacks: 1 });
  else if (stacking === "stack" && (existing.stacks || 1) < Math.max(1, Number(profile.maxStacks) || 1)) existing.stacks = (existing.stacks || 1) + 1;
  else if (stacking === "refresh" || stacking === "stack") existing.remainingFrames = duration;
  else if (stacking === "replace") { existing.remainingFrames = duration; existing.stacks = 1; }
  return effects;
}

export function tickActionStates(
  effects: CombatStateEffect[],
  states: Partial<Record<number, ActionStateProfile>>,
): { effects: CombatStateEffect[]; damage: number } {
  let damage = 0;
  const keep: CombatStateEffect[] = [];
  for (const effect of effects) {
    const profile = states[Number(effect.stateId)];
    if (!profile?.enabled) continue;
    effect.remainingFrames -= 1;
    effect.tickFrames = Math.max(0, Number(effect.tickFrames || profile.tickIntervalFrames || 1) - 1);
    if (effect.tickFrames === 0) {
      damage += Number(profile.damagePerTick) || 0;
      effect.tickFrames = Math.max(1, Number(profile.tickIntervalFrames) || 1);
    }
    if (effect.remainingFrames > 0) keep.push(effect);
  }
  return { effects: keep, damage };
}
