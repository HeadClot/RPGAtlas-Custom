/* RPGAtlas — src/shared/layer-composite.ts
   The one shared "composite a map's generalized layer stack into the two
   engine buffers" routine (Phase 8 Stage B).

   The engine (map-runtime.ts prerenderMap) and the live HD-2D viewport
   (hd-viewport.ts buildBuffers) both fold a map into a lower buffer (drawn
   under characters) and an upper/overhead buffer. Classic maps run their
   verbatim four-array loops (byte-identical, golden-proof). When map.layersAdv
   is present those callers hand off to composeAdvBuffers here, which walks the
   flattened layer-view stack: "below"-slot entries composite into the lower
   buffer, "above"-slot into the upper, each honoring opacity (globalAlpha),
   blend (globalCompositeOperation) and tint. Baking blend into the 2D buffer
   means the HD-2D renderer, which consumes the buffers as textures, gets the
   same composite for free.
   Copyright (C) 2026 RPGAtlas contributors — GPL-3.0-or-later (see LICENSE). */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { drawLayerCell } from "./autotile-draw";
import { layerView, entryArray, BLEND_COMPOSITE } from "./layer-view";

type DrawTile = (g: any, id: number, dx: number, dy: number) => void;

interface PaintedCell {
  x: number;
  y: number;
}

let tintScratch: HTMLCanvasElement | null = null;
let tintScratchSize = 0;

function paintedCells(arr: number[], width: number, height: number): PaintedCell[] {
  const cells: PaintedCell[] = [];
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      if (arr[row + x]) cells.push({ x, y });
    }
  }
  return cells;
}

function getTintScratch(TILE: number): HTMLCanvasElement {
  if (!tintScratch || tintScratchSize !== TILE) {
    tintScratch = document.createElement("canvas");
    tintScratch.width = TILE;
    tintScratch.height = TILE;
    tintScratchSize = TILE;
  }
  return tintScratch;
}

/** Draw every cell of one layer array into `g` at TILE size. When `tint` is a
 *  CSS color it is multiplied over the layer's own pixels (via an offscreen so
 *  the multiply is confined to painted cells, not the whole map rect). The
 *  caller sets globalAlpha / globalCompositeOperation for opacity and blend. */
export function drawEntryTiles(
  g: any, arr: number[], m: any, drawTile: DrawTile, TILE: number, tint?: string, frame = 0,
): void {
  if (!tint) {
    // Keep the un-tinted traversal byte-identical to the established
    // generalized-layer path. Classic-equivalence goldens intentionally
    // protect this exact row-major ordering.
    let hasTiles = false;
    for (let i = 0; i < arr.length; i++) {
      if (arr[i]) { hasTiles = true; break; }
    }
    if (!hasTiles) return;
    for (let y = 0; y < m.height; y++) {
      const row = y * m.width;
      for (let x = 0; x < m.width; x++) {
        if (arr[row + x]) {
          drawLayerCell(g, arr, m.width, m.height, x, y, x * TILE, y * TILE, TILE, drawTile, frame);
        }
      }
    }
    return;
  }

  // Tinted advanced layers are commonly sparse. Build the occupied list once
  // so the scratch path never revisits transparent cells.
  const cells = paintedCells(arr, m.width, m.height);
  if (!cells.length) return;

  // Sparse tinted layers do not need a map-sized intermediate canvas. Reuse a
  // single tile-sized scratch canvas and composite each painted cell into the
  // destination at its authored position. The second draw is the same
  // destination-in mask used by the old full-map implementation, preserving
  // transparent tile edges while avoiding a 3072×3072 allocation and fill.
  const tmp = getTintScratch(TILE);
  const tg = tmp.getContext("2d") as any;
  for (const { x, y } of cells) {
    tg.clearRect(0, 0, TILE, TILE);
    tg.globalCompositeOperation = "source-over";
    tg.globalAlpha = 1;
    drawLayerCell(tg, arr, m.width, m.height, x, y, 0, 0, TILE, drawTile, frame);
    tg.globalCompositeOperation = "multiply";
    tg.fillStyle = tint;
    tg.fillRect(0, 0, TILE, TILE);
    tg.globalCompositeOperation = "destination-in";
    drawLayerCell(tg, arr, m.width, m.height, x, y, 0, 0, TILE, drawTile, frame);
    tg.globalCompositeOperation = "source-over";
    g.drawImage(tmp, x * TILE, y * TILE);
  }
}

/** Composite a layersAdv map into the engine's two buffers. `lg`/`ug` are the
 *  lower and upper (overhead) buffer contexts, already background-filled by the
 *  caller. Shadows stay the caller's job (drawn into `lg` after this, matching
 *  the classic "shadows under the overhead layer" position). */
export function composeAdvBuffers(
  lg: any, ug: any, m: any, drawTile: DrawTile, TILE: number, frame = 0,
): void {
  for (const e of layerView(m)) {
    if (!e.visible) continue;
    const arr = entryArray(m, e);
    if (!arr) continue;
    const g = e.slot === "above" ? ug : lg;
    g.globalAlpha = e.opacity;
    g.globalCompositeOperation = BLEND_COMPOSITE[e.blend];
    drawEntryTiles(g, arr, m, drawTile, TILE, e.tint, frame);
    g.globalAlpha = 1;
    g.globalCompositeOperation = "source-over";
  }
}

/**
 * Re-composite a SINGLE map cell's lower-buffer column at animation frame `frame`
 * — the animated-terrain redraw seam (Phase 8 Stage C). Clears the cell rect on
 * the lower buffer, then redraws every below-slot layer that occupies that cell,
 * bottom → top, at `frame` — so an animated water tile refreshes without erasing
 * a bridge/decor tile drawn over it. `bg` is the map background fill (matches the
 * caller's initial buffer clear). Only the lower buffer animates (terrains are
 * ground-family); the overhead buffer is never touched.
 */
export function recomposeLowerCell(
  lg: any, m: any, x: number, y: number, frame: number,
  drawTile: DrawTile, TILE: number, bg: string,
): void {
  lg.save();
  // Clip to the one cell so a tint offscreen / blend stays confined and the
  // clear + redraw cannot spill into neighbours.
  lg.beginPath();
  lg.rect(x * TILE, y * TILE, TILE, TILE);
  lg.clip();
  lg.globalCompositeOperation = "source-over";
  lg.globalAlpha = 1;
  lg.fillStyle = bg;
  lg.fillRect(x * TILE, y * TILE, TILE, TILE);
  if (!m.layersAdv) {
    drawCellFrame(lg, m.layers.ground, m, x, y, TILE, drawTile, frame);
    drawCellFrame(lg, m.layers.decor, m, x, y, TILE, drawTile, frame);
    drawCellFrame(lg, m.layers.decor2, m, x, y, TILE, drawTile, frame);
  } else {
    for (const e of layerView(m)) {
      if (!e.visible || e.slot === "above") continue;
      const arr = entryArray(m, e);
      if (!arr) continue;
      lg.globalAlpha = e.opacity;
      lg.globalCompositeOperation = BLEND_COMPOSITE[e.blend];
      // Per-cell tint would need an offscreen; tinted animated layers are rare —
      // fall back to the untinted cell (the full rebuild path still tints).
      drawCellFrame(lg, arr, m, x, y, TILE, drawTile, frame);
      lg.globalAlpha = 1;
      lg.globalCompositeOperation = "source-over";
    }
  }
  lg.restore();
}

function drawCellFrame(
  g: any, arr: number[], m: any, x: number, y: number, TILE: number,
  drawTile: DrawTile, frame: number,
): void {
  drawLayerCell(g, arr, m.width, m.height, x, y, x * TILE, y * TILE, TILE, drawTile, frame);
}
