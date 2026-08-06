/* RPGAtlas — internal connected-map composition and surface validation. */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { HdRenderSurface } from "../three-renderer.js";

export interface ComposedWorld {
  lowerBuf: HTMLCanvasElement;
  upperBuf: HTMLCanvasElement;
  map: any;
  baseX: number;
  baseY: number;
}

/** Owns the CPU-side composition boundary for connected HD-2D surfaces. */
export class MapWorldRenderer {
  constructor(private readonly tile: number) {}

  validSurface(surface: any): surface is HdRenderSurface {
    return !!surface && !!surface.map && !!surface.lowerBuf && !!surface.upperBuf &&
      Number.isInteger(surface.offsetX) && Number.isInteger(surface.offsetY);
  }

  composeWorld(surfaces: HdRenderSurface[]): ComposedWorld {
    const list = surfaces.filter((surface) => this.validSurface(surface));
    const active = list[0];
    if (!active) throw new Error("HD-2D requires an active render surface");
    let minX = 0, minY = 0, maxX = active.map.width, maxY = active.map.height;
    for (const surface of list) {
      minX = Math.min(minX, surface.offsetX);
      minY = Math.min(minY, surface.offsetY);
      maxX = Math.max(maxX, surface.offsetX + surface.map.width);
      maxY = Math.max(maxY, surface.offsetY + surface.map.height);
    }
    const width = Math.max(1, maxX - minX);
    const height = Math.max(1, maxY - minY);
    const lowerBuf = document.createElement("canvas");
    lowerBuf.width = width * this.tile;
    lowerBuf.height = height * this.tile;
    const upperBuf = document.createElement("canvas");
    upperBuf.width = lowerBuf.width;
    upperBuf.height = lowerBuf.height;
    const lower = lowerBuf.getContext("2d");
    const upper = upperBuf.getContext("2d");
    if (!lower || !upper) throw new Error("HD-2D could not create composed map buffers");
    if (!active.map.parallax) {
      lower.fillStyle = "#101018";
      lower.fillRect(0, 0, lowerBuf.width, lowerBuf.height);
    }

    const cellCount = width * height;
    const layerNames = ["ground", "decor", "decor2", "over"];
    const layers: Record<string, number[]> = {};
    for (const name of layerNames) layers[name] = new Array(cellCount).fill(0);
    const composedHeights = new Array(cellCount).fill(0);
    for (const surface of list) {
      const dx = surface.offsetX - minX;
      const dy = surface.offsetY - minY;
      lower.drawImage(surface.lowerBuf, dx * this.tile, dy * this.tile);
      upper.drawImage(surface.upperBuf, dx * this.tile, dy * this.tile);
      const sourceMap = surface.map;
      for (const name of layerNames) {
        const source = sourceMap.layers && sourceMap.layers[name];
        if (!source) continue;
        const target = layers[name];
        for (let y = 0; y < sourceMap.height; y++) {
          const srcRow = y * sourceMap.width;
          const dstRow = (dy + y) * width + dx;
          for (let x = 0; x < sourceMap.width; x++) target[dstRow + x] = source[srcRow + x] || 0;
        }
      }
      if (sourceMap.heights) {
        for (let y = 0; y < sourceMap.height; y++) {
          const srcRow = y * sourceMap.width;
          const dstRow = (dy + y) * width + dx;
          for (let x = 0; x < sourceMap.width; x++) composedHeights[dstRow + x] = Number(sourceMap.heights[srcRow + x]) || 0;
        }
      }
    }
    return {
      lowerBuf,
      upperBuf,
      map: { ...active.map, width, height, layers, layersAdv: undefined, heights: composedHeights },
      baseX: minX,
      baseY: minY,
    };
  }
}
