import { describe, expect, it } from "vitest";
import {
  applyActionState, canUseActionAbility, resolveActionAbility, resolveActorHotbar,
  selectActionTargets, selectEnemyCombatAbility, spendActionAbility, tickActionCooldowns,
  tickActionStates,
} from "../src/shared/sim/combat-abilities";
import { validateCombatProject } from "../src/shared/sim/combat-profiles";

const project: any = {
  system: { sounds: {} },
  skills: [
    { id: 1, name: "Flame", power: 24, mp: 4, actionCombat: { enabled: true, windupFrames: 3, activeFrames: 2, cooldownFrames: 12, targetMode: "facing", damage: 24, mpCost: 4 } },
    { id: 2, name: "Disabled", actionCombat: { enabled: false } },
  ],
  items: [{ id: 5, name: "Potion", hp: 30, actionCombat: { enabled: true, targetMode: "self", cooldownFrames: 8, consumeOnStart: true } }],
  states: [{ id: 3, name: "Burn", actionCombat: { enabled: true, durationFrames: 4, tickIntervalFrames: 2, stacking: "stack", maxStacks: 2, damagePerTick: 5 } }],
  classes: [{ id: 1, name: "Mage", learnings: [{ level: 1, skillId: 1 }], actionCombat: { hotbar: [{ kind: "skill", id: 1 }, { kind: "item", id: 5 }], allowedSkillIds: [1] } }],
  actors: [{ id: 1, name: "Hero", classId: 1, combat: {} }],
  enemies: [{ id: 9, name: "Slime", stats: { mhp: 20 }, actionCombat: { abilities: [{ skillId: 1, weight: 2 }] } }],
};

describe("shared Action Combat abilities", () => {
  it("resolves optional skill/item profiles and actor hotbars", () => {
    expect(resolveActionAbility(project, "skill", 1)).toMatchObject({ id: 1, kind: "skill", mpCost: 4, cooldownFrames: 12 });
    expect(resolveActionAbility(project, "skill", 2)).toBeNull();
    expect(resolveActorHotbar(project, 1)).toEqual([
      { kind: "skill", id: 1 }, { kind: "item", id: 5 }, null, null, null, null, null, null,
    ]);
  });

  it("enforces resources and cooldowns, then ticks them down", () => {
    const ability = resolveActionAbility(project, "skill", 1)!;
    const resources: any = { mp: 4, tp: 0, cooldowns: {} };
    expect(canUseActionAbility(ability, resources)).toEqual({ ok: true });
    spendActionAbility(ability, resources);
    expect(resources).toMatchObject({ mp: 0, cooldowns: { "skill:1": 12 } });
    expect(canUseActionAbility(ability, resources).reason).toBe("cooldown");
    for (let i = 0; i < 12; i++) tickActionCooldowns(resources);
    expect(canUseActionAbility(ability, resources).reason).toBe("mp");
  });

  it("selects deterministic nearest/radius targets", () => {
    const source = { x: 2, y: 2, team: "ally" };
    const targets = [{ id: 1, x: 3, y: 2, team: "enemy" }, { id: 2, x: 4, y: 2, team: "enemy" }, { id: 3, x: 2, y: 3, team: "ally" }];
    expect(selectActionTargets(source, targets, "nearestEnemy", 3)[0].id).toBe(1);
    expect(selectActionTargets(source, targets, "radius", 2).map((target) => target.id)).toEqual([1, 2]);
  });

  it("stacks and ticks real-time states", () => {
    const effects: any[] = [];
    const profile: any = project.states[0].actionCombat;
    applyActionState(effects, 3, profile);
    applyActionState(effects, 3, profile);
    expect(effects[0].stacks).toBe(2);
    let out = tickActionStates(effects, { 3: profile });
    out = tickActionStates(out.effects, { 3: profile });
    expect(out.damage).toBe(5);
    expect(out.effects[0].remainingFrames).toBe(2);
  });

  it("selects enemy abilities by conditions and weight and diagnoses bad references", () => {
    const row = selectEnemyCombatAbility([{ skillId: 1, weight: 2, condition: { kind: "hpBelow", pct: 50 } }, { skillId: 1, weight: 1 }], { hpPct: 20 }, 0.1);
    expect(row?.skillId).toBe(1);
    const issues = validateCombatProject({ ...project, enemies: [{ ...project.enemies[0], actionCombat: { abilities: [{ skillId: 999, weight: 0 }] } }], actors: [{ ...project.actors[0], combat: { hotbar: [{ kind: "skill", id: 1 }, { kind: "skill", id: 1 }] } }] });
    expect(issues.some((issue) => issue.message.includes("missing skill 999"))).toBe(true);
    expect(issues.some((issue) => issue.message.includes("duplicates skill:1"))).toBe(true);
  });
});
