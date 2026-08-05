/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from "vitest";
import { CombatEventStream, knockbackStep, playerDamageFor, selectCombatTarget } from "../src/shared/sim/action-combat-adapter";
import { resolveActorCombat, sanitizePlayerLoadout } from "../src/shared/sim/combat-profiles";

const project: any = {
  attackProfiles: [{ id: 1, damage: 4, windupFrames: 1, activeFrames: 1, recoveryFrames: 1 }],
  classes: [{ id: 1, base: { mhp: 20, atk: 2 } }],
  actors: [{ id: 1, classId: 1, combat: { profileId: 1 } }],
  weapons: [{ id: 7, params: { atk: 10 }, combat: { profileId: 1 } }],
  armors: [{ id: 8, combat: {} }],
};

describe("unified authoritative action-combat adapter", () => {
  it("sanitizes loadouts and derives equipment damage", () => {
    const loadout = sanitizePlayerLoadout(project, { actorId: 1, level: 4, weaponId: 7, armorId: 8, weapon2Id: 999 });
    expect(loadout).toMatchObject({ actorId: 1, level: 4, weaponId: 7, armorId: 8 });
    expect(loadout.weapon2Id).toBeUndefined();
    expect(playerDamageFor(project, loadout, 0)).toBeGreaterThan(playerDamageFor(project, { actorId: 1 }, 0));
  });

  it("selects a stable target and emits ordered events", () => {
    const target = selectCombatTarget({ x: 0, y: 0 }, [
      { id: 9, x: 1, y: 0 },
      { id: 3, x: 0, y: 1 },
    ]);
    expect(target?.id).toBe(3);
    const stream = new CombatEventStream();
    stream.append({ tick: 1, kind: "telegraph", target: 3 });
    stream.append({ tick: 2, kind: "damage", target: 3, amount: 4 });
    expect(stream.drain().map((event) => event.seq)).toEqual([1, 2]);
  });

  it("stops knockback at collision and can chain clear steps", () => {
    const entity: any = { x: 1, y: 1 };
    const moved: number[] = [];
    const canStep = (x: number, y: number) => x <= 2 && y === 1;
    expect(knockbackStep(entity, 2, canStep, (dir) => moved.push(dir))).toBe(true);
    entity.x = 2;
    expect(knockbackStep(entity, 2, canStep, (dir) => moved.push(dir))).toBe(false);
    expect(moved).toEqual([2]);
  });

  it("applies level growth and authored armor HP to field combat", () => {
    const leveled = {
      ...project,
      classes: [{ id: 1, base: { mhp: 20, atk: 2 }, growth: { mhp: 5, atk: 3 } }],
      armors: [{ id: 8, params: { mhp: 7 }, combat: {} }],
    } as any;
    const levelOne = resolveActorCombat(leveled, 1, { actorId: 1, level: 1 });
    const levelFour = resolveActorCombat(leveled, 1, { actorId: 1, level: 4, armorId: 8 });
    expect(levelFour.maxHp).toBe(42); // 20 + (3 × 5) + 7
    expect(levelFour.damage).toBeGreaterThan(levelOne.damage);
  });
});
