/* RPGAtlas — shared action-combat profile resolution and validation.
   This module is deliberately DOM-free so editor previews, solo play, Node,
   and Cloudflare can all resolve the same project data. */
/* eslint-disable @typescript-eslint/no-explicit-any */

import type {
  ActionCombat, Actor, AttackProfile, Enemy, Project, Weapon,
} from "../schema.js";
import type { PlayerLoadout } from "../net/protocol.js";
import type { CombatHitbox } from "./action-combat.js";

export interface ResolvedAttackProfile {
  id: number;
  name: string;
  damage: number;
  damageScale: number;
  windupFrames: number;
  activeFrames: number;
  recoveryFrames: number;
  cooldown: number;
  range: number;
  knockbackTiles: number;
  staggerFrames: number;
  hitbox: string;
  animationId: number;
  telegraphAnimationId: number;
  hitAnimationId: number;
  hurtAnimationId: number;
  defeatAnimationId: number;
  reviveAnimationId: number;
  attackSound: string;
  telegraphSound: string;
  hitSound: string;
  hurtSound: string;
  defeatSound: string;
  reviveSound: string;
}

export interface ResolvedEnemyCombat {
  enabled: boolean;
  enemyId: number;
  ai: string;
  hp: number;
  touchDamage: number;
  knockbackTiles: number;
  invulnFrames: number;
  defeatSelfSwitch: string;
  attackCooldown: number;
  attackWindupFrames: number;
  attackActiveFrames: number;
  attackRecoveryFrames: number;
  attackRange: number;
  staggerFrames: number;
  respawnFrames: number;
  persistentDefeat: boolean;
  profileId: number;
  hitbox: CombatHitbox;
  animationId: number;
  telegraphAnimationId: number;
  hitAnimationId: number;
  hurtAnimationId: number;
  defeatAnimationId: number;
  reviveAnimationId: number;
  attackSound: string;
  telegraphSound: string;
  hitSound: string;
  hurtSound: string;
  defeatSound: string;
  reviveSound: string;
}

export interface ResolvedActorCombat {
  actorId: number;
  maxHp: number;
  maxMp: number;
  maxTp: number;
  attackRate: number;
  defenseRate: number;
  damage: number;
  damageScale: number;
  profileId: number;
  hitbox: CombatHitbox;
  windupFrames: number;
  activeFrames: number;
  recoveryFrames: number;
  cooldown: number;
  range: number;
  knockbackTiles: number;
  staggerFrames: number;
  invulnFrames: number;
  staggerResistance: number;
  reviveFrames: number;
  reviveHp: number;
  defeatBehavior: string;
  animationId: number;
  hitAnimationId: number;
  telegraphAnimationId: number;
  hurtAnimationId: number;
  defeatAnimationId: number;
  reviveAnimationId: number;
  attackSound: string;
  telegraphSound: string;
  hitSound: string;
  hurtSound: string;
  defeatSound: string;
  reviveSound: string;
}

const DEFAULT_PROFILE: ResolvedAttackProfile = {
  id: 0, name: "Default attack", damage: 1, damageScale: 1,
  windupFrames: 3, activeFrames: 9, recoveryFrames: 6, cooldown: 0,
  range: 1, knockbackTiles: 1, staggerFrames: 10, hitbox: "directional",
  animationId: 0, telegraphAnimationId: 0, hitAnimationId: 0,
  hurtAnimationId: 0, defeatAnimationId: 0, reviveAnimationId: 0,
  attackSound: "", telegraphSound: "", hitSound: "", hurtSound: "",
  defeatSound: "", reviveSound: "",
};

function n(v: unknown, fallback: number, min = 0, max = 999999): number {
  const x = Number(v);
  return Number.isFinite(x) ? Math.max(min, Math.min(max, x)) : fallback;
}

export function resolveAttackProfile(project: Partial<Project>, id = 0): ResolvedAttackProfile {
  const raw = (project.attackProfiles || []).find((p) => Number(p.id) === Number(id)) as AttackProfile | undefined;
  const p = { ...DEFAULT_PROFILE, ...(raw || {}) } as any;
  return {
    id: n(p.id, 0), name: String(p.name || DEFAULT_PROFILE.name),
    damage: n(p.damage, DEFAULT_PROFILE.damage), damageScale: n(p.damageScale, 1, 0, 100),
    windupFrames: n(p.windupFrames, 3, 0, 180), activeFrames: n(p.activeFrames, 9, 1, 180),
    recoveryFrames: n(p.recoveryFrames, 6, 0, 600), cooldown: n(p.cooldown, 0, 0, 3600),
    range: n(p.range, 1, 1, 16), knockbackTiles: n(p.knockbackTiles, 1, 0, 8),
    staggerFrames: n(p.staggerFrames, 10, 0, 600), hitbox: String(p.hitbox || "directional"),
    animationId: n(p.animationId, 0), telegraphAnimationId: n(p.telegraphAnimationId, 0),
    hitAnimationId: n(p.hitAnimationId, 0), hurtAnimationId: n(p.hurtAnimationId, 0),
    defeatAnimationId: n(p.defeatAnimationId, 0), reviveAnimationId: n(p.reviveAnimationId, 0),
    attackSound: String(p.attackSound ?? ""), telegraphSound: String(p.telegraphSound ?? ""),
    hitSound: String(p.hitSound ?? ""), hurtSound: String(p.hurtSound ?? ""),
    defeatSound: String(p.defeatSound ?? ""), reviveSound: String(p.reviveSound ?? ""),
  };
}

/** Resolve an event page without changing the page's authored values. Page
 * overrides are applied only when `inheritDefaults` is true. Legacy pages keep
 * their existing values and therefore remain behavior-compatible. */
export function resolveEnemyCombat(project: Partial<Project>, page: { combat?: ActionCombat }): ResolvedEnemyCombat | null {
  const c = page.combat;
  if (!c || !c.enabled) return null;
  const enemy = (project.enemies || []).find((e) => Number(e.id) === Number(c.enemyId)) as Enemy | undefined;
  const defaults = enemy?.actionCombat || {};
  const inherited = c.inheritDefaults === true;
  const authoredProfileId = Number(c.profileId) || 0;
  const profileId = authoredProfileId > 0 ? authoredProfileId : (inherited ? Number(defaults.profileId) || 0 : 0);
  const profile = resolveAttackProfile(project, profileId);
  const base: any = inherited ? {
    ...profile,
    ...defaults,
    enabled: true, enemyId: c.enemyId, ai: defaults.ai ?? "none",
    hp: defaults.hp ?? enemy?.stats?.mhp ?? 100,
    touchDamage: defaults.touchDamage ?? profile.damage,
    knockbackTiles: defaults.knockbackTiles ?? profile.knockbackTiles,
    invulnFrames: defaults.invulnFrames ?? 24,
    defeatSelfSwitch: defaults.defeatSelfSwitch ?? "",
    attackCooldown: defaults.attackCooldown ?? profile.cooldown,
    attackWindupFrames: defaults.attackWindupFrames ?? profile.windupFrames,
    attackActiveFrames: defaults.attackActiveFrames ?? profile.activeFrames,
    attackRecoveryFrames: defaults.attackRecoveryFrames ?? profile.recoveryFrames,
    attackRange: defaults.attackRange ?? profile.range,
    staggerFrames: defaults.staggerFrames ?? profile.staggerFrames,
    respawnFrames: defaults.respawnFrames ?? 0,
    persistentDefeat: defaults.persistentDefeat ?? false,
  } : { ...profile, ...c };
  // New pages are seeded with the legacy editor defaults so they remain
  // immediately playable. Those seed values are not authored overrides while
  // inheritance is enabled; otherwise a page would silently replace a
  // database profile's timing/HP with the old page defaults on first render.
  const pageOverrides: any = { ...c };
  if (inherited) {
    const seededDefaults: Record<string, unknown> = {
      hp: 0, touchDamage: 0, knockbackTiles: 1, invulnFrames: 24,
      defeatSelfSwitch: "", attackCooldown: 45, attackWindupFrames: 0,
      attackActiveFrames: 1, attackRecoveryFrames: 0, attackRange: 1,
      staggerFrames: 10, respawnFrames: 0, ai: "none",
    };
    for (const [key, value] of Object.entries(seededDefaults)) {
      if (pageOverrides[key] === value) delete pageOverrides[key];
    }
    if (!Number(pageOverrides.profileId)) delete pageOverrides.profileId;
  }
  const out: any = { ...base, ...pageOverrides };
  return {
    enabled: true, enemyId: n(out.enemyId, 0), ai: String(out.ai || "none"),
    hp: n(out.hp, 100), touchDamage: n(out.touchDamage, profile.damage),
    knockbackTiles: n(out.knockbackTiles, 1, 0, 8), invulnFrames: n(out.invulnFrames, 24, 0, 600),
    defeatSelfSwitch: ["", "A", "B", "C", "D"].includes(String(out.defeatSelfSwitch || "")) ? String(out.defeatSelfSwitch || "") : "",
    attackCooldown: n(out.attackCooldown, profile.cooldown, 0, 3600),
    attackWindupFrames: n(out.attackWindupFrames, profile.windupFrames, 0, 180),
    attackActiveFrames: n(out.attackActiveFrames, profile.activeFrames, 1, 180),
    attackRecoveryFrames: n(out.attackRecoveryFrames, profile.recoveryFrames, 0, 600),
    attackRange: n(out.attackRange, profile.range, 1, 16), staggerFrames: n(out.staggerFrames, profile.staggerFrames, 0, 600),
    respawnFrames: n(out.respawnFrames, 0, 0, 36000), persistentDefeat: !!out.persistentDefeat,
    profileId, hitbox: String(out.hitbox || profile.hitbox), animationId: n(out.animationId, profile.animationId),
    telegraphAnimationId: n(out.telegraphAnimationId, profile.telegraphAnimationId),
    hitAnimationId: n(out.hitAnimationId, profile.hitAnimationId),
    hurtAnimationId: n(out.hurtAnimationId, profile.hurtAnimationId),
    defeatAnimationId: n(out.defeatAnimationId, profile.defeatAnimationId),
    reviveAnimationId: n(out.reviveAnimationId, profile.reviveAnimationId),
    attackSound: String(out.attackSound ?? profile.attackSound), telegraphSound: String(out.telegraphSound ?? profile.telegraphSound),
    hitSound: String(out.hitSound ?? profile.hitSound), hurtSound: String(out.hurtSound ?? profile.hurtSound),
    defeatSound: String(out.defeatSound ?? profile.defeatSound), reviveSound: String(out.reviveSound ?? profile.reviveSound),
  };
}

export function resolveActorCombat(project: Partial<Project>, actorId: number, requestedLoadout?: Partial<PlayerLoadout>): ResolvedActorCombat {
  const actor = (project.actors || []).find((a) => Number(a.id) === Number(actorId)) as Actor | undefined;
  const cls = (project.classes || []).find((c) => Number(c.id) === Number(actor?.classId));
  const weaponIds = [requestedLoadout?.weaponId ?? actor?.weaponId, requestedLoadout?.weapon2Id ?? actor?.weapon2Id]
    .filter((x): x is number => Number(x) > 0);
  const weapons = weaponIds.map((id) => (project.weapons || []).find((w) => Number(w.id) === Number(id)) as Weapon | undefined).filter(Boolean) as Weapon[];
  const armorId = requestedLoadout?.armorId ?? actor?.armorId;
  const armor = (project.armors || []).find((a) => Number(a.id) === Number(armorId));
  const ac: any = actor?.combat || {};
  const wc: any = weapons.find((w) => w.combat)?.combat || {};
  const arc: any = armor?.combat || {};
  const profileId = [ac.profileId, ac.attackProfileId, wc.profileId]
    .map((value) => Number(value) || 0)
    .find((value) => value > 0) || 0;
  const profile = resolveAttackProfile(project, profileId);
  const level = Math.max(1, Math.min(99, Number(requestedLoadout?.level ?? (actor as any)?.level) || 1));
  const classStat = (stat: string): number => {
    const base = n((cls as any)?.base?.[stat], 0);
    const growth = n((cls as any)?.growth?.[stat], 0);
    return base + growth * (level - 1);
  };
  const equipmentStat = (stat: string): number =>
    weapons.reduce((sum, w) => sum + n((w as any).params?.[stat], 0), 0) + n((armor as any)?.params?.[stat], 0);
  const effectiveStat = (stat: string): number => classStat(stat) + equipmentStat(stat);
  const classAtk = effectiveStat("atk");
  const authoredHp = n(ac.maxHp, 0);
  const maxHp = authoredHp > 0 ? authoredHp : Math.max(1, effectiveStat("mhp") || 100);
  const authoredMp = n(ac.maxMp, 0);
  const classCombat: any = (cls as any)?.actionCombat || {};
  const maxMp = authoredMp > 0 ? authoredMp : Math.max(0, n(classCombat.maxMp, effectiveStat("mmp"), 0, 999999));
  const maxTp = Math.max(1, n(ac.maxTp ?? classCombat.maxTp, 100, 1, 999));
  const attackRate = n(ac.attackRate ?? classCombat.attackRate, 1, 0, 2);
  const defenseRate = n(ac.defenseRate ?? classCombat.defenseRate, 1, 0, 2);
  // Legacy test projects and hand-authored prototypes often omit the actor
  // database entirely. Preserve the pre-profile action-combat feel with a
  // useful fallback strike instead of making every unconfigured swing deal 1.
  const baseDamage = actor ? profile.damage + classAtk : 10;
  const damageScale = n(ac.damageScale ?? wc.damageScale ?? profile.damageScale, 1, 0, 100);
  return {
    actorId, maxHp, maxMp, maxTp, attackRate, defenseRate,
    damage: n(ac.damage, baseDamage) * damageScale * attackRate,
    damageScale,
    profileId, windupFrames: n(ac.windupFrames ?? wc.windupFrames, profile.windupFrames, 0, 180),
    activeFrames: n(ac.activeFrames ?? wc.activeFrames, profile.activeFrames, 1, 180),
    recoveryFrames: n(ac.recoveryFrames ?? wc.recoveryFrames, profile.recoveryFrames, 0, 600),
    cooldown: n(ac.cooldown ?? wc.cooldown, profile.cooldown, 0, 3600),
    range: n(ac.range ?? wc.range, profile.range, 1, 16),
    knockbackTiles: n(ac.knockbackTiles ?? wc.knockbackTiles, profile.knockbackTiles, 0, 8),
    staggerFrames: n(ac.staggerFrames ?? wc.staggerFrames, profile.staggerFrames, 0, 600),
    invulnFrames: n(ac.invulnFrames ?? arc.invulnFrames, 60, 0, 600),
    staggerResistance: n(ac.staggerResistance ?? arc.staggerResistance, 0, 0, 100),
    reviveFrames: n(ac.reviveFrames ?? arc.reviveFrames, 0, 0, 36000),
    reviveHp: n(ac.reviveHp ?? arc.reviveHp, Math.max(1, maxHp / 2)),
    defeatBehavior: String(ac.defeatBehavior || "checkpoint"),
    hitbox: String(ac.hitbox ?? wc.hitbox ?? profile.hitbox),
    animationId: n(ac.animationId ?? wc.animationId, profile.animationId),
    hitAnimationId: n(ac.hitAnimationId ?? wc.hitAnimationId, profile.hitAnimationId),
    telegraphAnimationId: n(ac.telegraphAnimationId ?? wc.telegraphAnimationId, profile.telegraphAnimationId),
    hurtAnimationId: n(ac.hurtAnimationId ?? arc.hurtAnimationId, profile.hurtAnimationId),
    defeatAnimationId: n(ac.defeatAnimationId, profile.defeatAnimationId),
    reviveAnimationId: n(ac.reviveAnimationId ?? arc.reviveAnimationId, profile.reviveAnimationId),
    attackSound: String(ac.attackSound ?? wc.attackSound ?? profile.attackSound),
    telegraphSound: String(ac.telegraphSound ?? wc.telegraphSound ?? profile.telegraphSound),
    hitSound: String(ac.hitSound ?? wc.hitSound ?? profile.hitSound),
    hurtSound: String(ac.hurtSound ?? arc.hurtSound ?? profile.hurtSound),
    defeatSound: String(ac.defeatSound ?? profile.defeatSound),
    reviveSound: String(ac.reviveSound ?? arc.reviveSound ?? profile.reviveSound),
  };
}

export interface CombatValidationIssue { where: string; message: string; severity: "error" | "warning"; mapId?: number; eventId?: number; }

/** Clamp a client loadout to ids that exist in the project. Missing equipment
 * is intentionally represented by omission so legacy actors keep their
 * authored equipment defaults. */
export function sanitizePlayerLoadout(project: Partial<Project>, raw: Partial<PlayerLoadout> | null | undefined): PlayerLoadout {
  const actors = project.actors || [];
  const actor = actors.find((a) => Number(a.id) === Number(raw?.actorId)) || actors[0];
  const actorId = Number(actor?.id) || 1;
  const valid = (kind: "weapons" | "armors", id: unknown): number | undefined => {
    const nId = Number(id) || 0;
    return nId > 0 && (project[kind] || []).some((x: any) => Number(x.id) === nId) ? nId : undefined;
  };
  const out: PlayerLoadout = {
    actorId,
    level: Math.max(1, Math.min(99, Number(raw?.level) || 1)),
    row: raw?.row === "back" ? "back" : "front",
  };
  const weaponId = valid("weapons", raw?.weaponId);
  const weapon2Id = valid("weapons", raw?.weapon2Id);
  const armorId = valid("armors", raw?.armorId);
  if (weaponId) out.weaponId = weaponId;
  if (weapon2Id) out.weapon2Id = weapon2Id;
  if (armorId) out.armorId = armorId;
  return out;
}

export function validateCombatProject(project: Partial<Project>): CombatValidationIssue[] {
  const issues: CombatValidationIssue[] = [];
  const profiles = project.attackProfiles || [];
  const profileIds = new Set(profiles.map((p) => Number(p.id)));
  const animationIds = new Set((project.animations || []).map((a) => Number(a.id)));
  const soundIds = new Set(Object.keys((project.system as any)?.sounds || {}));
  const skillIds = new Set((project.skills || []).map((entry) => Number(entry.id)));
  const itemIds = new Set((project.items || []).map((entry) => Number(entry.id)));
  const stateIds = new Set((project.states || []).map((entry) => Number(entry.id)));
  const targetModes = new Set(["self", "facing", "nearestEnemy", "allEnemies", "nearestAlly", "allAllies", "radius"]);
  const checkReferences = (where: string, value: any, allowProfile = true): void => {
    const profileRef = value?.profileId ?? value?.attackProfileId;
    if (allowProfile && profileRef && !profileIds.has(Number(profileRef))) {
      issues.push({ where, message: "references missing attack profile " + profileRef, severity: "error" });
    }
    for (const key of ["animationId", "telegraphAnimationId", "hitAnimationId", "hurtAnimationId", "defeatAnimationId", "reviveAnimationId"]) {
      const id = Number(value?.[key] || 0);
      if (id && !animationIds.has(id)) issues.push({ where, message: key + " references missing animation " + id, severity: "error" });
    }
    for (const key of ["attackSound", "telegraphSound", "hitSound", "hurtSound", "defeatSound", "reviveSound"]) {
      const sound = String(value?.[key] || "");
      if (sound && !soundIds.has(sound)) issues.push({ where, message: key + " references missing system sound " + sound, severity: "warning" });
    }
  };
  const checkNumbers = (where: string, value: any, ranges: Record<string, [number, number]>): void => {
    for (const [key, [min, max]] of Object.entries(ranges)) {
      if (value?.[key] == null) continue;
      const number = Number(value[key]);
      if (!Number.isFinite(number) || number < min || number > max) {
        issues.push({ where, message: key + " must be between " + min + " and " + max, severity: "error" });
      }
    }
  };
  const checkAction = (where: string, value: any, kind: "skill" | "item"): void => {
    if (!value || value.enabled === false) return;
    checkReferences(where, value, false);
    checkNumbers(where, value, {
      windupFrames: [0, 180], activeFrames: [1, 180], recoveryFrames: [0, 600], cooldownFrames: [0, 3600],
      range: [1, 16], mpCost: [0, 999999], tpCost: [0, 999999], damage: [0, 999999], damageScale: [0, 100],
      knockbackTiles: [0, 8], staggerFrames: [0, 600], stateChance: [0, 100],
    });
    if (value.targetMode && !targetModes.has(String(value.targetMode))) issues.push({ where, message: "has impossible target mode " + value.targetMode, severity: "error" });
    if (value.stateId && !stateIds.has(Number(value.stateId))) issues.push({ where, message: "references missing state " + value.stateId, severity: "error" });
    if (kind === "item" && value.consumeOnStart === false && Number(value.cooldownFrames || 0) === 0) {
      issues.push({ where, message: "item does not consume and has no cooldown; it can be used every frame", severity: "warning" });
    }
  };
  const checkHotbar = (where: string, hotbar: any, actorSkills?: Set<number>): void => {
    if (!Array.isArray(hotbar)) return;
    const seen = new Set<string>();
    hotbar.slice(0, 8).forEach((slot: any, index: number) => {
      const kind = String(slot?.kind || "");
      const id = Number(slot?.id) || 0;
      const key = kind + ":" + id;
      if (!kind || !id) return;
      if (seen.has(key)) issues.push({ where, message: "hotbar slot " + (index + 1) + " duplicates " + key, severity: "warning" });
      seen.add(key);
      if (kind === "skill") {
        if (!skillIds.has(id)) issues.push({ where, message: "hotbar slot " + (index + 1) + " references missing skill " + id, severity: "error" });
        else if (!project.skills!.find((skill) => Number(skill.id) === id)?.actionCombat?.enabled) issues.push({ where, message: "hotbar skill " + id + " is not Action Combat enabled", severity: "error" });
        if (actorSkills && !actorSkills.has(id)) issues.push({ where, message: "hotbar skill " + id + " is unavailable to this actor/class", severity: "error" });
      } else if (kind === "item") {
        if (!itemIds.has(id)) issues.push({ where, message: "hotbar slot " + (index + 1) + " references missing item " + id, severity: "error" });
        else if (!project.items!.find((item) => Number(item.id) === id)?.actionCombat?.enabled) issues.push({ where, message: "hotbar item " + id + " is not Action Combat enabled", severity: "error" });
      } else if (id) issues.push({ where, message: "hotbar slot " + (index + 1) + " has invalid kind", severity: "error" });
    });
  };
  const attackRanges: Record<string, [number, number]> = {
    damage: [0, 999999], damageScale: [0, 100], windupFrames: [0, 180], activeFrames: [1, 180],
    recoveryFrames: [0, 600], cooldown: [0, 3600], range: [1, 16], knockbackTiles: [0, 8], staggerFrames: [0, 600],
  };
  const enemyRanges: Record<string, [number, number]> = {
    hp: [0, 999999], touchDamage: [0, 999999], knockbackTiles: [0, 8], invulnFrames: [0, 600],
    attackCooldown: [0, 3600], attackWindupFrames: [0, 180], attackActiveFrames: [1, 180], attackRecoveryFrames: [0, 600],
    attackRange: [1, 16], staggerFrames: [0, 600], respawnFrames: [0, 36000],
  };
  for (const p of profiles) {
    const where = "Attack Profile: " + (p.name || p.id);
    checkNumbers(where, p, attackRanges);
    checkReferences(where, p, false);
  }
  for (const skill of project.skills || []) checkAction("Skill: " + skill.name, skill.actionCombat, "skill");
  for (const item of project.items || []) checkAction("Item: " + item.name, item.actionCombat, "item");
  for (const state of project.states || []) if (state.actionCombat) {
    const where = "State: " + state.name;
    checkNumbers(where, state.actionCombat, { durationFrames: [1, 36000], tickIntervalFrames: [1, 36000], maxStacks: [1, 99], damagePerTick: [-999999, 999999], resistance: [0, 100] });
    if (state.actionCombat.enabled && Number(state.actionCombat.tickIntervalFrames || 1) > Number(state.actionCombat.durationFrames || 1)) issues.push({ where, message: "tick interval exceeds state duration", severity: "warning" });
  }
  for (const cls of project.classes || []) {
    const allowed = new Set((cls.actionCombat?.allowedSkillIds || []).map(Number));
    for (const id of allowed) if (!skillIds.has(id)) issues.push({ where: "Class: " + cls.name, message: "allowed skill list references missing skill " + id, severity: "error" });
    checkHotbar("Class: " + cls.name, cls.actionCombat?.hotbar, allowed.size ? allowed : undefined);
  }
  for (const enemy of project.enemies || []) {
    const p = enemy.actionCombat; if (!p) continue;
    const where = "Enemy: " + enemy.name;
    checkReferences(where, p);
    checkNumbers(where, p, enemyRanges);
    if (Number(p.attackRange ?? 1) < 1 || Number(p.attackActiveFrames ?? 1) < 1) issues.push({ where, message: "has invalid attack range or active-frame values", severity: "error" });
    if (p.persistentDefeat && Number(p.respawnFrames || 0) > 0) issues.push({ where, message: "Persistent Defeat overrides respawn; set respawn frames to 0", severity: "warning" });
    for (const ability of p.abilities || []) {
      if (!skillIds.has(Number(ability.skillId))) issues.push({ where, message: "ability references missing skill " + ability.skillId, severity: "error" });
      else if (!project.skills!.find((skill) => Number(skill.id) === Number(ability.skillId))?.actionCombat?.enabled) issues.push({ where, message: "ability skill " + ability.skillId + " is not Action Combat enabled", severity: "error" });
      checkNumbers(where, ability, { weight: [1, 999], cooldownFrames: [0, 3600] });
      if (ability.targetMode && !targetModes.has(String(ability.targetMode))) issues.push({ where, message: "ability has impossible target mode " + ability.targetMode, severity: "error" });
    }
  }
  for (const actor of project.actors || []) {
    const p = actor.combat;
    const where = "Actor: " + actor.name;
    if (actor.weaponId && !(project.weapons || []).some((w) => Number(w.id) === Number(actor.weaponId))) issues.push({ where, message: "references missing weapon " + actor.weaponId, severity: "error" });
    if (actor.weapon2Id && !(project.weapons || []).some((w) => Number(w.id) === Number(actor.weapon2Id))) issues.push({ where, message: "references missing second weapon " + actor.weapon2Id, severity: "error" });
    if (actor.armorId && !(project.armors || []).some((a) => Number(a.id) === Number(actor.armorId))) issues.push({ where, message: "references missing armor " + actor.armorId, severity: "error" });
    if (!p) continue;
    checkReferences(where, p);
    checkNumbers(where, p, { ...attackRanges, maxHp: [1, 999999], invulnFrames: [0, 600], staggerResistance: [0, 100], reviveFrames: [0, 36000], reviveHp: [1, 999999] });
    const cls = (project.classes || []).find((entry) => Number(entry.id) === Number(actor.classId));
    const learned = new Set<number>([
      ...(cls?.learnings || []).filter((learning) => Number(learning.level) <= Number(actor.level || 1)).map((learning) => Number(learning.skillId)),
      ...(((actor as any).skills || []).map(Number)),
    ]);
    checkHotbar(where, p.hotbar, learned.size ? learned : undefined);
  }
  for (const weapon of project.weapons || []) if (weapon.combat) {
    checkReferences("Weapon: " + weapon.name, weapon.combat);
    checkNumbers("Weapon: " + weapon.name, weapon.combat, attackRanges);
  }
  for (const armor of project.armors || []) if (armor.combat) {
    checkReferences("Armor: " + armor.name, armor.combat);
    checkNumbers("Armor: " + armor.name, armor.combat, { invulnFrames: [0, 600], staggerResistance: [0, 100], reviveFrames: [0, 36000], reviveHp: [1, 999999] });
  }
  for (const map of project.maps || []) for (const ev of map.events || []) for (const page of ev.pages || []) {
    const c = page.combat; if (!c?.enabled) continue;
    const where = map.name + " → " + (ev.name || ev.id);
    if (!c.enemyId || !(project.enemies || []).some((e) => Number(e.id) === Number(c.enemyId))) issues.push({ where, message: "Action Combat has no valid enemy", severity: "error", mapId: map.id, eventId: ev.id });
    checkReferences(where, c);
    checkNumbers(where, c, enemyRanges);
    if (c.hp < 0 || Number(c.attackRange ?? 1) < 1 || Number(c.attackActiveFrames ?? 1) < 1) issues.push({ where, message: "has invalid HP, range, or active-frame values", severity: "error", mapId: map.id, eventId: ev.id });
    if (c.persistentDefeat && Number(c.respawnFrames || 0) > 0) issues.push({ where, message: "Persistent Defeat overrides respawn; set respawn frames to 0", severity: "warning", mapId: map.id, eventId: ev.id });
  }
  const systemCombat: any = (project.system as any)?.actionCombat;
  if (systemCombat) {
    checkNumbers("System: Action Combat", systemCombat, { hotbarSlots: [1, 8] });
    if (systemCombat.enabled && systemCombat.hotbarSlots == null) issues.push({ where: "System: Action Combat", message: "enabled combat should define hotbar slots", severity: "warning" });
  }
  for (const map of project.maps || []) if (map.actionCombat) {
    const where = "Map: " + map.name;
    checkNumbers(where, map.actionCombat, { hotbarSlots: [1, 8] });
    if (map.actionCombat.targetingMode && !["facing", "nearest"].includes(String(map.actionCombat.targetingMode))) issues.push({ where, message: "has impossible targeting mode " + map.actionCombat.targetingMode, severity: "error" });
  }
  return issues;
}
