/* RPGAtlas — tests-unit/mz-convert-animations.test.ts
   Project Compass M4·B: `Animations.json` conversion (matrix §10, decision D4).
   MV sheet animations become real flipbook/flash/sound timelines; MZ Effekseer
   entries carry their real timings and borrow the nearest base animation's
   visuals in `resolveAnimationFallbacks` (the assembleProject hook).
   GPL-3.0-or-later (see LICENSE). */

import { describe, expect, it } from "vitest";
import {
  animBucketOf,
  convertAnimations,
  resolveAnimationFallbacks,
  ImportReport,
} from "../src/editor/importers/mz";
import type { BattleAnimation } from "../src/shared/schema";

/* eslint-disable @typescript-eslint/no-explicit-any */

const cell = (pattern: number, over: Partial<Record<number, number>> = {}): number[] => {
  const c = [pattern, 0, 0, 100, 0, 0, 255, 0];
  for (const [i, v] of Object.entries(over)) c[Number(i)] = v as number;
  return c;
};

const mvRaw = (anims: any[], skills: any[] = [], elements: string[] = []): any => ({
  format: "mv",
  system: { elements: ["", ...elements] },
  skills,
  animations: [null, ...anims],
});

const convert = (raw: any) => {
  const report = new ImportReport();
  return { ...convertAnimations(raw, report), report };
};

describe("MV sheet conversion (matrix §10)", () => {
  it("turns consecutive patterns into one flipbook at 15 fps over the sheet key", () => {
    const { animations, fallbacks } = convert(mvRaw([{
      id: 1, name: "Heal", animation1Name: "Heal", position: 1,
      frames: [[cell(0)], [cell(1)], [cell(2)]],
      timings: [{ frame: 0, se: { name: "Heal" }, flashScope: 1, flashColor: [255, 255, 255, 170], flashDuration: 5 }],
    }]));
    expect(fallbacks).toEqual([]);
    const a = animations[0];
    expect(a).toMatchObject({ id: 1, name: "Heal", target: "target" });
    expect(a.items[0]).toEqual({
      at: 0, type: "flipbook", sheet: "asset:pictures/heal",
      cols: 5, rows: 1, from: 0, to: 2, fps: 15, scale: 4,
    });
    // Timing row: sound + a target flash (color/opacity/duration from RM units).
    expect(a.items[1]).toEqual({ at: 0, type: "sound", se: "asset:audio/Heal" });
    expect(a.items[2]).toMatchObject({ at: 0, type: "flash", anchor: "target", color: "#ffffff" });
    expect((a.items[2] as any).opacity).toBeCloseTo(170 / 255, 1);
    expect((a.items[2] as any).duration).toBe(Math.round((5 * 1000) / 15));
  });

  it("holds break runs but keep exact total duration; screen position → screen target", () => {
    const { animations } = convert(mvRaw([{
      id: 1, name: "Quake", animation1Name: "Quake", position: 3,
      frames: [[cell(0)], [cell(0)], [cell(1)]],
      timings: [],
    }]));
    const a = animations[0];
    expect(a.target).toBe("screen");
    const flips = a.items.filter((i) => i.type === "flipbook");
    // frame 0 (pattern 0) · frame 1 (pattern 0 again = hold) · frame 2 (pattern 1
    // continues the SECOND run 0→1). 4 ticks per frame.
    expect(flips.map((f: any) => [f.at, f.from, f.to])).toEqual([[0, 0, 0], [4, 0, 1]]);
  });

  it("routes patterns ≥ 100 to the second sheet and sizes rows from the top pattern", () => {
    const { animations } = convert(mvRaw([{
      id: 1, name: "Duo", animation1Name: "A", animation2Name: "B", position: 1,
      frames: [[cell(7)], [cell(107)]],
      timings: [],
    }]));
    const flips = animations[0].items.filter((i) => i.type === "flipbook") as any[];
    expect(flips[0]).toMatchObject({ sheet: "asset:pictures/a", from: 7, to: 7, rows: 2 }); // pattern 7 → 2 rows of 5
    expect(flips[1]).toMatchObject({ at: 4, sheet: "asset:pictures/b", from: 7, to: 7 }); // 107 − 100
  });

  it("aggregates the sheet 'add the art' line and the simplification line (D11)", () => {
    const { report } = convert(mvRaw([{
      id: 1, name: "Messy", animation1Name: "Messy", animation1Hue: 120, position: 1,
      // multi-cell frame + an offset cell + a hide-target flash: 3 simplifications (+ hue).
      frames: [[cell(0), cell(1)], [cell(1, { 1: 24 })]],
      timings: [{ frame: 0, flashScope: 3, flashColor: [0, 0, 0, 255], flashDuration: 2 }],
    }]));
    const sheets = report.lines.find((l) => l.what === "battle animation sheet images");
    expect(sheets?.kind).toBe("partial");
    expect(sheets?.count).toBe(1);
    const simplified = report.lines.find((l) => l.what === "animation frame details");
    expect(simplified?.count).toBe(4);
  });
});

describe("MZ Effekseer conversion + fallback (D4)", () => {
  const mzAnim = (over: any = {}): any => ({
    id: 1, name: "Fire", effectName: "Fire",
    flashTimings: [], soundTimings: [{ frame: 2, se: { name: "Fire" } }], quakePower: 3,
    ...over,
  });
  const base: BattleAnimation[] = [
    { id: 1, name: "Slash", target: "target", items: [
      { at: 0, type: "sound", se: "hit" }, { at: 0, type: "particles", kind: "hit" }] },
    { id: 2, name: "Fire Burst", target: "target", items: [
      { at: 0, type: "sound", se: "magic" }, { at: 20, type: "particles", kind: "fire" },
      { at: 22, type: "flash", anchor: "screen" }] },
    { id: 3, name: "Healing Light", target: "target", items: [
      { at: 0, type: "sound", se: "heal" }, { at: 0, type: "particles", kind: "heal" }] },
  ];

  it("keeps the real timings (15-fps frames → ticks) and the quake as a shake", () => {
    const { animations, fallbacks } = convert(mvRaw([mzAnim()]));
    const a = animations[0];
    expect(a.items).toContainEqual({ at: 8, type: "sound", se: "asset:audio/Fire" });
    expect(a.items.some((i: any) => i.type === "shake" && i.power === 3)).toBe(true);
    expect(fallbacks).toEqual([{ index: 0, bucket: "fire", hasSound: true, hasFlash: false }]);
  });

  it("borrows the bucket-matched base visuals, skipping doubled sounds", () => {
    const { animations, fallbacks, report } = convert(mvRaw([mzAnim()]));
    resolveAnimationFallbacks(base, animations, fallbacks, report);
    const a = animations[0];
    // Fire → "Fire Burst": particles + flash borrowed; base sound dropped
    // (the MZ entry brought its own), own timings appended after.
    expect(a.items.some((i: any) => i.type === "particles" && i.kind === "fire")).toBe(true);
    expect(a.items.some((i: any) => i.type === "flash")).toBe(true);
    expect(a.items.filter((i) => i.type === "sound")).toEqual([{ at: 8, type: "sound", se: "asset:audio/Fire" }]);
    const line = report.lines.find((l) => l.what === 'the "Fire" animation');
    expect(line?.kind).toBe("partial");
    expect(line?.detail).toContain('"Fire Burst"');
  });

  it("matches by element hint when the name has no bucket, else falls back to hit", () => {
    const raw = mvRaw(
      [mzAnim({ id: 9, name: "Special9", effectName: "Special9" }), mzAnim({ id: 10, name: "Mystery", effectName: "Mystery", soundTimings: [] })],
      [{ id: 1, name: "Cure All", animationId: 9, damage: { elementId: 2 } }],
      ["fire", "healing water"],
    );
    const { animations, fallbacks, report } = convert(raw);
    expect(fallbacks[0].bucket).toBe("heal"); // element 2 = "healing water"
    expect(fallbacks[1].bucket).toBe("hit"); // no signal anywhere
    resolveAnimationFallbacks(base, animations, fallbacks, report);
    expect(report.lines.find((l) => l.what === 'the "Special9" animation')?.detail).toContain('"Healing Light"');
    expect(report.lines.find((l) => l.what === 'the "Mystery" animation')?.detail).toContain('"Slash"');
  });

  it("prefers an exact base-name match over the bucket", () => {
    const { animations, fallbacks, report } = convert(mvRaw([mzAnim({ name: "Slash", effectName: "Slash" })]));
    resolveAnimationFallbacks(base, animations, fallbacks, report);
    expect(animations[0].items.some((i: any) => i.kind === "hit")).toBe(true);
  });
});

describe("bucket vocabulary", () => {
  it("covers the classic RM effect names", () => {
    expect(animBucketOf("Flame Wall")).toBe("fire");
    expect(animBucketOf("Recovery One")).toBe("heal");
    expect(animBucketOf("Claw Attack")).toBe("hit");
    expect(animBucketOf("Zzz")).toBe("");
  });
});
