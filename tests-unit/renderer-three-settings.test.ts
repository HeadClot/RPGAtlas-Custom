import { describe, expect, it } from "vitest";
import { RenderSettings } from "../src/renderer/three/render-settings";

describe("RenderSettings", () => {
  it("masks tile ids using the renderer's stable 28-bit classification", () => {
    const settings = new RenderSettings();
    expect(settings.tileId(-1)).toBe((1 << 28) - 1);
    expect(settings.tileId(0x10000001)).toBe(1);
  });

  it("caches deterministic day/night states without changing their values", () => {
    const settings = new RenderSettings();
    const first = settings.cachedDayNightAt(17.5);
    const second = settings.cachedDayNightAt(17.5);
    expect(second).toBe(first);
    expect(first.daylight).toBeGreaterThan(0);
    expect(first.scale).toBeGreaterThan(0.25);
    expect(first.azimuth).toBe(262.5);
  });

  it("keeps grade presets explicit and unknown grades disabled", () => {
    const settings = new RenderSettings();
    expect(settings.gradeFor("warm")).toEqual({ m: [1.1, 0, 0, 0, 1, 0, 0, 0, 0.88], b: [0.012, 0.004, 0] });
    expect(settings.gradeFor("not-a-grade")).toBeNull();
  });
});
