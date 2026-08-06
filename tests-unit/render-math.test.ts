import { describe, expect, it } from "vitest";
import { RenderMath } from "../src/renderer/three/render-math";

describe("RenderMath reusable matrix helpers", () => {
  it("writes into caller-owned buffers without changing matrix values", () => {
    const math = new RenderMath();
    const projection = new Float32Array(16);
    const view = new Float32Array(16);
    const combined = new Float32Array(16);

    math.perspectiveInto(projection, Math.PI / 4, 1.5, 4, 800);
    math.lookAtInto(view, 12, 18, 30, 12, 0, 20);
    math.multiplyInto(combined, projection, view);

    const expectedProjection = math.perspective(Math.PI / 4, 1.5, 4, 800);
    const expectedView = math.lookAt(12, 18, 30, 12, 0, 20);
    for (let i = 0; i < 16; i++) {
      expect(projection[i]).toBeCloseTo(expectedProjection[i], 5);
      expect(view[i]).toBeCloseTo(expectedView[i], 5);
    }
    const expected = math.multiply(Array.from(projection), Array.from(view));
    for (let i = 0; i < 16; i++) expect(combined[i]).toBeCloseTo(expected[i], 5);
  });

  it("reuses the supplied orthographic output buffer", () => {
    const math = new RenderMath();
    const out = new Float32Array(16);
    expect(math.orthoInto(out, -4, 8, -2, 6, 1, 100)).toBe(out);
    const expected = math.ortho(-4, 8, -2, 6, 1, 100);
    for (let i = 0; i < 16; i++) expect(out[i]).toBeCloseTo(expected[i], 5);
  });
});
