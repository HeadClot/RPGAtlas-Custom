/* RPGAtlas — tests-unit/anim-player.test.ts
   Phase 5 Stage A: the battle-animation player's scheduler core, run under
   plain node with an injected clock/scheduler and a mock battle-fx bundle
   (the DOM-facing emitters are exercised through the same call surface the
   real pool exposes). GPL-3.0-or-later (see LICENSE). */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect } from "vitest";
import {
  playAnimation,
  animDurationTicks,
  itemDurationTicks,
  anchorPoints,
} from "../src/shared/anim-player";
import type { AnimEnv } from "../src/shared/anim-player";
import type { BattleAnimation } from "../src/shared/schema";

function fakeEl(): any {
  return {
    style: {},
    textContent: "",
    children: [] as any[],
    appendChild(c: any) { this.children.push(c); },
    animate() { return { finished: Promise.resolve() }; },
  };
}

function mockFx() {
  const bursts: any[] = [];
  const spawned: string[] = [];
  return {
    bursts,
    spawned,
    fxPoint: (t: any) =>
      t && typeof t.x === "number" ? { x: t.x, y: t.y } : { x: 50, y: 40 },
    burst: (target: any, kind: any, opts: any) => bursts.push({ target, kind, opts }),
    floatText: () => {},
    pulse: () => {},
    travel: async () => {},
    castFx: () => {},
    spawn: (cls: string) => { spawned.push(cls); return fakeEl(); },
    release: () => {},
  };
}

/** Drive playAnimation with a manual 60 t/s clock until it resolves. */
async function run(anim: BattleAnimation, env: Partial<AnimEnv>): Promise<void> {
  let t = 0;
  const pending: Array<() => void> = [];
  const promise = playAnimation(anim, {
    fx: mockFx(),
    ...env,
    now: () => t,
    schedule: (cb) => pending.push(cb),
  } as AnimEnv);
  let resolved = false;
  promise.then(() => { resolved = true; });
  for (let i = 0; i < 5000 && !resolved; i++) {
    t += 1000 / 60;
    for (const cb of pending.splice(0)) cb();
    await Promise.resolve();
    await Promise.resolve();
  }
  expect(resolved).toBe(true);
  return promise;
}

const anim = (items: any[], target: any = "target"): BattleAnimation =>
  ({ id: 1, name: "T", target, items }) as BattleAnimation;

describe("durations", () => {
  it("sound items are instantaneous", () => {
    expect(itemDurationTicks({ at: 0, type: "sound", se: "hit" } as any)).toBe(0);
  });
  it("shake duration is already in frames/ticks", () => {
    expect(itemDurationTicks({ at: 0, type: "shake", duration: 30 } as any)).toBe(30);
  });
  it("particle/flash durations convert ms → ticks", () => {
    expect(itemDurationTicks({ at: 0, type: "particles", duration: 1000 } as any)).toBe(60);
    expect(itemDurationTicks({ at: 0, type: "flash", duration: 500 } as any)).toBe(30);
  });
  it("flipbook duration follows frames/fps", () => {
    expect(itemDurationTicks({ at: 0, type: "flipbook", from: 0, to: 9, fps: 10 } as any)).toBe(60);
  });
  it("animation duration is the latest item end", () => {
    const a = anim([
      { at: 0, type: "sound", se: "hit" },
      { at: 10, type: "particles", duration: 1000 }, // ends at 70
      { at: 30, type: "shake", duration: 20 },       // ends at 50
    ]);
    expect(animDurationTicks(a)).toBe(70);
  });
  it("an empty animation has zero duration and resolves immediately", async () => {
    expect(animDurationTicks(anim([]))).toBe(0);
    await playAnimation(anim([]), { fx: mockFx() } as any); // must not hang
  });
});

describe("anchors", () => {
  const env: any = { fx: mockFx(), source: { x: 1, y: 1 }, targets: [{ x: 2, y: 2 }, { x: 3, y: 3 }] };
  it("target items fan out per target", () => {
    expect(anchorPoints(anim([]), { type: "particles" } as any, env)).toHaveLength(2);
  });
  it("source items anchor once on the source", () => {
    expect(anchorPoints(anim([], "source"), { type: "particles" } as any, env)).toEqual([{ x: 1, y: 1 }]);
  });
  it("item anchor overrides the animation default", () => {
    expect(anchorPoints(anim([], "target"), { type: "particles", anchor: "source" } as any, env)).toEqual([{ x: 1, y: 1 }]);
  });
  it("screen anchor uses env.screen when provided, else battle-fx null", () => {
    expect(anchorPoints(anim([], "screen"), { type: "particles" } as any, env)).toEqual([null]);
    expect(anchorPoints(anim([], "screen"), { type: "particles" } as any, { ...env, screen: { x: 9, y: 9 } })).toEqual([{ x: 9, y: 9 }]);
  });
});

describe("playback", () => {
  it("fires items in timeline order regardless of authoring order", async () => {
    const order: string[] = [];
    await run(
      anim([
        { at: 20, type: "sound", se: "late" },
        { at: 0, type: "sound", se: "first" },
        { at: 10, type: "sound", se: "mid" },
      ]),
      { onSound: (se) => order.push(se) },
    );
    expect(order).toEqual(["first", "mid", "late"]);
  });

  it("bursts once per target (multi-target fan-out)", async () => {
    const fx = mockFx();
    await run(
      anim([{ at: 0, type: "particles", kind: "fire", count: 5 }]),
      { fx, targets: [{ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }] } as any,
    );
    expect(fx.bursts).toHaveLength(3);
    expect(fx.bursts[0].kind).toBe("fire");
    expect(fx.bursts[0].opts.count).toBe(5);
  });

  it("shaped emitters and projectiles draw from the shared pool per target", async () => {
    const fx = mockFx();
    await run(
      anim([
        { at: 0, type: "particles", shape: "ring", count: 4 },
        { at: 0, type: "projectile" },
      ]),
      { fx, source: { x: 0, y: 0 }, targets: [{ x: 1, y: 1 }, { x: 2, y: 2 }] } as any,
    );
    // ring: 4 particles × 2 targets; projectile: 1 × 2 targets
    expect(fx.spawned.filter((c) => !c.includes("projectile"))).toHaveLength(8);
    expect(fx.spawned.filter((c) => c.includes("projectile"))).toHaveLength(2);
  });

  it("shake routes through onShake with the command's defaults", async () => {
    let got: any = null;
    await run(anim([{ at: 0, type: "shake" }]), {
      onShake: (power, speed, duration) => { got = { power, speed, duration }; },
    });
    expect(got).toEqual({ power: 5, speed: 5, duration: 20 });
  });

  it("flipbooks step frames via drawIcon and finish the animation", async () => {
    const frames: number[] = [];
    await run(
      anim([{ at: 0, type: "flipbook", sheet: "icons", from: 4, to: 6, fps: 30 }]),
      { drawIcon: (i) => { frames.push(i); return fakeEl(); }, targets: [{ x: 1, y: 1 }] } as any,
    );
    expect(frames).toEqual([4, 5, 6]);
  });

  it("does not resolve before the last effect ends", async () => {
    let t = 0;
    const pending: Array<() => void> = [];
    let resolved = false;
    playAnimation(anim([{ at: 0, type: "particles", duration: 1000 }]), {
      fx: mockFx(), targets: [{ x: 1, y: 1 }],
      now: () => t, schedule: (cb) => pending.push(cb),
    } as any).then(() => { resolved = true; });
    // half the duration: 30 ticks of the 60-tick effect
    for (let i = 0; i < 30; i++) {
      t += 1000 / 60;
      for (const cb of pending.splice(0)) cb();
      await Promise.resolve();
    }
    expect(resolved).toBe(false);
    for (let i = 0; i < 40; i++) {
      t += 1000 / 60;
      for (const cb of pending.splice(0)) cb();
      await Promise.resolve();
    }
    await Promise.resolve();
    expect(resolved).toBe(true);
  });
});
