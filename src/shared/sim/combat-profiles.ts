/* RPGAtlas — shared action-combat profile resolution and validation.
   This module is deliberately DOM-free so editor previews, solo play, Node,
   and Cloudflare can all resolve the same project data. */
/* eslint-disable @typescript-eslint/no-explicit-any */

import type {
  ActionCombat, Actor, AttackProfile, Enemy, Project, Weapon,
} from "../schema.js";

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
  animationId: number;
  telegraphAnimationId: number;
  hitAnimationId: number;
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
  damage: number;
  profileId: number;
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
  attackSound: string;
  hitSound: string;
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
    attackSound: String(p.attackSound || ""), telegraphSound: String(p.telegraphSound || ""),
    hitSound: String(p.hitSound || ""), hurtSound: String(p.hurtSound || ""),
    defeatSound: String(p.defeatSound || ""), reviveSound: String(p.reviveSound || ""),
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
  const profileId = Number(c.profileId ?? (inherited ? defaults.profileId : 0)) || 0;
  const profile = resolveAttackProfile(project, profileId);
  const base: any = inherited ? {
    ...profile,
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
    profileId, animationId: n(out.animationId, profile.animationId),
    telegraphAnimationId: n(out.telegraphAnimationId, profile.telegraphAnimationId),
    hitAnimationId: n(out.hitAnimationId, profile.hitAnimationId),
    attackSound: String(out.attackSound || profile.attackSound), telegraphSound: String(out.telegraphSound || profile.telegraphSound),
    hitSound: String(out.hitSound || profile.hitSound), hurtSound: String(out.hurtSound || profile.hurtSound),
    defeatSound: String(out.defeatSound || profile.defeatSound), reviveSound: String(out.reviveSound || profile.reviveSound),
  };
}

export function resolveActorCombat(project: Partial<Project>, actorId: number): ResolvedActorCombat {
  const actor = (project.actors || []).find((a) => Number(a.id) === Number(actorId)) as Actor | undefined;
  const cls = (project.classes || []).find((c) => Number(c.id) === Number(actor?.classId));
  const weaponIds = [actor?.weaponId, actor?.weapon2Id].filter((x): x is number => Number(x) > 0);
  const weapons = weaponIds.map((id) => (project.weapons || []).find((w) => Number(w.id) === Number(id)) as Weapon | undefined).filter(Boolean) as Weapon[];
  const armor = (project.armors || []).find((a) => Number(a.id) === Number(actor?.armorId));
  const ac: any = actor?.combat || {};
  const wc: any = weapons.find((w) => w.combat)?.combat || {};
  const arc: any = armor?.combat || {};
  const profileId = Number(ac.profileId ?? ac.attackProfileId ?? wc.profileId) || 0;
  const profile = resolveAttackProfile(project, profileId);
  const weaponAtk = weapons.reduce((sum, w) => sum + n(w.params?.atk, 0), 0);
  const classAtk = n(cls?.base?.atk, 0);
  // Legacy test projects and hand-authored prototypes often omit the actor
  // database entirely. Preserve the pre-profile action-combat feel with a
  // useful fallback strike instead of making every unconfigured swing deal 1.
  const baseDamage = actor ? profile.damage + classAtk + weaponAtk : 10;
  return {
    actorId, maxHp: n(ac.maxHp, n(cls?.base?.mhp, 100)),
    damage: n(ac.damage, baseDamage) * n(ac.damageScale ?? wc.damageScale ?? profile.damageScale, 1, 0, 100),
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
    reviveHp: n(ac.reviveHp ?? arc.reviveHp, Math.max(1, n(cls?.base?.mhp, 100) / 2)),
    defeatBehavior: String(ac.defeatBehavior || "checkpoint"),
    animationId: n(ac.animationId ?? wc.animationId, profile.animationId),
    hitAnimationId: n(ac.hitAnimationId ?? wc.hitAnimationId, profile.hitAnimationId),
    attackSound: String(ac.attackSound || wc.attackSound || profile.attackSound),
    hitSound: String(ac.hitSound || wc.hitSound || profile.hitSound),
  };
}

export interface CombatValidationIssue { where: string; message: string; severity: "error" | "warning"; mapId?: number; eventId?: number; }

export function validateCombatProject(project: Partial<Project>): CombatValidationIssue[] {
  const issues: CombatValidationIssue[] = [];
  const profiles = project.attackProfiles || [];
  const profileIds = new Set(profiles.map((p) => Number(p.id)));
  const animationIds = new Set((project.animations || []).map((a) => Number(a.id)));
  const soundIds = new Set(Object.keys((project.system as any)?.sounds || {}));
  for (const p of profiles) {
    const where = "Attack Profile: " + (p.name || p.id);
    if (Number(p.range ?? 1) < 1 || Number(p.activeFrames ?? 1) < 1) issues.push({ where, message: "Range and active frames must be at least 1", severity: "error" });
    for (const key of ["animationId", "telegraphAnimationId", "hitAnimationId", "hurtAnimationId", "defeatAnimationId", "reviveAnimationId"]) {
      const id = Number((p as any)[key] || 0); if (id && !animationIds.has(id)) issues.push({ where, message: key + " references missing animation " + id, severity: "error" });
    }
    for (const key of ["attackSound", "telegraphSound", "hitSound", "hurtSound", "defeatSound", "reviveSound"]) {
      const sound = String((p as any)[key] || ""); if (sound && soundIds.size && !soundIds.has(sound)) issues.push({ where, message: key + " references missing system sound " + sound, severity: "warning" });
    }
  }
  for (const enemy of project.enemies || []) {
    const p = enemy.actionCombat; if (!p) continue;
    if (p.profileId && !profileIds.has(Number(p.profileId))) issues.push({ where: "Enemy: " + enemy.name, message: "references missing attack profile " + p.profileId, severity: "error" });
  }
  for (const actor of project.actors || []) {
    const p = actor.combat; if (p?.profileId && !profileIds.has(Number(p.profileId))) issues.push({ where: "Actor: " + actor.name, message: "references missing attack profile " + p.profileId, severity: "error" });
  }
  for (const map of project.maps || []) for (const ev of map.events || []) for (const page of ev.pages || []) {
    const c = page.combat; if (!c?.enabled) continue;
    const where = map.name + " → " + (ev.name || ev.id);
    if (!c.enemyId || !(project.enemies || []).some((e) => Number(e.id) === Number(c.enemyId))) issues.push({ where, message: "Action Combat has no valid enemy", severity: "error", mapId: map.id, eventId: ev.id });
    if (c.profileId && !profileIds.has(Number(c.profileId))) issues.push({ where, message: "references missing attack profile " + c.profileId, severity: "error", mapId: map.id, eventId: ev.id });
    if (c.hp < 0 || Number(c.attackRange ?? 1) < 1 || Number(c.attackActiveFrames ?? 1) < 1) issues.push({ where, message: "has invalid HP, range, or active-frame values", severity: "error", mapId: map.id, eventId: ev.id });
  }
  return issues;
}
