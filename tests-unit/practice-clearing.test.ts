import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolveActorCombat, resolveEnemyCombat, validateCombatProject } from "../src/shared/sim/combat-profiles";

const fixture = JSON.parse(readFileSync(new URL("../tests/fixtures/practice-clearing-project.json", import.meta.url), "utf8"));

describe("Practice Clearing authored combat fixture", () => {
  it("uses database profiles, inherited enemy defaults, and respawning field enemies", () => {
    expect(validateCombatProject(fixture)).toEqual([]);
    expect(resolveActorCombat(fixture, 1)).toMatchObject({ maxHp: 30, profileId: 1 });
    expect(resolveEnemyCombat(fixture, fixture.maps[0].events[0].pages[0])).toMatchObject({ hp: 12, persistentDefeat: false, respawnFrames: 90, ai: "chase", profileId: 1 });
    expect(fixture.maps[0].events).toHaveLength(2);
    expect(fixture.maps[1].worldOrigin).toEqual({ x: 8, y: 0 });
  });
});
