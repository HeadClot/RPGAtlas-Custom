import { describe, expect, it } from "vitest";
import {
  applyHurt,
  attackHitsEntity,
  attackIsActive,
  createCombatState,
  markDead,
  normalizeActionCombat,
  respawnIfReady,
  startAttack,
  swordHitboxAt,
  swordHitsEntity,
  tickAttack,
  toCombatNetState,
} from "../src/shared/sim/action-combat";

describe("shared action combat", () => {
  it("normalizes legacy action-combat pages without changing their defaults", () => {
    expect(normalizeActionCombat({ enabled: true, enemyId: 7, hp: 20, touchDamage: 3, knockbackTiles: 1, invulnFrames: 24, defeatSelfSwitch: "" })).toMatchObject({
      enabled: true,
      enemyId: 7,
      hp: 20,
      touchDamage: 3,
      attackCooldown: 45,
      attackWindupFrames: 0,
      attackActiveFrames: 1,
      attackRange: 1,
      staggerFrames: 10,
    });
  });

  it("runs a directional attack through windup, active, and recovery", () => {
    const state = createCombatState();
    expect(startAttack(state, 2, 2, 3, 2)).toBe(true);
    expect(state.phase).toBe("windup");
    tickAttack(state, 2, 3);
    expect(state.phase).toBe("windup");
    tickAttack(state, 2, 3);
    expect(attackIsActive(state)).toBe(true);
    tickAttack(state, 2, 3);
    expect(attackIsActive(state)).toBe(true);
    tickAttack(state, 2, 3);
    expect(attackIsActive(state)).toBe(true);
    tickAttack(state, 2, 3);
    expect(state.phase).toBe("recovery");
    tickAttack(state, 2, 3);
    expect(state.phase).toBe("recovery");
    tickAttack(state, 2, 3);
    expect(state.phase).toBe("idle");
  });

  it("rejects a second attack while the first attack is active", () => {
    const state = createCombatState();
    expect(startAttack(state, 0)).toBe(true);
    expect(startAttack(state, 0)).toBe(false);
  });

  it("preserves the existing directional sword geometry", () => {
    expect(swordHitboxAt(2, 3, 2)).toEqual({ x: 2.86, y: 3.14, w: 0.62, h: 0.78 });
    expect(swordHitsEntity(
      { x: 2, y: 3, rx: 2, ry: 3 },
      { x: 3, y: 3, rx: 3, ry: 3 },
      2,
    )).toBe(true);
    expect(swordHitsEntity(
      { x: 2, y: 3, rx: 2, ry: 3 },
      { x: 4, y: 3, rx: 4, ry: 3 },
      2,
    )).toBe(false);
  });

  it("resolves authored directional, adjacent, and radius hitboxes", () => {
    const attacker = { x: 2, y: 3, rx: 2, ry: 3 };
    expect(attackHitsEntity(attacker, { x: 4, y: 3, rx: 4, ry: 3 }, 2, "directional", 2)).toBe(true);
    expect(attackHitsEntity(attacker, { x: 2, y: 2, rx: 2, ry: 2 }, 2, "adjacent", 1)).toBe(true);
    expect(attackHitsEntity(attacker, { x: 3, y: 4, rx: 3, ry: 4 }, 2, "adjacent", 1)).toBe(false);
    expect(attackHitsEntity(attacker, { x: 3, y: 4, rx: 3, ry: 4 }, 2, "radius", 2)).toBe(true);
    expect(attackHitsEntity(attacker, { x: 5, y: 3, rx: 5, ry: 3 }, 2, "radius", 2)).toBe(false);
  });

  it("applies invulnerability and stagger monotonically", () => {
    const state = createCombatState();
    applyHurt(state, 24, 10);
    applyHurt(state, 6, 2);
    expect(state.invuln).toBe(24);
    expect(state.stagger).toBe(10);
    expect(state.phase).toBe("hurt");
  });

  it("serializes authoritative state without the runtime hit registry", () => {
    const state = createCombatState();
    startAttack(state, 3, 0, 9, 6);
    state.hitIds.add(99);
    const wire = toCombatNetState(state);
    expect(wire).toMatchObject({ phase: "active", dir: 3, attackId: 1 });
    expect((wire as unknown as { hitIds?: unknown }).hitIds).toBeUndefined();
  });

  it("marks defeated actors dead and records an optional respawn timer", () => {
    const state = createCombatState();
    markDead(state, 2);
    expect(state.dead).toBe(true);
    expect(state.phase).toBe("dead");
    expect(state.respawn).toBe(2);
    tickAttack(state);
    expect(respawnIfReady(state)).toBe(false);
    tickAttack(state);
    expect(respawnIfReady(state)).toBe(true);
    expect(state.phase).toBe("idle");
    expect(state.dead).toBe(false);
  });
});
