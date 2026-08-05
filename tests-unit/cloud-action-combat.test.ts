/* Cloudflare-safe action-combat adapter: the same Zone contract used by the
 * Durable Object can be driven headlessly in the unit pool. */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from "vitest";
import { Zone, type ZoneOutbox } from "../server/src/core/zone";
import { createCloudActionCombatRuntime } from "../server/src/core/action-combat-runtime";
import { DEFAULT_WORLD_LIMITS } from "../server/src/core/config";

const project: any = {
  system: { startMapId: 1, startX: 1, startY: 1, startDir: "down" },
  attackProfiles: [{ id: 1, name: "Practice slash", damage: 4, windupFrames: 0, activeFrames: 1, recoveryFrames: 0, range: 1 }],
  classes: [{ id: 1, base: { mhp: 20, atk: 1 } }],
  actors: [{ id: 1, name: "Hero", classId: 1, combat: { profileId: 1 } }],
  enemies: [{ id: 1, name: "Slime", stats: { mhp: 4, def: 0 }, actionCombat: { profileId: 1, hp: 4, touchDamage: 0, persistentDefeat: true, defeatSelfSwitch: "A" } }],
  maps: [{
    id: 1, width: 8, height: 8, layers: { ground: new Array(64).fill(1) },
    events: [{
      id: 1, name: "Practice Slime", x: 2, y: 1,
      pages: [{ trigger: "action", dir: 1, combat: {
        enabled: true, enemyId: 1, inheritDefaults: true, ai: "none", hp: 0,
        touchDamage: 0, knockbackTiles: 1, invulnFrames: 24, defeatSelfSwitch: "",
        attackCooldown: 45, attackWindupFrames: 0, attackActiveFrames: 1,
        attackRecoveryFrames: 0, attackRange: 1, staggerFrames: 10, respawnFrames: 0,
      } }],
    }],
  }],
};

function outbox(): ZoneOutbox {
  return { send() {}, sendMany() {}, transferOut() {}, sharedSet() {}, recordPatch() {} };
}

describe("Cloudflare action-combat simulation adapter", () => {
  it("does not admit action input before durable restore completes", async () => {
    let release!: () => void;
    const restore = new Promise<null>((resolve) => { release = () => resolve(null); });
    const persistence = {
      loadPlayer: async () => null,
      savePlayer: async () => {},
      loadZone: () => restore,
      saveZone: async () => {},
    };
    const z = new Zone(1, project, outbox(), { limits: DEFAULT_WORLD_LIMITS, runtimeFactory: (ctx) => createCloudActionCombatRuntime({ ...ctx, persistence }) });
    z.admit(1, "Riko", "", 1, 1, 2, false);
    z.frame(1, { t: "input", seq: 1, intent: { k: "attack" } });
    expect(z.world.roster.players.get(1)!.combat.phase).toBe("idle");
    release();
    await new Promise((resolve) => setTimeout(resolve, 0));
    z.frame(1, { t: "input", seq: 2, intent: { k: "attack" } });
    expect(z.world.roster.players.get(1)!.combat.phase).toBe("active");
    z.stop();
  });

  it("authoritatively defeats an enemy and restores its snapshot", () => {
    const first = new Zone(1, project, outbox(), { limits: DEFAULT_WORLD_LIMITS, runtimeFactory: createCloudActionCombatRuntime });
    first.admit(1, "Riko", "", 1, 1, 2, false);
    first.frame(1, { t: "input", seq: 1, intent: { k: "attack" } });
    first.tick();
    expect(first.eventStates()[0].combat?.dead).toBe(true);
    const savedPlayer = first.world.roster.players.get(1)!;
    savedPlayer.hp = 0;
    savedPlayer.revive = 60;
    savedPlayer.combat.dead = true;
    savedPlayer.combat.phase = "dead";
    const saved = first.snapshot();
    first.stop();

    const second = new Zone(1, project, outbox(), { limits: DEFAULT_WORLD_LIMITS, runtimeFactory: createCloudActionCombatRuntime });
    second.restore(saved);
    second.admit(9, "Riko", "", 1, 1, 2, false);
    expect(second.eventStates()[0].combat?.dead).toBe(true);
    expect(second.world.roster.players.get(9)).toMatchObject({ hp: 0, revive: 60, combat: { dead: true } });
    second.stop();
  });
});
