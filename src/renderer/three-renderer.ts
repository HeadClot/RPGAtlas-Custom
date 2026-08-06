/* RPGAtlas — src/runtime.renderer/three-runtime.renderer.ts
   The HD-2D runtime.renderer on three.js (Phase 2 Stage A: parity port of
   js/runtime.renderer.js). Same public surface as the classic script — available /
   setMap / renderFrame / isLost — same scene recipe, and the SAME GLSL:
   Stage A uses three as a managed context (canvas/context lifecycle, buffers,
   textures, render targets, scene-graph scaffolding for Stages B–E), not as a
   material system. Every draw goes through RawShaderMaterial with the classic
   shaders verbatim and a manually computed uMVP, so the golden images gate
   this port pixel-for-pixel (docs/phase-2-spec.md).

   Parity pins (each of these shifted the goldens when wrong in development):
   - THREE.ColorManagement disabled; every texture/render target NoColorSpace
     (three would otherwise sRGB-decode the canvas prerenders on sample).
   - flipY=false (classic texImage2D never flipped), premultiplyAlpha=true,
     NEAREST chunk/sprite filters, CustomBlending(ONE, ONE_MINUS_SRC_ALPHA),
     LessEqualDepth, DoubleSide (classic never enabled CULL_FACE).
   - transparent=false on everything + sortObjects=false: the whole scene stays
     in three's opaque list in scene-graph order — terrain, sprites (host order,
     far-to-near), overhead — exactly the classic draw order.
   - The attribute-less gl_VertexID fullscreen triangle becomes a 3-vertex
     attribute producing the identical triangle (three needs an attribute to
     size the draw); same rasterization.
   Copyright (C) 2026 RPGAtlas contributors — GPL-3.0-or-later (see LICENSE). */

/* eslint-disable @typescript-eslint/no-explicit-any */

import * as THREE from "three";
import { createShaderLibrary } from "./three/shader-library.js";
import { RenderSettings } from "./three/render-settings.js";
import { ThreeSceneGraph } from "./three/scene-graph.js";
import { ShaderMaterialFactory } from "./three/shader-material-factory.js";
import { WebGLRuntime } from "./three/webgl-runtime.js";
import { PostProcessRenderer } from "./three/post-process-renderer.js";
import { RenderMath } from "./three/render-math.js";
import { SpriteRenderer } from "./three/sprite-renderer.js";
import { WEATHER_COUNTS, WeatherRenderer } from "./three/weather-renderer.js";
import { ReflectionPassRenderer } from "./three/reflection-pass-renderer.js";
import { MapWorldRenderer } from "./three/map-world-renderer.js";
import { ShadowPassRenderer } from "./three/shadow-pass-renderer.js";
import { RenderFramePipeline } from "./three/render-frame-pipeline.js";

/** A prerendered map surface positioned relative to the active map origin. */
export interface HdRenderSurface {
  map: any;
  lowerBuf: HTMLCanvasElement;
  upperBuf: HTMLCanvasElement;
  offsetX: number;
  offsetY: number;
}

// Raw display-space pipeline: the prerendered canvases are authored in display
// space and the classic runtime.renderer never color-converted anything.
THREE.ColorManagement.enabled = false;

export function createThreeRenderer(): any {
  // Resolved from the classic assets script like js/runtime.renderer.js did (both HTML
  // pages load assets.js before any module code runs).
  const TILE = ((window as any).Assets && (window as any).Assets.TILE) || 48;
  // Map prerenders are split into squares of at most CHUNK px so a large map
  // never exceeds the GPU's maximum texture size (4096 on older hardware).
  const CHUNK = TILE * 21; // 1008
  const FOV = Math.PI / 4; // 45° vertical field of view
  const TINT_S = 0.62,
    TINT_EW = 0.48; // auto-shading for exposed block walls
  // Stage D2 (Phase 3): cliff auto-texturing. With map.hd2d.cliffs on, the flat
  // face tint above is sculpted into a rock cliff entirely in the vertex-tint
  // pipeline (no new texture, no shader, no save-format change): a top-down
  // ambient-occlusion gradient darkens each face toward the cliff base, the
  // crest edge keeps a sunlit lip, and vertical corners darken where the run
  // ends laterally — the corner test is the same 8-neighbour connectivity the
  // 47-blob floor autotiles use. OFF by default → wall verts are byte-identical
  // to Stage E, so every Phase 2 golden holds.
  const CLIFF_AO = 0.5, // darkest multiplier reached at the cliff base
    CLIFF_LIP = 1.18, // crest-edge sunlit lip (still ≤1 after the ≤0.62 base)
    CLIFF_EDGE = 0.72; // outer vertical-corner darkening
  const MAX_LIGHTS = 16;
  // Stage B.2: point-light shadows. Up to MAX_PLS lights (the nearest to the
  // camera target) render omnidirectional depth into one shared 2D atlas —
  // 6 faces of PL_FACE px per light, 3 columns x 2 rows per light, lights
  // stacked vertically (three.js's own cube-in-2D trick, done raw here so the
  // face convention is pinned between the JS matrices and the GLSL lookup).
  const MAX_PLS = 4;
  const PL_FACE = 256;
  const PL_NEAR = 6; // px — inside this radius nothing occludes
  const PL_W = PL_FACE * 3,
    PL_H = PL_FACE * 2 * MAX_PLS;
  // Stage C: water & materials. The water surface floats WATER_Y px above the
  // tile's ground so it never z-fights the prerendered water pixels below
  // (which stay visible as the refraction source). The mirror plane for
  // planar reflections is the height-0 surface — elevated water still gets
  // waves/foam/specular, just not a geometrically exact reflection.
  const WATER_Y = 3;
  const T = ((window as any).Assets && (window as any).Assets.T) || {};
  const settings = new RenderSettings(T);
  const TID = settings.tileId.bind(settings);
  const WATER_TILES = settings.waterTiles;
  const SPEC_TILES = settings.specTiles;
  const EMIS_TILES = settings.emisTiles;

  const shaders = createShaderLibrary(TILE, MAX_LIGHTS, MAX_PLS, PL_FACE, PL_NEAR);
  const math = new RenderMath();
  const perspective = math.perspective.bind(math);
  const lookAt = math.lookAt.bind(math);
  const mul = math.multiply.bind(math);
  const hexRGB = math.hexRGB.bind(math);
  const ortho = math.ortho.bind(math);

  const runtime = new WebGLRuntime();
  const graph = new ThreeSceneGraph(MAX_LIGHTS);
  const {
    lightPos, lightCol, clearColor, uniforms: U, depthMVP, camera, scene,
    terrainGroup, waterGroup, dropGroup, spriteGroup, overheadGroup, weatherGroup,
  } = graph;

  // Renderer timings are deliberately opt-in. The default path does not call
  // performance.now() or retain timing data, so diagnostics cannot become a
  // hidden cost in exported games.
  const perfTraceEnabled = (() => {
    try {
      const q = new URLSearchParams(window.location.search);
      return q.get("perf") === "runtime.renderer" || q.get("perfRenderer") === "1";
    } catch {
      return false;
    }
  })();
  const perfTrace = {
    frameMs: 0,
    setupMs: 0,
    sunShadowMs: 0,
    pointShadowMs: 0,
    reflectionMs: 0,
    sceneMs: 0,
    postMs: 0,
  };

  const materialFactory = new ShaderMaterialFactory(shaders, U, () => cfg);
  const waterMaterial = materialFactory.waterMaterial.bind(materialFactory);
  const makeTexture = materialFactory.makeTexture.bind(materialFactory);
  const batchGeometry = materialFactory.batchGeometry.bind(materialFactory);
  const batchMesh = materialFactory.batchMesh.bind(materialFactory);

  const postProcess = new PostProcessRenderer(materialFactory, shaders, camera, FOV);
  const mapWorldRenderer = new MapWorldRenderer(TILE);

  const available = (options: any = {}) =>
    runtime.available(options, {
      onContextLost: () => {
        shadowPass.reset(cfg.pointShadows);
      },
      onContextRestored: () => {
        mapTextureCache = null;
        shadowPass.resetContext(cfg.pointShadows);
        if (lastWorldArgs) setWorld(lastWorldArgs);
        else if (lastMapArgs) setMap(lastMapArgs[0], lastMapArgs[1], lastMapArgs[2]);
      },
    });

  // ---------------------------- map scene ----------------------------
  let mapW = 0,
    mapH = 0,
    heights: any = null,
    mapDiag = 0;
  // The composed map starts at this active-map-relative tile coordinate.
  // Renderer inputs remain anchored at the active map's origin; geometry is
  // stored in composed-map-local coordinates.
  let worldBaseX = 0,
    worldBaseY = 0,
    worldSurfaceCount = 1;
  let lastSunFitKey = "";
  let cfg: any = { tilt: 50, bloom: 0, dof: 0, fog: null, lights: false, ambient: 0.45, shadows: 0, pointShadows: 0 };
  const gradeFor = settings.gradeFor.bind(settings);
  const cachedDayNightAt = settings.cachedDayNightAt.bind(settings);

  let mapDisposables: Array<{ dispose(): void }> = [];
  let mapTextureRevision = 0;
  let renderedTextureRevision = 0;
  let renderFrameId = 0;
  let renderedEngineTick = -1;
  let mapTextureCache: {
    lowerBuf: HTMLCanvasElement;
    upperBuf: HTMLCanvasElement;
    map: any;
    lower: Array<{ tex: THREE.CanvasTexture; canvas: HTMLCanvasElement; x: number; y: number; w: number; h: number }>;
    upper: Array<{ tex: THREE.CanvasTexture; canvas: HTMLCanvasElement; x: number; y: number; w: number; h: number }>;
  } | null = null;

  function hAt(tx: number, ty: number): number {
    if (!heights || tx < 0 || ty < 0 || tx >= mapW || ty >= mapH) return 0;
    return heights[ty * mapW + tx] || 0;
  }
  // Bilinear height in tile units at a continuous tile position, so sprites
  // glide up cliffs during a step instead of popping.
  function sampleH(rx: number, ry: number): number {
    const x0 = Math.floor(rx),
      y0 = Math.floor(ry);
    const fx = rx - x0,
      fy = ry - y0;
    const a = hAt(x0, y0) * (1 - fx) + hAt(x0 + 1, y0) * fx;
    const b = hAt(x0, y0 + 1) * (1 - fx) + hAt(x0 + 1, y0 + 1) * fx;
    return a * (1 - fy) + b * fy;
  }

  function quad(
    verts: number[],
    ax: number, ay: number, az: number, au: number, av: number,
    bx: number, by: number, bz: number, bu: number, bv: number,
    cx: number, cy: number, cz: number, cu: number, cvv: number,
    dx: number, dy: number, dz: number, du: number, dv: number,
    tint: number,
  ) {
    verts.push(
      ax, ay, az, au, av, tint, bx, by, bz, bu, bv, tint, cx, cy, cz, cu, cvv, tint,
      cx, cy, cz, cu, cvv, tint, bx, by, bz, bu, bv, tint, dx, dy, dz, du, dv, tint,
    );
  }

  // As quad(), but with an independent tint per corner (A=top-left, B=top-right,
  // C=bottom-left, D=bottom-right) — used for cliff-shaded wall faces. Passing a
  // single value for all four reproduces quad(...,tint) byte-for-byte, so the
  // cliffs-off path stays golden-identical.
  function quad4(
    verts: number[],
    ax: number, ay: number, az: number, au: number, av: number, tA: number,
    bx: number, by: number, bz: number, bu: number, bv: number, tB: number,
    cx: number, cy: number, cz: number, cu: number, cvv: number, tC: number,
    dx: number, dy: number, dz: number, du: number, dv: number, tD: number,
  ) {
    verts.push(
      ax, ay, az, au, av, tA, bx, by, bz, bu, bv, tB, cx, cy, cz, cu, cvv, tC,
      cx, cy, cz, cu, cvv, tC, bx, by, bz, bu, bv, tB, dx, dy, dz, du, dv, tD,
    );
  }

  // Cliff-face shade for one wall vertex (Stage D2). `level` is the vertex's
  // height in tile units, `h` the top of the cliff, `base` the flat face tint,
  // `foot` the height the exposed run starts at (the outward neighbour's height).
  // `edge` marks a vertex on a lateral corner (the perpendicular neighbour is
  // lower) so it reads as a chiselled outer edge.
  function cliffShade(base: number, level: number, h: number, foot: number, edge: boolean): number {
    const runH = Math.max(1, h - foot);
    const frac = (h - level) / runH; // 0 at the crest, 1 at the base
    let f = 1 - CLIFF_AO * frac;
    if (level >= h) f *= CLIFF_LIP; // sunlit lip along the very top edge
    if (edge) f *= CLIFF_EDGE;
    return base * f;
  }

  // Chop a prerendered map buffer into chunk textures. Each chunk gets its OWN
  // canvas (not a reused scratch): three uploads canvas textures lazily at
  // first render, so the source canvas must stay alive and untouched.
  function chopBuffer(buf: HTMLCanvasElement) {
    const list: Array<{
      tex: THREE.CanvasTexture;
      canvas: HTMLCanvasElement;
      x: number;
      y: number;
      w: number;
      h: number;
    }> = [];
    for (let y = 0; y < buf.height; y += CHUNK) {
      for (let x = 0; x < buf.width; x += CHUNK) {
        const w = Math.min(CHUNK, buf.width - x),
          h = Math.min(CHUNK, buf.height - y);
        const piece = document.createElement("canvas");
        piece.width = w;
        piece.height = h;
        piece.getContext("2d")!.drawImage(buf, x, y, w, h, 0, 0, w, h);
        list.push({ tex: makeTexture(piece), canvas: piece, x, y, w, h });
      }
    }
    return list;
  }

  // ---------------------- auto materials (Stage C) ----------------------
  // Normal map from a Sobel of the chunk's prerendered luminance (world-space,
  // y up), specular strength in alpha from the tile class, plus an emissive
  // color map (tile class, scaled by pixel luminance so bright panes glow and
  // dark frames don't). Raw DataTextures — a canvas would premultiply the
  // normal RGB by the spec alpha and corrupt it.
  function buildAuxTextures(
    ch: { canvas: HTMLCanvasElement; x: number; y: number; w: number; h: number },
    map: any,
  ): { mat: THREE.DataTexture; emis: THREE.DataTexture } {
    const w = ch.w,
      h = ch.h;
    const img = ch.canvas.getContext("2d")!.getImageData(0, 0, w, h).data;
    const lum = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) {
      lum[i] = (img[i * 4] * 0.299 + img[i * 4 + 1] * 0.587 + img[i * 4 + 2] * 0.114) / 255;
    }
    const mat = new Uint8Array(w * h * 4);
    const emis = new Uint8Array(w * h * 4);
    const S = 2.5; // relief strength
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const gx = lum[y * w + Math.min(w - 1, x + 1)] - lum[y * w + Math.max(0, x - 1)];
        const gy = lum[Math.min(h - 1, y + 1) * w + x] - lum[Math.max(0, y - 1) * w + x];
        const nx = -gx * S,
          nz = -gy * S;
        const il = 1 / Math.hypot(nx, 1, nz);
        mat[i * 4] = 128 + 127 * nx * il;
        mat[i * 4 + 1] = 128 + 127 * il;
        mat[i * 4 + 2] = 128 + 127 * nz * il;
      }
    }
    // Per-tile classes from the lower layers (ground + decor + decor2).
    const L = map.layers || {};
    const tileAt = (layer: any, tx: number, ty: number) =>
      layer ? layer[ty * map.width + tx] : 0;
    const tx0 = ch.x / TILE,
      ty0 = ch.y / TILE;
    const tx1 = Math.min(map.width, (ch.x + ch.w) / TILE),
      ty1 = Math.min(map.height, (ch.y + ch.h) / TILE);
    for (let ty = ty0; ty < ty1; ty++) {
      for (let tx = tx0; tx < tx1; tx++) {
        const ids = [tileAt(L.ground, tx, ty), tileAt(L.decor, tx, ty), tileAt(L.decor2, tx, ty)].map(TID);
        const isSpec = ids.some((id) => SPEC_TILES.has(id));
        const isEmis = ids.some((id) => EMIS_TILES.has(id));
        if (!isSpec && !isEmis) continue;
        const px0 = tx * TILE - ch.x,
          py0 = ty * TILE - ch.y;
        for (let py = py0; py < py0 + TILE; py++) {
          for (let px = px0; px < px0 + TILE; px++) {
            const i = py * w + px;
            if (isSpec) mat[i * 4 + 3] = 230;
            if (isEmis) {
              const e = Math.pow(lum[i], 1.5);
              emis[i * 4] = img[i * 4] * e;
              emis[i * 4 + 1] = img[i * 4 + 1] * e;
              emis[i * 4 + 2] = img[i * 4 + 2] * e;
              emis[i * 4 + 3] = 255;
            }
          }
        }
      }
    }
    const mk = (data: Uint8Array) => {
      const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
      t.magFilter = THREE.NearestFilter;
      t.minFilter = THREE.NearestFilter;
      t.wrapS = THREE.ClampToEdgeWrapping;
      t.wrapT = THREE.ClampToEdgeWrapping;
      t.generateMipmaps = false;
      t.colorSpace = THREE.NoColorSpace;
      t.needsUpdate = true;
      return t;
    };
    return { mat: mk(mat), emis: mk(emis) };
  }

  // UVs of one tile inside its chunk.
  function tileUV(chunk: { x: number; y: number; w: number; h: number }, tx: number, ty: number) {
    const px = tx * TILE - chunk.x,
      py = ty * TILE - chunk.y;
    return { u0: px / chunk.w, v0: py / chunk.h, u1: (px + TILE) / chunk.w, v1: (py + TILE) / chunk.h };
  }

  // Rebuild the whole scene for a map: chunk textures plus per-chunk meshes for
  // the flat ground + extruded blocks and the elevated overhead tiles.
  // Remembered so a webglcontextrestored handler can replay the last call.
  let lastMapArgs: any = null;
  let lastWorldArgs: HdRenderSurface[] | null = null;
  interface DirtyMapCell { x: number; y: number; }

  const validSurface = mapWorldRenderer.validSurface.bind(mapWorldRenderer);
  const composeWorld = mapWorldRenderer.composeWorld.bind(mapWorldRenderer);

  function refreshChunkTextures(
    source: HTMLCanvasElement,
    chunks: Array<{ tex: THREE.CanvasTexture; canvas: HTMLCanvasElement; x: number; y: number; w: number; h: number }>,
    dirtyCells?: readonly DirtyMapCell[],
  ): void {
    const dirtyChunks = dirtyCells && dirtyCells.length
      ? new Set(dirtyCells.map((cell) => `${Math.floor(cell.x * TILE / CHUNK)}:${Math.floor(cell.y * TILE / CHUNK)}`))
      : null;
    for (const ch of chunks) {
      if (dirtyChunks && !dirtyChunks.has(`${Math.floor(ch.x / CHUNK)}:${Math.floor(ch.y / CHUNK)}`)) continue;
      const dst = ch.canvas.getContext("2d")!;
      dst.clearRect(0, 0, ch.w, ch.h);
      dst.drawImage(source, ch.x, ch.y, ch.w, ch.h, 0, 0, ch.w, ch.h);
      ch.tex.needsUpdate = true;
    }
  }

  /** Refresh only the lower HD texture chunks touched by animated terrain.
   * The caller has already atomically recomposed the source buffer; this seam
   * only invalidates the corresponding GPU uploads. A full setMap rebuild is
   * still used for initial loads, map changes, and context restoration. */
  function updateMapTextures(
    lowerBuf: HTMLCanvasElement,
    upperBuf: HTMLCanvasElement,
    map: any,
    dirtyCells: readonly DirtyMapCell[],
  ): boolean {
    if (!runtime.ok || !dirtyCells.length) return false;
    if (
      !mapTextureCache ||
      mapTextureCache.lowerBuf !== lowerBuf ||
      mapTextureCache.upperBuf !== upperBuf ||
      mapTextureCache.map !== map
    ) return false;
    refreshChunkTextures(lowerBuf, mapTextureCache.lower, dirtyCells);
    mapTextureRevision++;
    return true;
  }

  /** Refresh only the composed chunks touched by one source map's animated
   * cells. The source buffers remain authoritative; only changed cells are
   * copied into the composed canvas and uploaded to matching GPU chunks. */
  function updateWorldTextures(surface: HdRenderSurface, dirtyCells: readonly DirtyMapCell[]): boolean {
    if (!runtime.ok || !dirtyCells.length || !lastWorldArgs || !mapTextureCache) return false;
    const source = lastWorldArgs.find((candidate) => candidate.map === surface.map);
    if (!source || source.lowerBuf !== surface.lowerBuf || source.upperBuf !== surface.upperBuf) return false;
    const lower = mapTextureCache.lowerBuf.getContext("2d");
    const upper = mapTextureCache.upperBuf.getContext("2d");
    if (!lower || !upper) return false;
    const shifted: DirtyMapCell[] = [];
    const dx = source.offsetX - worldBaseX;
    const dy = source.offsetY - worldBaseY;
    for (const cell of dirtyCells) {
      const x = cell.x + dx;
      const y = cell.y + dy;
      if (x < 0 || y < 0 || x >= mapW || y >= mapH) continue;
      lower.clearRect(x * TILE, y * TILE, TILE, TILE);
      upper.clearRect(x * TILE, y * TILE, TILE, TILE);
      lower.drawImage(source.lowerBuf, cell.x * TILE, cell.y * TILE, TILE, TILE, x * TILE, y * TILE, TILE, TILE);
      upper.drawImage(source.upperBuf, cell.x * TILE, cell.y * TILE, TILE, TILE, x * TILE, y * TILE, TILE, TILE);
      shifted.push({ x, y });
    }
    if (!shifted.length) return false;
    refreshChunkTextures(mapTextureCache.lowerBuf, mapTextureCache.lower, shifted);
    refreshChunkTextures(mapTextureCache.upperBuf, mapTextureCache.upper, shifted);
    mapTextureRevision++;
    return true;
  }

  function setMapInternal(lowerBuf: HTMLCanvasElement, upperBuf: HTMLCanvasElement, map: any): void {
    if (!runtime.ok) return;
    // Animated terrain mutates the same prerender buffers and calls setMap on
    // every frame advance. Refresh the existing CanvasTextures in place rather
    // than disposing/recreating the whole scene graph and all shadow helpers.
    if (
      mapTextureCache &&
      mapTextureCache.lowerBuf === lowerBuf &&
      mapTextureCache.upperBuf === upperBuf &&
      mapTextureCache.map === map
    ) {
      refreshChunkTextures(lowerBuf, mapTextureCache.lower);
      refreshChunkTextures(upperBuf, mapTextureCache.upper);
      mapTextureRevision++;
      return;
    }
    lastMapArgs = [lowerBuf, upperBuf, map];
    for (const d of mapDisposables) d.dispose();
    mapDisposables = [];
    // Depth-pass companions of the per-map meshes go with them (sprite-pool
    // meshes are persistent and keep theirs).
    for (const group of [terrainGroup, overheadGroup]) {
      for (const child of group.children) {
        (child.userData.depthMat as THREE.Material | undefined)?.dispose();
      }
    }
    terrainGroup.clear();
    waterGroup.clear();
    overheadGroup.clear();
    mapW = map.width;
    mapH = map.height;
    heights = map.heights || null;
    mapDiag = (mapW + mapH) * TILE;

    const c = map.hd2d || {};
    cfg = {
      tilt: Math.min(89, Math.max(25, Number(c.tilt) || 50)),
      bloom: c.bloom === true ? 0.45 : Math.max(0, Number(c.bloom) || 0),
      dof: c.dof === true ? 0.6 : Math.max(0, Number(c.dof) || 0),
      fog: c.fog
        ? {
            color: hexRGB((c.fog && c.fog.color) || "#101018"),
            near: Number(c.fog && c.fog.near) || 0, // 0 = derive from camera distance
            far: Number(c.fog && c.fog.far) || 0,
          }
        : null,
      lights: c.lights !== false,
      ambient: c.ambient == null ? 0.45 : Math.min(2, Math.max(0, Number(c.ambient))),
      // Stage B: shadows === true → default strength; number → 0..1 strength.
      shadows: c.shadows === true ? 0.5 : Math.min(1, Math.max(0, Number(c.shadows) || 0)),
      // Stage B.2: point-light shadows — true → full occlusion, number → 0..1.
      pointShadows: c.pointShadows === true ? 1 : Math.min(1, Math.max(0, Number(c.pointShadows) || 0)),
      // Stage C: animated water surface + auto-generated material maps.
      water: c.water === true ? 1 : Math.min(1, Math.max(0, Number(c.water) || 0)),
      materials: !!c.materials,
      // Stage D2: sculpt exposed block walls into rock cliffs (off → flat tint).
      cliffs: !!c.cliffs,
      // Stage E: ambient weather particles + soft character drop shadows.
      weather: typeof c.weather === "string" && WEATHER_COUNTS[c.weather] ? c.weather : "",
      dropShadows: !!c.dropShadows,
      // Stage D: post-stack toggles + day/night cycle.
      aces: !!c.aces,
      vignette: c.vignette === true ? 0.5 : Math.min(1, Math.max(0, Number(c.vignette) || 0)),
      grade: gradeFor(c.lut),
      ssao: c.ssao === true ? 0.55 : Math.min(1, Math.max(0, Number(c.ssao) || 0)),
      fxaa: !!c.fxaa,
      dayNight: !!c.dayNight,
      sun: c.sun || null,
    };
    shadowPass.reset(cfg.pointShadows);
    lastSunFitKey = "";
    // Sun direction (used by water glints now, the day/night cycle later) —
    // available even when sun shadows are off.
    {
      const sun = c.sun || {};
      const azDeg = Number.isFinite(Number(sun.azimuth)) ? Number(sun.azimuth) : 35;
      const elDeg = Math.min(85, Math.max(15, Number.isFinite(Number(sun.elevation)) ? Number(sun.elevation) : 55));
      const az = (azDeg * Math.PI) / 180,
        el = (elDeg * Math.PI) / 180;
      U.uSunDir.value[0] = Math.sin(az) * Math.cos(el);
      U.uSunDir.value[1] = Math.sin(el);
      U.uSunDir.value[2] = -Math.cos(az) * Math.cos(el);
    }
    // Toggle the shadow compile variants on the long-lived sprite-pool
    // materials (terrain/overhead materials are rebuilt below and pick the
    // defines up in sceneMaterial()).
    for (const p of spriteRenderer.entries()) {
      let dirty = false;
      for (const [def, on] of [
        ["SHADOWS", cfg.shadows > 0],
        ["POINT_SHADOWS", cfg.pointShadows > 0],
        ["CLIPY", cfg.water > 0],
        ["DAYNIGHT", !!cfg.dayNight],
      ] as const) {
        const has = !!p.mat.defines[def];
        if (on && !has) { p.mat.defines[def] = 1; dirty = true; }
        else if (!on && has) { delete p.mat.defines[def]; dirty = true; }
      }
      if (dirty) p.mat.needsUpdate = true;
    }
    if (cfg.shadows > 0) fitSunCamera(map, c.sun);

    const lower = chopBuffer(lowerBuf),
      upper = chopBuffer(upperBuf);
    mapTextureCache = { lowerBuf, upperBuf, map, lower, upper };
    mapTextureRevision++;

    // ground + blocks, batched per lower chunk texture
    for (const ch of lower) {
      const verts: number[] = [];
      // flat ground plane for this chunk (raised blocks simply cover their cells)
      quad(verts,
        ch.x, 0, ch.y, 0, 0, ch.x + ch.w, 0, ch.y, 1, 0,
        ch.x, 0, ch.y + ch.h, 0, 1, ch.x + ch.w, 0, ch.y + ch.h, 1, 1, 1);
      const tx0 = ch.x / TILE,
        ty0 = ch.y / TILE;
      const tx1 = Math.min(mapW, (ch.x + ch.w) / TILE),
        ty1 = Math.min(mapH, (ch.y + ch.h) / TILE);
      const Lyr = map.layers || {};
      const stairsAt = (tx: number, ty: number) => {
        if (T.stairs == null) return false;
        const i = ty * mapW + tx;
        return (
          (Lyr.ground && TID(Lyr.ground[i]) === T.stairs) ||
          (Lyr.decor && TID(Lyr.decor[i]) === T.stairs) ||
          (Lyr.decor2 && TID(Lyr.decor2[i]) === T.stairs)
        );
      };
      for (let ty = ty0; ty < ty1; ty++) {
        for (let tx = tx0; tx < tx1; tx++) {
          const h = hAt(tx, ty);
          // Stage E ramps: a stairs tile below a higher north neighbour slopes
          // up to it instead of rendering a flat top.
          const hN = hAt(tx, ty - 1);
          const ramp = hN > h && stairsAt(tx, ty);
          if (h <= 0 && !ramp) continue;
          const uv = tileUV(ch, tx, ty);
          const x0 = tx * TILE,
            x1 = x0 + TILE,
            z0 = ty * TILE,
            z1 = z0 + TILE,
            top = h * TILE;
          if (ramp) {
            const yN = hN * TILE;
            // sloped surface: north edge lifted to the neighbour's height
            quad(verts,
              x0, yN, z0, uv.u0, uv.v0, x1, yN, z0, uv.u1, uv.v0,
              x0, top, z1, uv.u0, uv.v1, x1, top, z1, uv.u1, uv.v1, 1);
            // triangular side skirts so the ramp reads as solid from the side
            verts.push(
              x1, yN, z0, uv.u1, uv.v0, TINT_EW, x1, top, z1, uv.u1, uv.v1, TINT_EW, x1, top, z0, uv.u1, uv.v1, TINT_EW,
              x0, yN, z0, uv.u0, uv.v0, TINT_EW, x0, top, z0, uv.u0, uv.v1, TINT_EW, x0, top, z1, uv.u0, uv.v1, TINT_EW,
            );
          } else {
            // top face, textured with the tile's own prerendered appearance
            quad(verts,
              x0, top, z0, uv.u0, uv.v0, x1, top, z0, uv.u1, uv.v0,
              x0, top, z1, uv.u0, uv.v1, x1, top, z1, uv.u1, uv.v1, 1);
          }
          // exposed walls, one tile-unit segment at a time, auto-shaded. With
          // map.hd2d.cliffs on each face is sculpted per-corner (Stage D2); off,
          // the four corners collapse to the flat face tint and the verts are
          // byte-identical to Stage E. North walls face away from the fixed
          // camera and are never visible.
          const cl = cfg.cliffs;
          for (let foot = hAt(tx, ty + 1), k = foot; k < h; k++) { // south
            const eW = cl && hAt(tx - 1, ty) <= k, eE = cl && hAt(tx + 1, ty) <= k;
            const uT = cl ? cliffShade(TINT_S, k + 1, h, foot, eW) : TINT_S,
              vT = cl ? cliffShade(TINT_S, k + 1, h, foot, eE) : TINT_S,
              uB = cl ? cliffShade(TINT_S, k, h, foot, eW) : TINT_S,
              vB = cl ? cliffShade(TINT_S, k, h, foot, eE) : TINT_S;
            quad4(verts,
              x0, (k + 1) * TILE, z1, uv.u0, uv.v0, uT, x1, (k + 1) * TILE, z1, uv.u1, uv.v0, vT,
              x0, k * TILE, z1, uv.u0, uv.v1, uB, x1, k * TILE, z1, uv.u1, uv.v1, vB);
          }
          for (let foot = hAt(tx + 1, ty), k = foot; k < h; k++) { // east
            const eS = cl && hAt(tx, ty + 1) <= k, eN = cl && hAt(tx, ty - 1) <= k;
            const uT = cl ? cliffShade(TINT_EW, k + 1, h, foot, eS) : TINT_EW,
              vT = cl ? cliffShade(TINT_EW, k + 1, h, foot, eN) : TINT_EW,
              uB = cl ? cliffShade(TINT_EW, k, h, foot, eS) : TINT_EW,
              vB = cl ? cliffShade(TINT_EW, k, h, foot, eN) : TINT_EW;
            quad4(verts,
              x1, (k + 1) * TILE, z1, uv.u0, uv.v0, uT, x1, (k + 1) * TILE, z0, uv.u1, uv.v0, vT,
              x1, k * TILE, z1, uv.u0, uv.v1, uB, x1, k * TILE, z0, uv.u1, uv.v1, vB);
          }
          for (let foot = hAt(tx - 1, ty), k = foot; k < h; k++) { // west
            const eN = cl && hAt(tx, ty - 1) <= k, eS = cl && hAt(tx, ty + 1) <= k;
            const uT = cl ? cliffShade(TINT_EW, k + 1, h, foot, eN) : TINT_EW,
              vT = cl ? cliffShade(TINT_EW, k + 1, h, foot, eS) : TINT_EW,
              uB = cl ? cliffShade(TINT_EW, k, h, foot, eN) : TINT_EW,
              vB = cl ? cliffShade(TINT_EW, k, h, foot, eS) : TINT_EW;
            quad4(verts,
              x0, (k + 1) * TILE, z0, uv.u0, uv.v0, uT, x0, (k + 1) * TILE, z1, uv.u1, uv.v0, vT,
              x0, k * TILE, z0, uv.u0, uv.v1, uB, x0, k * TILE, z1, uv.u1, uv.v1, vB);
          }
        }
      }
      const aux = cfg.materials ? buildAuxTextures(ch, map) : null;
      const mesh = batchMesh(verts, ch.tex, aux);
      // XZ bounds for the point-shadow pass's per-light cull.
      mesh.userData.rect = { x0: ch.x, z0: ch.y, x1: ch.x + ch.w, z1: ch.y + ch.h };
      terrainGroup.add(mesh);
      mapDisposables.push(mesh.geometry, mesh.material as THREE.Material, ch.tex);
      if (aux) mapDisposables.push(aux.mat, aux.emis);

      // ---- animated water surface for this chunk (Stage C) ----
      if (cfg.water > 0) {
        const ground = map.layers && map.layers.ground;
        const isWater = (tx: number, ty: number) =>
          !!ground && tx >= 0 && ty >= 0 && tx < mapW && ty < mapH &&
          WATER_TILES.has(TID(ground[ty * mapW + tx]));
        // foam at corners that touch any non-water tile
        const foamAt = (cx: number, cy: number) =>
          isWater(cx - 1, cy - 1) && isWater(cx, cy - 1) && isWater(cx - 1, cy) && isWater(cx, cy) ? 0 : 1;
        const wverts: number[] = [];
        for (let ty = ty0; ty < ty1; ty++) {
          for (let tx = tx0; tx < tx1; tx++) {
            if (!isWater(tx, ty)) continue;
            const uv = tileUV(ch, tx, ty);
            const y = hAt(tx, ty) * TILE + WATER_Y;
            const x0 = tx * TILE, x1 = x0 + TILE, z0 = ty * TILE, z1 = z0 + TILE;
            const fA = foamAt(tx, ty), fB = foamAt(tx + 1, ty),
              fC = foamAt(tx, ty + 1), fD = foamAt(tx + 1, ty + 1);
            wverts.push(
              x0, y, z0, uv.u0, uv.v0, fA, x1, y, z0, uv.u1, uv.v0, fB, x0, y, z1, uv.u0, uv.v1, fC,
              x0, y, z1, uv.u0, uv.v1, fC, x1, y, z0, uv.u1, uv.v0, fB, x1, y, z1, uv.u1, uv.v1, fD,
            );
          }
        }
        if (wverts.length) {
          const { geo } = batchGeometry(wverts);
          const wmesh = new THREE.Mesh(geo, waterMaterial(ch.tex, ch.w, ch.h));
          wmesh.frustumCulled = false;
          wmesh.matrixAutoUpdate = false;
          wmesh.userData.rect = { x0: ch.x, z0: ch.y, x1: ch.x + ch.w, z1: ch.y + ch.h };
          waterGroup.add(wmesh);
          // ch.tex is disposed with the terrain mesh above — only our own here.
          mapDisposables.push(wmesh.geometry, wmesh.material as THREE.Material);
        }
      }
    }

    // overhead tiles float one tile unit above their ground height
    const over = map.layers && map.layers.over;
    for (const ch of upper) {
      const verts: number[] = [];
      const tx0 = ch.x / TILE,
        ty0 = ch.y / TILE;
      const tx1 = Math.min(mapW, (ch.x + ch.w) / TILE),
        ty1 = Math.min(mapH, (ch.y + ch.h) / TILE);
      for (let ty = ty0; ty < ty1; ty++) {
        for (let tx = tx0; tx < tx1; tx++) {
          if (!over || !over[ty * mapW + tx]) continue;
          const uv = tileUV(ch, tx, ty);
          const y = (hAt(tx, ty) + 1) * TILE;
          quad(verts,
            tx * TILE, y, ty * TILE, uv.u0, uv.v0, (tx + 1) * TILE, y, ty * TILE, uv.u1, uv.v0,
            tx * TILE, y, (ty + 1) * TILE, uv.u0, uv.v1, (tx + 1) * TILE, y, (ty + 1) * TILE, uv.u1, uv.v1, 1);
        }
      }
      if (!verts.length) {
        // Keep the texture in the refresh cache. It is still disposed through
        // mapDisposables when the map is replaced, and retaining it avoids a
        // special-case texture list for animated buffer refreshes.
        mapDisposables.push(ch.tex);
        continue;
      }
      const mesh = batchMesh(verts, ch.tex);
      mesh.userData.rect = { x0: ch.x, z0: ch.y, x1: ch.x + ch.w, z1: ch.y + ch.h };
      overheadGroup.add(mesh);
      mapDisposables.push(mesh.geometry, mesh.material as THREE.Material, ch.tex);
    }
  }

  const shadowPass = new ShadowPassRenderer({
    shaders,
    uniforms: U,
    lightPos,
    lightCol,
    depthMVP,
    scene,
    camera,
    terrainGroup,
    spriteGroup,
    overheadGroup,
    waterGroup,
    dropGroup,
    weatherGroup,
    tile: TILE,
    maxPointLights: MAX_PLS,
    pointFace: PL_FACE,
    pointNear: PL_NEAR,
    pointWidth: PL_W,
    pointHeight: PL_H,
    perspective,
    lookAt,
    multiply: mul,
    ortho,
    getConfig: () => cfg,
  });
  const fitSunCamera = shadowPass.fitSunCamera.bind(shadowPass);
  const reflectionRenderer = new ReflectionPassRenderer({
    waterGroup,
    dropGroup,
    weatherGroup,
    uniforms: U,
    scene,
    camera,
    clearColor,
    multiply: mul,
    waterY: WATER_Y,
  });

  const setViewCull = (camX: number, camY: number, viewW: number, viewH: number, on: boolean) =>
    graph.setViewCull(camX, camY, viewW, viewH, TILE, on);

  const weatherRenderer = new WeatherRenderer({
    shaders,
    uniforms: U,
    group: weatherGroup,
  });

  const spriteRenderer = new SpriteRenderer({
    factory: materialFactory,
    shaders,
    uniforms: U,
    spriteGroup,
    dropGroup,
    tile: TILE,
    onPoolExtended: () => {
      if (cfg.pointShadows > 0) shadowPass.invalidatePrograms();
    },
  });
  const framePipeline = new RenderFramePipeline({
    spriteRenderer,
    weatherRenderer,
    shadowPass,
    reflectionPass: reflectionRenderer,
    postProcess,
    waterGroup,
    scene,
    camera,
    clearColor,
    setViewCull,
  });

  function setMap(lowerBuf: HTMLCanvasElement, upperBuf: HTMLCanvasElement, map: any): void {
    worldBaseX = 0;
    worldBaseY = 0;
    worldSurfaceCount = 1;
    lastWorldArgs = null;
    setMapInternal(lowerBuf, upperBuf, map);
  }

  function setWorld(surfaces: HdRenderSurface[]): void {
    if (!runtime.ok) return;
    const valid = Array.isArray(surfaces) ? surfaces.filter(validSurface) : [];
    if (!valid.length) return;
    if (valid.length === 1 && valid[0].offsetX === 0 && valid[0].offsetY === 0) {
      setMap(valid[0].lowerBuf, valid[0].upperBuf, valid[0].map);
      return;
    }
    const composed = composeWorld(valid);
    worldBaseX = composed.baseX;
    worldBaseY = composed.baseY;
    worldSurfaceCount = valid.length;
    lastWorldArgs = valid.map((surface) => ({ ...surface }));
    setMapInternal(composed.lowerBuf, composed.upperBuf, composed.map);
  }

  // ---------------------------- frame ----------------------------
  // Render one frame. camX/camY are the engine's clamped 2D camera origin; the
  // look-at target reuses them so the 3D camera tracks like the 2D one.
  // sprites: [{canvas, rx, ry, pr}] in tile coords; pr 0|1|2 = below/same/above.
  function renderFrame(w: number, h: number, camX: number, camY: number, sprites: any[], extra: any) {
    if (!runtime.ok || !runtime.renderer || !runtime.gl || runtime.gl.isContextLost()) return null;
    const perfFrameStart = perfTraceEnabled ? performance.now() : 0;
    if (perfTraceEnabled) {
      perfTrace.frameMs = 0;
      perfTrace.setupMs = 0;
      perfTrace.sunShadowMs = 0;
      perfTrace.pointShadowMs = 0;
      perfTrace.reflectionMs = 0;
      perfTrace.sceneMs = 0;
      perfTrace.postMs = 0;
    }
    extra = extra || {};
    const r = runtime.renderer;
    if (runtime.isLost() || !r) return null;
    runtime.resize(w, h);

    const tiltDeg = Math.min(89, Math.max(25, extra.tilt != null ? Number(extra.tilt) : cfg.tilt));
    const pitch = (tiltDeg * Math.PI) / 180;
    const zoom = Math.max(0.25, Math.min(4, Number(extra.zoom) || 1));
    const ambient =
      extra.ambient != null ? Math.min(2, Math.max(0, Number(extra.ambient))) : cfg.ambient;
    const dist = h / 2 / Math.tan(FOV / 2) / zoom;
    const near = dist / 10,
      far = dist * 2 + mapDiag;
    // Screen-space shake → world pan of the whole camera (eye + target together).
    const shX = (extra.shakeX || 0) / zoom,
      shZ = (extra.shakeY || 0) / zoom;
    const tX = camX - worldBaseX * TILE + w / zoom / 2 + shX,
      tZ = camY - worldBaseY * TILE + h / zoom / 2 + shZ;
    const eye = [tX, dist * Math.sin(pitch), tZ + dist * Math.cos(pitch)];
    const mvp = mul(perspective(FOV, w / h, near, far), lookAt(eye[0], eye[1], eye[2], tX, 0, tZ));
    U.uMVP.value.fromArray(mvp); // both column-major — direct copy
    U.uEye.value[0] = eye[0];
    U.uEye.value[1] = eye[1];
    U.uEye.value[2] = eye[2];

    if (cfg.fog) {
      U.uFog.value.set([cfg.fog.color[0], cfg.fog.color[1], cfg.fog.color[2], 1]);
      U.uFogRange.value[0] = cfg.fog.near || dist;
      U.uFogRange.value[1] = cfg.fog.far || dist * 2.2;
    } else {
      U.uFog.value.set([0, 0, 0, 0]);
      U.uFogRange.value[0] = 1;
      U.uFogRange.value[1] = 2;
    }
    // Ambient is always the base light level; point-light events (already gated
    // by the host's "Point lights" toggle) add on top of it.
    const lights = (cfg.lights && extra.lights) || [];
    if (cfg.pointShadows > 0 && lights.length > 1) {
      // Shadow casters are the first MAX_PLS entries — sort by distance to the
      // camera target so the closest lights are the ones that cast. `lights`
      // is a frame-local host array (as is `sprites`, sorted below), so sorting
      // it in place avoids cloning the whole light list every frame.
      const d2 = (L: any) => ((L.rx - worldBaseX + 0.5) * TILE - tX) ** 2 + ((L.ry - worldBaseY + 0.5) * TILE - tZ) ** 2;
      lights.sort((a: any, b: any) => d2(a) - d2(b));
    }
    const nLights = Math.min(lights.length, MAX_LIGHTS);
    for (let i = 0; i < nLights; i++) {
      const L = lights[i];
      lightPos[i * 4] = (L.rx - worldBaseX + 0.5) * TILE;
      lightPos[i * 4 + 1] = sampleH(L.rx - worldBaseX, L.ry - worldBaseY) * TILE + TILE * 0.75;
      lightPos[i * 4 + 2] = (L.ry - worldBaseY + 0.5) * TILE;
      lightPos[i * 4 + 3] = Math.max(1, L.radius);
      const rgb = hexRGB(L.color);
      lightCol[i * 3] = rgb[0];
      lightCol[i * 3 + 1] = rgb[1];
      lightCol[i * 3 + 2] = rgb[2];
    }
    U.uAmbient.value = ambient;
    U.uLightCount.value = nLights;
    // Stage C: tick-driven time (determinism: hosts pass the engine tick),
    // emissive glow engagement (full at pitch black, zero at default ambient),
    // and the water shader's screen size for its reflection lookup.
    U.uTime.value = (Number(extra.t) || 0) / 60;
    U.uScreen.value[0] = w;
    U.uScreen.value[1] = h;
    // Stage D: day/night — the hour drives the sun's position, a tinted &
    // scaled ambient (folded into uAmbTint), sun-shadow strength, and the
    // emissive glow below. Everything derives from extra.timeOfDay, which the
    // engine owns (map default / script hooks) — nothing here ticks on its own.
    let effAmbient = ambient;
    let sunDl = 1;
    if (cfg.dayNight) {
      const h24 = Number.isFinite(Number(extra.timeOfDay))
        ? Math.min(24, Math.max(0, Number(extra.timeOfDay)))
        : 12;
      const dn = cachedDayNightAt(h24);
      sunDl = dn.daylight;
      effAmbient = ambient * dn.scale;
      for (let i = 0; i < 3; i++) U.uAmbTint.value[i] = dn.tint[i] * dn.scale;
      const az = (dn.azimuth * Math.PI) / 180,
        el = (dn.elevation * Math.PI) / 180;
      U.uSunDir.value[0] = Math.sin(az) * Math.cos(el);
      U.uSunDir.value[1] = Math.sin(el);
      U.uSunDir.value[2] = -Math.cos(az) * Math.cos(el);
      const sunKey = h24 + ":" + dn.azimuth + ":" + dn.elevation;
      if (cfg.shadows > 0 && lastMapArgs && lastSunFitKey !== sunKey) {
        fitSunCamera(lastMapArgs[2], { azimuth: dn.azimuth, elevation: dn.elevation });
        lastSunFitKey = sunKey;
      }
    }
    U.uGlow.value = Math.min(1, Math.max(0, (0.45 - effAmbient) / 0.45));
    if (perfTraceEnabled) perfTrace.setupMs = performance.now() - perfFrameStart;

    const clear = cfg.fog ? cfg.fog.color : [16 / 255, 16 / 255, 24 / 255];
    framePipeline.render({
      renderer: r,
      sprites,
      cfg,
      extra,
      width: w,
      height: h,
      runtimeWidth: runtime.width,
      runtimeHeight: runtime.height,
      camX,
      camY,
      shakeX: shX,
      shakeZ: shZ,
      worldBaseX,
      worldBaseY,
      tile: TILE,
      zoom,
      targetX: tX,
      targetZ: tZ,
      mvp,
      clear,
      near,
      far,
      distance: dist,
      eye,
      sunDaylight: sunDl,
      lightCount: nLights,
      sampleHeight: sampleH,
      timing: perfTrace,
      perfTraceEnabled,
    });
    renderFrameId++;
    renderedTextureRevision = mapTextureRevision;
    renderedEngineTick = Number.isFinite(Number(extra.t)) ? Number(extra.t) : -1;
    if (perfTraceEnabled) perfTrace.frameMs = performance.now() - perfFrameStart;
    return runtime.element;
  }

  // True while the GL context is lost (between webglcontextlost and a
  // successful webglcontextrestored rebuild). Lets the host fall back to the
  // Canvas 2D path for the duration instead of freezing on the last frame.
  function isLost(): boolean {
    return !runtime.ok || (!!runtime.gl && runtime.gl.isContextLost());
  }

  // Live GPU-side counters for the perf overlay and the memory-stability e2e
  // (Phase 7): draw calls / triangles reset per frame; geometries / textures
  // are three's alive-resource counts, the signal for dispose() leaks.
  function stats(): any {
    if (!runtime.renderer) return null;
    const info = runtime.renderer!.info;
    return {
      calls: info.render.calls,
      triangles: info.render.triangles,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      programs: info.programs ? info.programs.length : 0,
      mapTextureReady: !!mapTextureCache && renderedTextureRevision === mapTextureRevision,
      mapTextureRevision,
      renderedTextureRevision,
      renderFrameId,
      renderedEngineTick,
      surfaceCount: worldSurfaceCount,
      pointShadowEnabled: cfg.pointShadows > 0,
      pointShadowReady: cfg.pointShadows > 0 && shadowPass.ready,
      pointShadowRevision: shadowPass.revision,
      pointShadowFrameId: shadowPass.frameId,
      pointShadowSceneFrameId: shadowPass.sceneFrameId,
      pointShadowProgramsReady: shadowPass.programsReady,
      timings: perfTraceEnabled ? { ...perfTrace } : null,
    };
  }

  return { available, setMap, setWorld, updateMapTextures, updateWorldTextures, renderFrame, isLost, stats };
}
