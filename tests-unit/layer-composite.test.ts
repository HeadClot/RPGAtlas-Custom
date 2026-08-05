/* RPGAtlas — tests-unit/layer-composite.test.ts
   Focused coverage for generalized layer compositing: transparent-cell
   skipping, tint scratch sizing, draw order, and blend state. */

import { afterEach, describe, expect, it, vi } from "vitest";
import { composeAdvBuffers, drawEntryTiles } from "../src/shared/layer-composite";

const TILE = 4;

function context() {
  return {
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    fillStyle: "",
    drawImage: vi.fn(),
    clearRect: vi.fn(),
    fillRect: vi.fn(),
  };
}

function drawTile(log: unknown[]) {
  return (_g: unknown, id: number, x: number, y: number) => log.push({ id, x, y });
}

afterEach(() => vi.unstubAllGlobals());

describe("drawEntryTiles", () => {
  it("skips empty layers and only visits occupied cells", () => {
    const g = context();
    const log: unknown[] = [];

    drawEntryTiles(g, [0, 2, 0, 3], { width: 2, height: 2 }, drawTile(log), TILE);

    expect(log).toEqual([
      { id: 2, x: 4, y: 0 },
      { id: 3, x: 4, y: 4 },
    ]);
    expect(g.drawImage).not.toHaveBeenCalled();
  });

  it("does not create a tint canvas for an empty layer", () => {
    const createElement = vi.fn();
    vi.stubGlobal("document", { createElement });

    drawEntryTiles(context(), [0, 0, 0, 0], { width: 2, height: 2 }, () => {}, TILE, "#9db4ff");

    expect(createElement).not.toHaveBeenCalled();
  });

  it("uses one reusable tile-sized scratch canvas per tinted layer", () => {
    const scratchContext = context();
    const canvas = { width: 0, height: 0, getContext: () => scratchContext };
    const createElement = vi.fn(() => canvas);
    vi.stubGlobal("document", { createElement });
    const log: unknown[] = [];
    const target = context();

    drawEntryTiles(target, [1, 0, 0, 2], { width: 2, height: 2 }, drawTile(log), TILE, "#9db4ff");
    drawEntryTiles(target, [0, 3, 0, 0], { width: 2, height: 2 }, drawTile(log), TILE, "#9db4ff");

    expect(createElement).toHaveBeenCalledTimes(1);
    expect(canvas.width).toBe(TILE);
    expect(canvas.height).toBe(TILE);
    expect(target.drawImage).toHaveBeenCalledTimes(3);
    expect(scratchContext.fillRect).toHaveBeenCalledTimes(3);
    expect(log).toHaveLength(6); // paint + destination-in mask for each cell
  });
});

describe("composeAdvBuffers", () => {
  it("preserves layer order, slot, opacity, and blend state", () => {
    const lower = context();
    const upper = context();
    const log: unknown[] = [];
    const map = {
      width: 2,
      height: 1,
      layers: { ground: [1, 2], decor: [0, 0], decor2: [0, 0], over: [0, 0] },
      layersAdv: [
        { id: 1, name: "ground", type: "core", role: "ground" },
        { id: 5, name: "Glow", type: "tile", slot: "below", opacity: 0.4, blend: "add", data: [2, 0] },
        { id: 4, name: "over", type: "core", role: "over" },
      ],
    };

    composeAdvBuffers(lower, upper, map, drawTile(log), TILE);

    expect(log).toEqual([
      { id: 1, x: 0, y: 0 },
      { id: 2, x: 4, y: 0 },
      { id: 2, x: 0, y: 0 },
    ]);
    expect(lower.globalAlpha).toBe(1);
    expect(lower.globalCompositeOperation).toBe("source-over");
    expect(upper.drawImage).not.toHaveBeenCalled();
  });
});
