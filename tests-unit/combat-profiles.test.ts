/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from "vitest";
import { resolveActorCombat, resolveEnemyCombat, validateCombatProject } from "../src/shared/sim/combat-profiles";

const project: any = {
  system: { sounds: { combatHit: {} } },
  animations: [{ id: 2, name: "Slash" }],
  attackProfiles: [{ id: 4, name: "Practice slash", damage: 3, damageScale: 1, windupFrames: 2, activeFrames: 3, recoveryFrames: 4, range: 2 }],
  classes: [{ id: 1, base: { mhp: 80, atk: 5 } }],
  actors: [{ id: 1, name: "Hero", classId: 1, weaponId: 1, armorId: 1, combat: { profileId: 4, maxHp: 90 } }],
  weapons: [{ id: 1, name: "Sword", params: { atk: 7 }, combat: { range: 3, damageScale: 2 } }],
  armors: [{ id: 1, name: "Mail", params: { def: 2 }, combat: { invulnFrames: 30, staggerResistance: 25 } }],
  enemies: [{ id: 1, name: "Slime", stats: { mhp: 20 }, actionCombat: { profileId: 4, hp: 12, attackRange: 3 } }],
};

describe("action-combat profile resolution", () => {
  it("inherits enemy defaults and profile values while ignoring seeded page defaults", () => {
    const resolved = resolveEnemyCombat(project, { combat: {
      enabled: true, enemyId: 1, ai: "none", hp: 0, touchDamage: 0,
      knockbackTiles: 1, invulnFrames: 24, defeatSelfSwitch: "", inheritDefaults: true,
      attackCooldown: 45, attackWindupFrames: 0, attackActiveFrames: 1,
      attackRecoveryFrames: 0, attackRange: 1, staggerFrames: 10, respawnFrames: 0,
    } });
    expect(resolved).toMatchObject({ hp: 12, attackRange: 3, attackWindupFrames: 2, attackActiveFrames: 3, profileId: 4 });
  });

  it("combines class, actor, weapon, and armor combat data", () => {
    expect(resolveActorCombat(project, 1)).toMatchObject({ maxHp: 90, profileId: 4, range: 3, invulnFrames: 30, staggerResistance: 25 });
    expect(resolveActorCombat(project, 1).damage).toBe(30);
  });

  it("reports missing references and invalid authored values", () => {
    const issues = validateCombatProject({
      ...project,
      attackProfiles: [{ id: 7, name: "Bad", range: 0, activeFrames: 0, animationId: 99, attackSound: "missing" }],
      enemies: [{ id: 1, name: "Slime", stats: { mhp: 20 }, actionCombat: { profileId: 88 } }],
      maps: [{ id: 1, name: "Practice", events: [{ id: 2, name: "Enemy", pages: [{ combat: { enabled: true, enemyId: 99, profileId: 88, hp: -1, attackRange: 0, attackActiveFrames: 0 } }] }] }],
    });
    expect(issues.some((i) => /missing attack profile 88/.test(i.message))).toBe(true);
    expect(issues.some((i) => /missing animation 99/.test(i.message))).toBe(true);
    expect(issues.some((i) => /no valid enemy/.test(i.message))).toBe(true);
    expect(issues.some((i) => /invalid HP/.test(i.message))).toBe(true);
  });
});
