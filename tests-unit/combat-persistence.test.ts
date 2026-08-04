import { describe, expect, it } from "vitest";
import { CombatLedger, KeyValueCombatPersistence } from "../src/shared/sim/combat-persistence";

describe("combat persistence contract", () => {
  it("keeps sequence order and trims the gameplay ledger to 1024 rows", () => {
    const ledger = new CombatLedger();
    for (let i = 0; i < 1030; i++) ledger.append({ tick: i, kind: "hit", source: 1, target: 2 });
    expect(ledger.length).toBe(1024);
    expect(ledger.toJSON()[0].tick).toBe(6);
    expect(ledger.toJSON().at(-1)?.seq).toBe(1030);
  });

  it("round-trips player and zone state through the shared KV adapter", async () => {
    const values = new Map<string, unknown>();
    const persistence = new KeyValueCombatPersistence({
      async get<T>(key: string) { return values.get(key) as T | undefined; },
      async put(key: string, value: unknown) { values.set(key, structuredClone(value)); },
    });
    await persistence.savePlayer("hero", { hp: 4, maxHp: 20, dead: true, revive: 60 });
    await persistence.saveZone(1, { events: {}, ledger: Array.from({ length: 1030 }, (_, tick) => ({ tick, seq: tick + 1, kind: "hit" as const })) });
    expect(await persistence.loadPlayer("hero")).toMatchObject({ hp: 4, dead: true });
    expect((await persistence.loadZone(1))?.ledger).toHaveLength(1024);
    expect((await persistence.loadZone(1))?.ledger[0].tick).toBe(6);
  });
});
