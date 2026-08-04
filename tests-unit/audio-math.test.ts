/* RPGAtlas — tests-unit/audio-math.test.ts
   Phase 6 Stage D: the pure audio-v2 math — the ambience-layer differ that
   drives seamless cross-map transfers, and the positional-SE pan/gain curve.
   GPL-3.0-or-later (see LICENSE). */

import { describe, expect, it } from "vitest";
import { ambienceDiff, mergeCommandBgs, panGainForTile } from "../src/shared/audio-math";

describe("ambienceDiff", () => {
  const rain = "asset:audio/rain";
  const wind = "asset:audio/wind";
  const surf = "asset:audio/surf";

  it("starts wanted layers and stops removed ones", () => {
    const d = ambienceDiff([{ key: rain, vol: 1 }], [{ key: wind }, { key: surf, vol: 0.5 }]);
    expect(d.start).toEqual([{ key: wind, vol: 1 }, { key: surf, vol: 0.5 }]);
    expect(d.stop).toEqual([rain]);
    expect(d.retune).toEqual([]);
  });
  it("keeps shared layers running (no start/stop) and retunes volume changes", () => {
    const d = ambienceDiff(
      [{ key: rain, vol: 1 }, { key: wind, vol: 0.8 }],
      [{ key: rain }, { key: wind, vol: 0.3 }],
    );
    expect(d.start).toEqual([]);
    expect(d.stop).toEqual([]);
    expect(d.retune).toEqual([{ key: wind, vol: 0.3 }]);
  });
  it("ignores non-asset keys and clamps volumes", () => {
    const d = ambienceDiff([], [{ key: "field" }, { key: rain, vol: 7 }, { key: surf, vol: -1 }]);
    expect(d.start).toEqual([{ key: rain, vol: 1 }, { key: surf, vol: 0 }]);
  });
  it("is a no-op for identical lists", () => {
    const d = ambienceDiff([{ key: rain, vol: 0.5 }], [{ key: rain, vol: 0.5 }]);
    expect(d.start.length + d.stop.length + d.retune.length).toBe(0);
  });
  it("carries pitch/pan on start entries (M4·B, applied at start only)", () => {
    const d = ambienceDiff([], [{ key: rain, vol: 0.6, pitch: 1.5, pan: -0.2 }]);
    expect(d.start).toEqual([{ key: rain, vol: 0.6, pitch: 1.5, pan: -0.2 }]);
  });
});

describe("mergeCommandBgs (M4·B, RM 245)", () => {
  const rain = "asset:audio/rain";
  const wind = "asset:audio/wind";

  it("appends the command layer to the map's list", () => {
    expect(mergeCommandBgs([{ key: rain }], { key: wind, vol: 0.6 }))
      .toEqual([{ key: rain }, { key: wind, vol: 0.6 }]);
  });
  it("returns the exact base list when there is no command layer", () => {
    const base = [{ key: rain, vol: 0.8 }];
    expect(mergeCommandBgs(base, null)).toBe(base);
    expect(mergeCommandBgs(base, undefined)).toBe(base);
    expect(mergeCommandBgs(base, { key: "" })).toBe(base);
    expect(mergeCommandBgs(undefined, null)).toEqual([]);
  });
  it("lets a same-key map layer win (the map's own mix)", () => {
    const base = [{ key: rain, vol: 0.8 }];
    expect(mergeCommandBgs(base, { key: rain, vol: 0.2 })).toBe(base);
  });
});

describe("panGainForTile", () => {
  it("pans by horizontal offset, saturating at ±8 tiles", () => {
    expect(panGainForTile(0, 0).pan).toBe(0);
    expect(panGainForTile(4, 0).pan).toBe(0.5);
    expect(panGainForTile(-12, 0).pan).toBe(-1);
  });
  it("is full volume within one tile and fades to silence at maxDist", () => {
    expect(panGainForTile(0, 0).vol).toBe(1);
    expect(panGainForTile(1, 0).vol).toBe(1);
    expect(panGainForTile(12, 0).vol).toBe(0);
    expect(panGainForTile(0, 20).vol).toBe(0);
    const mid = panGainForTile(0, 6.5).vol; // halfway between 1 and 12
    expect(mid).toBeCloseTo(0.5, 5);
  });
  it("honors a custom max distance", () => {
    expect(panGainForTile(3, 0, 3).vol).toBe(0);
    expect(panGainForTile(2, 0, 3).vol).toBeCloseTo(0.5, 5);
  });
});
