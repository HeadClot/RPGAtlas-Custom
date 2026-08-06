/* RPGAtlas — src/engine/scenes/map-runtime.ts
   The map runtime, extracted verbatim from the js/engine.js monolith (Phase 1
   Stage B): map loading/prerender, tile passability, event runtimes and page
   resolution, HD-2D opt-in + event lights, entity queries/motion/routes, the
   on-map action-combat system (sword hitboxes, chase AI, touch damage, float
   texts, overlay drawing), and player-entity init. Logic unchanged; the
   monolith's closure state (map, buffers, evRTs, blockingRun, camera/shake
   scalars, globalT) is read/written through the shared engine context so the
   remaining engine code observes the same live values. gameOver is reached
   through fns (the gameover scene is extracted in a later step); this module
   self-installs fns.refreshAllPages for the quest runtime.
   GPL-3.0-or-later (see LICENSE). */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { Assets, Music, RA, Sfx } from "../../shared/deps.js";
import { Renderer } from "../../renderer/index.js";
import { drawLayerCell } from "../../shared/map/autotile-draw.js";
import { composeAdvBuffers, recomposeLowerCell } from "../../shared/map/layer-composite.js";
import { tileId } from "../../shared/map/tile-flags.js";
import { advanceRoute, eventMayStep, type RouteOps } from "../../shared/map/move-route.js";
import { syncAutotileRegistry } from "../../shared/map/autotile-load.js";
import { scanAnimatedCells, redrawAnimatedCells, frameAtTick } from "../../shared/map/autotile-anim.js";
import { anyAutotileAnimated, isAutotileId, autotilePassable } from "../../shared/map/autotile-registry.js";
import { clamp, rnd, rndf, compareVariable, sysSe } from "../util.js";
import { DEVELOPER_THROUGH_ACTION } from "../developer-mode.js";
import { ctx, fns } from "../state/engine-context.js";
import { G, Quests, objectiveDone, onEnemyKilled, addInv, invCount, param } from "../state/game-state.js";
import { Plugins } from "../plugin-runtime.js";
import { setAmbience } from "../../shared/audio/audio-deck.js";
import { mergeCommandBgs } from "../../shared/audio/audio-math.js";
import { resetZoneState, zonePassAt, mapHasZones } from "./zone-runtime.js";
import { rebuildTileBehaviors, ladderAt, terrainTagAt, wrapX, wrapY } from "./tile-behavior.js";
import { resolvePictureSrc } from "./presentation-runtime.js";
import { deriveConnections } from "../../shared/map/map-connections.js";
import {
  applyHurt,
  attackHitsEntity,
  attackIsActive as sharedAttackIsActive,
  createCombatState,
  markDead,
  respawnIfReady,
  startAttack as sharedStartAttack,
  swordHitboxAt as sharedSwordHitboxAt,
  swordHitsEntity as sharedSwordHitsEntity,
  tickAttack,
} from "../../shared/sim/action-combat.js";
import { defaultWorld } from "../state/default-world.js";
import { playersOnMap } from "../../shared/sim/players.js";
import { resolveActorCombat, resolveEnemyCombat } from "../../shared/sim/combat-profiles.js";
import { playerDamageFor, selectCombatTarget } from "../../shared/sim/action-combat-adapter.js";
import type { CombatEvent } from "../../shared/sim/combat-persistence.js";
import { emitLocalCombat } from "../../shared/sim/local-combat-events.js";
import {
  applyActionState, canUseActionAbility, resolveActionAbility,
  resolveActorHotbar, selectEnemyCombatAbility, spendActionAbility, tickActionCooldowns, tickActionStates,
} from "../../shared/sim/combat-abilities.js";

const TILE = Assets.TILE;

function browserLoadout(): any {
  const actor = G.party && G.party[0];
  return {
    actorId: Number(actor && (actor.actorId || actor.id)) || 1,
    level: Number(actor && actor.level) || 1,
    weaponId: Number(actor && actor.weaponId) || undefined,
    weapon2Id: Number(actor && actor.weapon2Id) || undefined,
    armorId: Number(actor && actor.armorId) || undefined,
  };
}

// dev override until the editor exposes per-map HD-2D settings:
// ?hd2d=1 forces the HD-2D renderer on, ?hd2d=0 forces it off
const hdOverride = new URLSearchParams(location.search).get("hd2d");
export function hdMapEnabled(candidateMap: any): boolean {
  if (!candidateMap) return false;
  const hd = candidateMap.hd2d;
  if (hd && Object.prototype.hasOwnProperty.call(hd, "enabled")) return hd.enabled === true;
  if (hd && (hd.lights || hd.tilt != null || hd.ambient != null)) return true;
  return !!(candidateMap.lights && candidateMap.lights.length > 0);
}
function hdWanted(): boolean {
  if (hdOverride === "1") return true;
  if (hdOverride === "0") return false;
  return hdMapEnabled(ctx.map);
}

function tileAt(layer: any, x: any, y: any): any {
  return ctx.map.layers[layer][y * ctx.map.width + x];
}
export function tilePassable(x: any, y: any): boolean {
  // Looping maps (M4·A) fold out-of-range coordinates back into the grid;
  // wrapX/wrapY are identity on bounded maps (byte-identical movement).
  x = wrapX(x); y = wrapY(y);
  if (x < 0 || y < 0 || x >= ctx.map.width || y >= ctx.map.height) return false;
  // Collision/nav zones (Phase 8) are baked into a passOv-compatible overlay at
  // map load; a non-zero cell is an explicit force-block/force-pass that wins
  // over the tile's own passability. Guarded so a map with no such zones keeps
  // the verbatim passOv read below — byte-identical movement (goldens gate it).
  if (mapHasZones()) {
    const zo = zonePassAt(x, y);
    if (zo === 1) return true;
    if (zo === 2) return false;
  }
  const ov = ctx.map.passOv ? ctx.map.passOv[y * ctx.map.width + x] : 0;
  if (ov === 1) return true;
  if (ov === 2 || ov === 3) return false; // 3 = ledge: blocked for walking, jumped over (Phase 5)
  // Mask the Stage-E transform-flag bits off the raw id before the tile-def
  // lookup: a flipped/rotated floor is as passable as its unflipped self.
  const d2 = tileId(tileAt("decor2", x, y));
  if (d2 !== 0) return tileDefPass(d2);
  const d = tileId(tileAt("decor", x, y));
  if (d !== 0) return tileDefPass(d);
  const g = tileId(tileAt("ground", x, y));
  if (g === 0) return false;
  return tileDefPass(g);
}
/** Passability of a single (already flag-masked) tile id. Autotile terrain ids
 *  live above the Assets.tiles array, so their walkability comes from the
 *  project's autotile group `pass` flag rather than a tile def. */
function tileDefPass(id: any): boolean {
  if (isAutotileId(id)) return autotilePassable(ctx.proj && ctx.proj.autotiles, id);
  return Assets.tiles[id] ? Assets.tiles[id].pass : false;
}
/** The clock's band: morning 5–10, day 10–17, evening 17–21, night 21–5. */
export function timeBandOf(hour: any): string {
  const h2 = ((Number(hour) || 0) % 24 + 24) % 24;
  if (h2 >= 5 && h2 < 10) return "morning";
  if (h2 >= 10 && h2 < 17) return "day";
  if (h2 >= 17 && h2 < 21) return "evening";
  return "night";
}
function pageActive(evId: any, page: any): boolean {
  const c = page.cond;
  if (c.switchId && !G.switches[c.switchId]) return false;
  if (c.timeBand && timeBandOf(G.timeOfDay) !== c.timeBand) return false;
  if (c.varId && !compareVariable(G.vars[c.varId] || 0, c.varVal, c.cmp || ">=")) return false;
  if (c.selfSw && !G.selfSw[G.mapId + ":" + evId + ":" + c.selfSw]) return false;
  if (c.questId && Quests.status(c.questId) !== (c.questStatus || "active")) return false;
  if (c.objectiveQuestId) {
    const done = objectiveDone(c.objectiveQuestId, Number(c.objectiveIndex) || 0);
    if ((c.objectiveStatus || "completed") === "completed" ? !done : done) return false;
  }
  return true;
}
// HD-2D point lights are authored as events named "light [#rrggbb] [radius]",
// e.g. "light #ff9944 260". The light follows the event and obeys its pages.
function parseLight(name: any): any {
  if (!/^light\b/i.test(name || "")) return null;
  const light = { color: "#ffcc88", radius: 180 };
  for (const tok of String(name).slice(5).trim().split(/\s+/)) {
    if (/^#[0-9a-fA-F]{6}$/.test(tok)) light.color = tok;
    else if (/^\d+$/.test(tok)) light.radius = Number(tok);
  }
  return light;
}
function makeEvRT(evData: any): any {
  const rt = {
    ev: evData, x: evData.x, y: evData.y, rx: evData.x, ry: evData.y,
    prx: evData.x, pry: evData.y, // previous-tick render pos (for interpolation)
    dir: 0, frame: 1, animT: 0, moving: false, tx: 0, ty: 0,
    page: null, pageIndex: -1, erased: false, locked: false,
    moveT: 30 + rnd(90), route: null, speed: 0.05, charsetIdx: -1, kind: "",
    combat: null,
    light: parseLight(evData.name),
  };
  refreshPage(rt);
  return rt;
}
export function refreshPage(rt: any): void {
  let pi = -1;
  for (let i = rt.ev.pages.length - 1; i >= 0; i--) {
    if (pageActive(rt.ev.id, rt.ev.pages[i])) {
      pi = i;
      break;
    }
  }
  if (pi === rt.pageIndex) return;
  rt.pageIndex = pi;
  rt.page = pi >= 0 ? rt.ev.pages[pi] : null;
  if (rt.page) {
    rt.dir = rt.page.dir || 0;
    rt.charsetIdx = rt.page.charset
      ? Assets.charsetIndex(rt.page.charset)
      : -1;
    rt.kind = rt.charsetIdx >= 0 ? Assets.charsets[rt.charsetIdx].kind : "";
  } else {
    rt.charsetIdx = -1;
    rt.kind = "";
  }
  refreshEventCombat(rt);
}
export function refreshAllPages(): void {
  ctx.evRTs.forEach((rt: any) => {
    if (!rt.erased) refreshPage(rt);
  });
}
// The quest runtime (created before this module's functions can run) reaches
// refreshAllPages through the fns registry.
fns.refreshAllPages = refreshAllPages;

// Decode the project's autotile sheets into the shared registry once per
// project. Awaited before the first prerender so blobs are ready; subsequent
// map transfers reuse the decoded blocks (the registry is process-wide).
let autotilesSyncedFor: any = null;
function ensureAutotilesReady(): Promise<void> {
  if (autotilesSyncedFor === ctx.proj) return Promise.resolve();
  autotilesSyncedFor = ctx.proj;
  return new Promise((resolve) => syncAutotileRegistry(ctx.proj, resolve));
}

async function prerenderMap(useHd = true): Promise<{ lowerBuf: any; upperBuf: any }> {
  await ensureAutotilesReady();
  ctx.lowerBuf = document.createElement("canvas");
  ctx.lowerBuf.width = ctx.map.width * TILE;
  ctx.lowerBuf.height = ctx.map.height * TILE;
  ctx.upperBuf = document.createElement("canvas");
  ctx.upperBuf.width = ctx.lowerBuf.width;
  ctx.upperBuf.height = ctx.lowerBuf.height;
  const lg = ctx.lowerBuf.getContext("2d"),
    ug = ctx.upperBuf.getContext("2d");
  // A parallax map (M4·A) keeps the lower buffer transparent where no tile is
  // painted so the background shows through; classic maps keep the exact
  // opaque base fill (goldens gate it).
  if (!ctx.map.parallax) {
    lg.fillStyle = "#101018";
    lg.fillRect(0, 0, ctx.lowerBuf.width, ctx.lowerBuf.height);
  }
  const m = ctx.map;
  // Classic maps (no layersAdv) run the verbatim four-array composite the
  // renderer goldens protect. A generalized stack folds into the same two
  // buffers via the shared composite (below → lower, above → upper).
  if (!m.layersAdv) {
    const gr = m.layers.ground, dc = m.layers.decor, d2 = m.layers.decor2, ov = m.layers.over;
    for (let y = 0; y < m.height; y++) {
      for (let x = 0; x < m.width; x++) {
        const i = y * m.width + x;
        if (gr[i]) drawLayerCell(lg, gr, m.width, m.height, x, y, x * TILE, y * TILE, TILE, Assets.drawTile);
        if (dc[i]) drawLayerCell(lg, dc, m.width, m.height, x, y, x * TILE, y * TILE, TILE, Assets.drawTile);
        if (d2[i]) drawLayerCell(lg, d2, m.width, m.height, x, y, x * TILE, y * TILE, TILE, Assets.drawTile);
        if (ov[i]) drawLayerCell(ug, ov, m.width, m.height, x, y, x * TILE, y * TILE, TILE, Assets.drawTile);
      }
    }
  } else {
    composeAdvBuffers(lg, ug, m, Assets.drawTile, TILE);
  }
  // quadrant shadows (drawn into the lower buffer, under characters)
  if (ctx.map.shadows) {
    const H = TILE / 2;
    lg.fillStyle = "rgba(10,10,26,0.35)";
    for (let y = 0; y < ctx.map.height; y++) {
      for (let x = 0; x < ctx.map.width; x++) {
        const m2 = ctx.map.shadows[y * ctx.map.width + x];
        if (!m2) continue;
        if (m2 & 1) lg.fillRect(x * TILE, y * TILE, H, H);
        if (m2 & 2) lg.fillRect(x * TILE + H, y * TILE, H, H);
        if (m2 & 4) lg.fillRect(x * TILE, y * TILE + H, H, H);
        if (m2 & 8) lg.fillRect(x * TILE + H, y * TILE + H, H, H);
      }
    }
  }
  ctx.hdActive =
    useHd && hdWanted() &&
    typeof Renderer !== "undefined" &&
    (await Renderer.available());
  if (ctx.hdActive) await Renderer.setMap(ctx.lowerBuf, ctx.upperBuf, ctx.map);
  recordAnimatedCells();
  return { lowerBuf: ctx.lowerBuf, upperBuf: ctx.upperBuf };
}

interface NeighborBuffer {
  map: any;
  lowerBuf: HTMLCanvasElement;
  upperBuf: HTMLCanvasElement;
  evRTs: any[];
  animCells: any[];
  animFrames: Map<number, number>;
}
const neighborBuffers = new Map<number, NeighborBuffer>();

/** Build 2D buffers for connected maps without disturbing the active map's
 * runtime state. The active map remains the only simulated map; neighboring
 * events are rendered at their authored positions until they become active. */
async function warmConnectedMaps(): Promise<void> {
  if (!ctx.proj || !ctx.map || !ctx.map.worldOrigin) {
    neighborBuffers.clear();
    return;
  }
  const ids = new Set<number>();
  for (const c of deriveConnections(ctx.proj.maps)) {
    if (c.aMapId === ctx.map.id) ids.add(c.bMapId);
    if (c.bMapId === ctx.map.id) ids.add(c.aMapId);
  }
  for (const id of [...neighborBuffers.keys()]) if (!ids.has(id)) neighborBuffers.delete(id);
  const saved = { map: ctx.map, lower: ctx.lowerBuf, upper: ctx.upperBuf, hd: ctx.hdActive, anim: ctx.animCells };
  try {
    for (const id of ids) {
      const map = RA.byId(ctx.proj.maps, id);
      if (!map) continue;
      const old = neighborBuffers.get(id);
      if (old && old.map === map) continue;
      ctx.map = map;
      const buffers = await prerenderMap(false);
      neighborBuffers.set(id, {
        map,
        lowerBuf: buffers.lowerBuf,
        upperBuf: buffers.upperBuf,
        evRTs: map.events.map(makeEvRT),
        animCells: ctx.animCells || [],
        animFrames: new Map<number, number>(),
      });
    }
  } finally {
    ctx.map = saved.map; ctx.lowerBuf = saved.lower; ctx.upperBuf = saved.upper;
    ctx.hdActive = saved.hd; ctx.animCells = saved.anim;
  }
}

/** Neighbor buffers in render order. Returns an empty list for legacy maps. */
export function connectedMapBuffers(): NeighborBuffer[] {
  return [...neighborBuffers.values()];
}

/** Renderer surfaces for the active map and its directly touching neighbors.
 * Offsets are active-map-relative tile coordinates, so the renderer can keep
 * the player/camera contract unchanged while composing one HD world surface. */
export function connectedHdRenderSurfaces(): any[] {
  if (!ctx.map || !ctx.lowerBuf || !ctx.upperBuf) return [];
  const origin = ctx.map.worldOrigin;
  const surfaces: any[] = [{
    map: ctx.map, lowerBuf: ctx.lowerBuf, upperBuf: ctx.upperBuf, offsetX: 0, offsetY: 0,
  }];
  if (!origin) return surfaces;
  for (const neighbor of connectedMapBuffers()) {
    if (!neighbor.map.worldOrigin) continue;
    surfaces.push({
      map: neighbor.map,
      lowerBuf: neighbor.lowerBuf,
      upperBuf: neighbor.upperBuf,
      offsetX: neighbor.map.worldOrigin.x - origin.x,
      offsetY: neighbor.map.worldOrigin.y - origin.y,
    });
  }
  return surfaces;
}

/** Rebind the renderer after connected-map buffers have been warmed. Isolated
 * maps still use the existing single-map path through the same adapter. */
export function syncConnectedHdWorld(): void {
  if (!ctx.hdActive || typeof Renderer === "undefined" || typeof Renderer.setWorld !== "function") return;
  Renderer.setWorld(connectedHdRenderSurfaces());
}

// ---- animated terrain (Phase 8 Stage C) ----
// Cells painted with an animated terrain group are recorded once at prerender;
// a per-tick pass re-composites only those cells onto the lower buffer (and
// re-textures HD) when their frame advances. Absent any animated group the list
// is empty and tickMapAnim early-returns — zero cost for classic maps.
const ANIM_FRAME_STATE = new Map<number, number>();
function recordAnimatedCells(): void {
  ANIM_FRAME_STATE.clear();
  ctx.animCells = null;
  if (!anyAutotileAnimated()) return;
  const m = ctx.map;
  const layers: number[][] = m.layersAdv
    ? m.layersAdv.flatMap((L: any) =>
      L.type === "tile" ? [L.data] : L.type === "group" ? [] : [])
      .concat([m.layers.ground, m.layers.decor, m.layers.decor2, m.layers.over])
    : [m.layers.ground, m.layers.decor, m.layers.decor2, m.layers.over];
  const cells = scanAnimatedCells(layers, m.width, m.height);
  // Perf cap: an absurd number of animated cells (a whole 64x64 map of water)
  // would recompose ~4k cells/frame; keep it bounded so the loop can never
  // dominate a frame. Beyond the cap, only the first N animate (rare edge case).
  const ANIM_CELL_CAP = 2048;
  ctx.animCells = cells.length > ANIM_CELL_CAP ? cells.slice(0, ANIM_CELL_CAP) : cells;
}

/** Advance animated terrain onto the lower buffer for the current frame; called
 *  once per engine tick from the map update with the engine tick counter
 *  (ctx.globalT). Frames derive from that tick via frameAtTick, so terrain
 *  animation is perfectly deterministic under the golden-image frozen clock.
 *  Returns true when the buffer changed (so HD re-textures); no-op when nothing
 *  animates. */
export function tickMapAnim(tick: number): boolean {
  const frameFn = (fps: number, frames: number) => frameAtTick(tick, fps, frames, 60);
  const dirtyBySurface: Array<{
    surface: any;
    dirtyCells: Array<{ x: number; y: number }>;
  }> = [];
  const activeCells = ctx.animCells || [];
  if (activeCells.length && ctx.lowerBuf) {
    const dirtyCells: Array<{ x: number; y: number }> = [];
    if (redrawSurfaceAnimation(ctx.map, ctx.lowerBuf, activeCells, ANIM_FRAME_STATE, frameFn, dirtyCells)) {
      dirtyBySurface.push({ surface: null, dirtyCells });
    }
  }
  for (const neighbor of neighborBuffers.values()) {
    if (!neighbor.animCells.length) continue;
    const dirtyCells: Array<{ x: number; y: number }> = [];
    if (redrawSurfaceAnimation(neighbor.map, neighbor.lowerBuf, neighbor.animCells, neighbor.animFrames, frameFn, dirtyCells)) {
      dirtyBySurface.push({
        surface: { map: neighbor.map, lowerBuf: neighbor.lowerBuf, upperBuf: neighbor.upperBuf, offsetX: 0, offsetY: 0 },
        dirtyCells,
      });
    }
  }
  if (dirtyBySurface.length && ctx.hdActive && typeof Renderer !== "undefined") {
    // Re-upload only the lower chunks touched by terrain anim. Connected HD
    // worlds update the active source cells inside the composed world buffer;
    // isolated maps retain the original single-map seam.
    const surfaces = connectedHdRenderSurfaces();
    const connected = surfaces.length > 1;
    let needsFullRefresh = false;
    for (const update of dirtyBySurface) {
      const surface = update.surface || surfaces[0];
      const updated = connected && typeof Renderer.updateWorldTextures === "function"
        ? Renderer.updateWorldTextures(surface, update.dirtyCells)
        : typeof Renderer.updateMapTextures === "function" && !update.surface
          ? Renderer.updateMapTextures(ctx.lowerBuf, ctx.upperBuf, ctx.map, update.dirtyCells)
          : false;
      if (!updated) needsFullRefresh = true;
    }
    // Older renderer adapters, or a stale composed cache, use one full refresh
    // without dropping neighboring surfaces.
    if (needsFullRefresh) {
      if (connected && typeof Renderer.setWorld === "function") Renderer.setWorld(surfaces);
      else Renderer.setMap(ctx.lowerBuf, ctx.upperBuf, ctx.map);
    }
  }
  return dirtyBySurface.length > 0;
}

function redrawSurfaceAnimation(
  map: any,
  lowerBuf: HTMLCanvasElement,
  cells: any[],
  frameState: Map<number, number>,
  frameFn: (fps: number, frames: number) => number,
  dirtyCells: Array<{ x: number; y: number }>,
): boolean {
  const lg = lowerBuf.getContext("2d");
  if (!lg) return false;
  return redrawAnimatedCells(cells, frameFn, frameState, (x, y, frame) => {
    recomposeLowerCell(lg, map, x, y, frame, Assets.drawTile, TILE, "#101018");
    redrawCellShadow(lg, map, x, y);
    dirtyCells.push({ x, y });
  });
}

// Redraw the quadrant shadow for one cell after its tiles were recomposed
// (mirrors the shadow pass in prerenderMap, so a shadow over animated water is
// not lost). No-op when the map has no shadows or none on this cell.
function redrawCellShadow(lg: any, map: any, x: number, y: number): void {
  const sh = map.shadows;
  if (!sh) return;
  const mask = sh[y * map.width + x];
  if (!mask) return;
  const H = TILE / 2;
  lg.save();
  lg.globalCompositeOperation = "source-over";
  lg.globalAlpha = 1;
  lg.fillStyle = "rgba(10,10,26,0.35)";
  if (mask & 1) lg.fillRect(x * TILE, y * TILE, H, H);
  if (mask & 2) lg.fillRect(x * TILE + H, y * TILE, H, H);
  if (mask & 4) lg.fillRect(x * TILE, y * TILE + H, H, H);
  if (mask & 8) lg.fillRect(x * TILE + H, y * TILE + H, H, H);
  lg.restore();
}

// ---- parallax background (Project Compass M4·A) ----
// The map's scrolling under-layer (MZ parallax). Loaded per map load (or by
// the Change Parallax command); missing art draws nothing, never a crash.
let parallaxState: { cfg: any; img: any } | null = null;
export function setMapParallax(cfg: any): void {
  parallaxState = null;
  if (!cfg || !cfg.key) return;
  const src = resolvePictureSrc(cfg.key);
  if (!src || typeof Image === "undefined") return;
  const slot = { cfg, img: null as any };
  const img = new Image();
  img.onload = () => { if (parallaxState === slot) slot.img = img; };
  img.onerror = () => { /* missing art → no background, never a crash */ };
  img.src = src;
  parallaxState = slot;
}

function mapLoadNow(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function beginMapLoad(mapId: any): void {
  Object.assign(ctx.mapLoadDiagnostics, {
    mapId: Number(mapId),
    phase: "resolve-map",
    loading: true,
    ready: false,
    elapsedMs: 0,
    error: null,
    startedAt: mapLoadNow(),
  });
}

function mapLoadPhase(phase: string): void {
  const d = ctx.mapLoadDiagnostics;
  d.phase = phase;
  d.elapsedMs = Math.max(0, mapLoadNow() - d.startedAt);
}

function finishMapLoad(): void {
  const d = ctx.mapLoadDiagnostics;
  d.phase = "ready";
  d.loading = false;
  d.ready = true;
  d.elapsedMs = Math.max(0, mapLoadNow() - d.startedAt);
}

function failMapLoad(error: unknown): void {
  const d = ctx.mapLoadDiagnostics;
  d.phase = "error";
  d.loading = false;
  d.ready = false;
  d.elapsedMs = Math.max(0, mapLoadNow() - d.startedAt);
  d.error = error instanceof Error ? error.message : String(error);
}

/** Paint the parallax under the map buffers (Canvas-2D path). MZ origin
 *  semantics: `lock` scrolls 1:1 with the map ("!"-prefixed sources); a loop
 *  axis scrolls at half camera speed plus an s×/2 px-per-tick drift; a
 *  non-loop axis is fixed to the screen. Tiled to cover the view. */
export function drawMapParallax(g: any, camX: any, camY: any, viewW: any, viewH: any, t: any): void {
  const st = parallaxState;
  if (!st || !st.img) return;
  const cfg = st.cfg, img = st.img;
  const iw = img.width, ih = img.height;
  if (!iw || !ih) return;
  const ox = cfg.lock ? camX : cfg.loopX ? camX / 2 + (t * (Number(cfg.sx) || 0)) / 2 : 0;
  const oy = cfg.lock ? camY : cfg.loopY ? camY / 2 + (t * (Number(cfg.sy) || 0)) / 2 : 0;
  const x0 = -(((ox % iw) + iw) % iw);
  const y0 = -(((oy % ih) + ih) % ih);
  // Screen-space paint: the caller draws the map buffers at -camX/-camY in
  // this same transform, so the camera contribution lives inside ox/oy.
  for (let y = y0; y < viewH; y += ih) {
    for (let x = x0; x < viewW; x += iw) {
      g.drawImage(img, Math.round(x), Math.round(y));
    }
  }
}

export async function loadMap(mapId: any): Promise<void> {
  beginMapLoad(mapId);
  try {
    ctx.map = RA.byId(ctx.proj.maps, mapId);
    if (!ctx.map) {
      ctx.map = ctx.proj.maps[0];
      if (!ctx.map) throw new Error("Map " + mapId + " not found");
      mapId = ctx.map.id;
      ctx.mapLoadDiagnostics.mapId = Number(mapId);
    }
    // Saved or start positions can point outside this map (deleted/resized
    // maps, or the fallback above landing on a smaller map) — keep the player
    // inside the grid or movement and rendering both misbehave.
    if (G.player) {
      const px = clamp(G.player.x | 0, 0, ctx.map.width - 1);
      const py = clamp(G.player.y | 0, 0, ctx.map.height - 1);
      if (px !== G.player.x || py !== G.player.y) initPlayer(px, py, G.player.dir);
    }
    G.mapId = mapId;
    G.encSteps = 0;
    // Maps can pin the day/night clock on entry (blank = keep the current time).
    if (ctx.map.hd2d && ctx.map.hd2d.timeOfDay != null && ctx.map.hd2d.timeOfDay !== "") {
      G.timeOfDay = clamp(Number(ctx.map.hd2d.timeOfDay) || 0, 0, 24);
    }
    mapFloatTexts.length = 0;
    mapLoadPhase("prepare-map");
    // Tile behaviors (M4·A): rebuild the ladder/bush/counter/damage/terrain
    // cache + presence mask for this map. Zero per-step cost when none painted.
    rebuildTileBehaviors();
    // A battle-background override (RM 283) lasts until the next map load, and
    // the parallax resets to the map's own (RM 284 semantics).
    G.battlebackOverride = null;
    setMapParallax(ctx.map.parallax);
    ctx.evRTs = ctx.map.events.map(makeEvRT);
    ctx.parallels.clear();
    mapLoadPhase("prerender");
    await prerenderMap();
    mapLoadPhase("connected-maps");
    await warmConnectedMaps();
    syncConnectedHdWorld();
    mapLoadPhase("audio");
    Music.play(ctx.map.music || "none");
    // Ambience layers (Phase 6): diffed against the previous map's, so shared
    // layers keep looping seamlessly across a transfer. A command-owned BGS
    // (M4·B, RM 245) rides along until a map with its own ambience autoplays
    // (the MZ replace rule); maps without one take the exact old list.
    if (G.bgs && Array.isArray(ctx.map.ambience) && ctx.map.ambience.length) G.bgs = null;
    setAmbience(mergeCommandBgs(ctx.map.ambience || [], G.bgs));
    mapLoadPhase("plugins");
    Plugins.fire("mapLoad", ctx.map);
    // Gameplay zones (Phase 8): bake collision/nav into the pass overlay and reset
    // presence tracking. Runs AFTER mapLoad so the weather baseline captures the
    // map's intended weather (the weather plugin sets per-map weather on mapLoad).
    // Absent `zones` ⇒ empty state, zero per-step work.
    mapLoadPhase("zones");
    resetZoneState(ctx.map);
    finishMapLoad();
  } catch (error) {
    failMapLoad(error);
    throw error;
  }
}

export function entityAt(x: any, y: any, exclude?: any): any[] {
  x = wrapX(x); y = wrapY(y); // looping maps: events live at wrapped coords
  return ctx.evRTs.filter(
    (rt: any) =>
      rt !== exclude && !rt.erased && rt.page && rt.x === x && rt.y === y,
  );
}
export function blockingEventAt(x: any, y: any): any {
  return entityAt(x, y).find(
    (rt: any) => rt.page.priority === "same" && !rt.page.through,
  );
}
export function canEntityPass(rt: any, nx: any, ny: any): boolean {
  nx = wrapX(nx); ny = wrapY(ny); // looping maps: compare wrapped targets
  // Through, turned on for this character by a move-route step (the page flag
  // below is the authored, permanent one).
  if (rt.routeThrough) return true;
  if (rt.page && rt.page.through) return true;
  if (!tilePassable(nx, ny)) return false;
  if (blockingEventAt(nx, ny)) return false;
  if (
    G.player &&
    G.player.x === nx &&
    G.player.y === ny &&
    (!rt.page || rt.page.priority === "same")
  )
    return false;
  return true;
}
export function eventBlocksChaseTile(mover: any, other: any, x: any, y: any): boolean {
  if (mover && mover.page && mover.page.through) return false;
  if (!other || other === mover || other.erased || !other.page) return false;
  if (other.page.priority !== "same" || other.page.through) return false;
  if (other.x === x && other.y === y) return true;
  return !!(other.moving && other.tx === x && other.ty === y);
}
function canCombatChasePass(rt: any, nx: any, ny: any): boolean {
  if (!canEntityPass(rt, nx, ny)) return false;
  return !ctx.evRTs.some((other: any) => eventBlocksChaseTile(rt, other, nx, ny));
}
export function startMove(ent: any, dir: any): void {
  // followers trail the tile the player just left (Phase 5 Stage C)
  if (ent === G.player) noteFollowerCrumb(ent.x, ent.y, dir);
  // Direction Fix (a move-route step): the character walks without turning,
  // so a guard can sidestep while still watching the player. Unset on every
  // entity until a route sets it, so ordinary movement is unchanged.
  if (!ent.dirFix) ent.dir = dir;
  const [dx, dy] = DIRD[dir] || [0, 0];
  ent.tx = ent.x + dx;
  ent.ty = ent.y + dy;
  ent.moving = true;
}
export function dirTo(fx: any, fy: any, tx: any, ty: any): number {
  const dx = tx - fx,
    dy = ty - fy;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 2 : 1;
  return dy > 0 ? 0 : 3;
}
export const DIRD: any = {
  0: [0, 1], 1: [-1, 0], 2: [1, 0], 3: [0, -1],
  4: [-1, 1], 5: [1, 1], 6: [-1, -1], 7: [1, -1],
};
/** Diagonal grid steps may not squeeze between two blocked cardinal neighbors.
 *  Cardinal directions always pass this corner-only check. */
export function diagonalStepClear(x: any, y: any, dir: any, passable: any): boolean {
  const [dx, dy] = DIRD[dir] || [0, 0];
  return dx === 0 || dy === 0 || (
    passable(x + dx, y) && passable(x, y + dy)
  );
}
const mapFloatTexts: any[] = [];

function combatConfig(page: any): any {
  return page ? resolveEnemyCombat(ctx.proj as any, page) : null;
}
function combatEnemy(cfg: any): any {
  return RA.byId(ctx.proj.enemies || [], Number(cfg && cfg.enemyId) || 0);
}
function combatMaxHp(cfg: any, enemy: any): number {
  return Math.max(1, Number(cfg && cfg.hp) || Number(enemy && enemy.stats && enemy.stats.mhp) || 1);
}
function combatDefeatKey(rt: any): string {
  return String(G.mapId) + ":" + String(rt?.ev?.id ?? "");
}
function combatAi(cfg: any): string {
  return cfg && cfg.ai === "chase" ? "chase" : "none";
}
function refreshEventCombat(rt: any): void {
  const cfg = combatConfig(rt.page);
  const enemy = cfg && combatEnemy(cfg);
  if (!cfg || !enemy) {
    rt.combat = null;
    return;
  }
  if (cfg.persistentDefeat && G.combatDefeated && G.combatDefeated[combatDefeatKey(rt)]) {
    rt.combat = Object.assign(createCombatState(), {
      pageIndex: rt.pageIndex,
      enemyId: enemy.id,
      hp: 0,
      maxHp: combatMaxHp(cfg, enemy),
      dead: true,
      respawn: 0,
    });
    rt.erased = true;
    return;
  }
  if (rt.combat && rt.combat.pageIndex === rt.pageIndex && rt.combat.enemyId === enemy.id) return;
  rt.combat = Object.assign(createCombatState(), {
    pageIndex: rt.pageIndex,
    enemyId: enemy.id,
    hp: combatMaxHp(cfg, enemy),
    invuln: 0,
    hurtFlash: 0,
    attackCooldown: 0,
    stagger: 0,
    knockback: false,
    dead: false,
  });
}
function combatReady(rt: any): boolean {
  return !!(rt && rt.page && rt.combat && !rt.combat.dead && combatConfig(rt.page));
}
export function rectsOverlap(a: any, b: any): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
export function entityHurtbox(ent: any): any {
  return { x: ent.rx + 0.12, y: ent.ry + 0.10, w: 0.76, h: 0.86 };
}
export function swordHitboxAt(x: any, y: any, dir: any): any {
  return sharedSwordHitboxAt(x, y, dir);
}
export function swordHitsEntity(attacker: any, target: any, dir: any): boolean {
  return !!attacker && !!target && sharedSwordHitsEntity(attacker, target, dir);
}
export function tileDistance(a: any, b: any): number {
  if (!a || !b) return Infinity;
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}
function attackFrame(attack: any): number {
  return attack ? attack.total - attack.framesLeft : 999;
}
function attackIsActive(attack: any): boolean {
  const frame = attackFrame(attack);
  return !!attack && frame >= Number(attack.windup || 0) && frame < Number(attack.windup || 0) + Math.max(1, Number(attack.active || 1));
}
function addMapFloatText(text: any, x: any, y: any, color?: any): void {
  mapFloatTexts.push({
    text,
    x,
    y,
    color: color || "#ffffff",
    life: 46,
    total: 46,
  });
}
export function startPlayerAttack(): boolean {
  const p = G.player;
  if (!p || p.attack || p.moving) return false;
  const loadout = p.loadout || browserLoadout();
  const actor = resolveActorCombat(ctx.proj as any, loadout.actorId, loadout);
  p.combat = p.combat || createCombatState();
  p.combat.activeAbilityId = 0;
  p.combat.activeAbilityKind = null;
  if (p.combat.attackCooldown > 0 || !sharedStartAttack(p.combat, p.dir, actor.windupFrames, actor.activeFrames, actor.recoveryFrames)) return false;
  const total = actor.windupFrames + actor.activeFrames + actor.recoveryFrames;
  p.combat.attackCooldown = actor.cooldown;
  p.attack = { total, framesLeft: total, dir: p.dir, windup: actor.windupFrames, active: actor.activeFrames, hitbox: actor.hitbox, range: actor.range, knockbackTiles: actor.knockbackTiles, staggerFrames: actor.staggerFrames, hitIds: new Set() };
  p.animT = (p.animT || 0) + 1;
  sysSe(actor.attackSound || "miss");
  if (actor.animationId || actor.telegraphAnimationId || actor.telegraphSound) {
    emitLocalCombat({ tick: ctx.globalT || 0, kind: "telegraph", source: Number(p.id) || Number(defaultWorld.roster.local) || 0, target: 0, mapId: G.mapId, x: p.x, y: p.y, dir: p.dir, animationId: actor.telegraphAnimationId || actor.animationId, sound: actor.telegraphSound || actor.attackSound });
  }
  return true;
}

function mapActionCombatSettings(): any {
  const system = (ctx.proj.system && ctx.proj.system.actionCombat) || {};
  const map = (ctx.map && ctx.map.actionCombat) || {};
  return { enabled: !!(map.enabled ?? system.enabled), hotbarSlots: Number(map.hotbarSlots ?? system.hotbarSlots ?? 8), allowItems: map.allowItems ?? system.allowItems ?? true };
}

/** Start an authored Skill/Item hotbar action. This is the local host entry
 * point; network hosts call the equivalent runtime hook and resolve again. */
export function startPlayerAbility(slotIndex: number): boolean {
  const p = G.player;
  const settings = mapActionCombatSettings();
  if (!p || !settings.enabled || p.moving || p.attack || p.combat?.dead) return false;
  p.combat = p.combat || createCombatState();
  const lead: any = G.party && G.party[0];
  const loadout = p.loadout || browserLoadout();
  const actorId = Number(loadout.actorId) || Number(lead?.actorId || lead?.id) || 1;
  const slots = resolveActorHotbar(ctx.proj as any, actorId, settings.hotbarSlots);
  const slot = slots[Math.max(0, Math.floor(Number(slotIndex) || 0))];
  if (!slot || (slot.kind === "item" && !settings.allowItems)) return false;
  const kind = slot.kind as "skill" | "item";
  const ability = resolveActionAbility(ctx.proj as any, kind, slot.id);
  const resolvedActor = resolveActorCombat(ctx.proj as any, actorId, loadout);
  const mpMax = Number(lead?.maxMp || resolvedActor.maxMp || 0);
  const tpMax = Number(lead?.maxTp || resolvedActor.maxTp || 100);
  const resources = {
    mp: Number(lead?.mp ?? p.mp ?? 0), maxMp: mpMax, tp: Number(lead?.tp ?? p.tp ?? 0), maxTp: tpMax,
    cooldowns: p.combat.resourceCooldowns || (p.combat.resourceCooldowns = {}),
  };
  const check = canUseActionAbility(ability, resources, kind, kind === "item" ? invCount("item", slot.id) : 1);
  if (!check.ok || !ability) return false;
  spendActionAbility(ability, resources, kind);
  if (lead) { lead.mp = resources.mp; lead.tp = resources.tp; lead.maxMp = mpMax; lead.maxTp = tpMax; }
  p.mp = resources.mp; p.tp = resources.tp; p.maxMp = mpMax; p.maxTp = tpMax;
  if (slot.kind === "item" && (ability.targetMode === "self" || ability.targetMode === "nearestAlly" || ability.targetMode === "allAllies")) {
    const hp = Math.max(0, Number((ctx.proj.items || []).find((item: any) => Number(item.id) === slot.id)?.hp) || 0);
    const mp = Math.max(0, Number((ctx.proj.items || []).find((item: any) => Number(item.id) === slot.id)?.mp) || 0);
    if (lead) {
      lead.hp = Math.min(Number(lead.hp || 0) + hp, Number(lead.maxHp || param(lead, "mhp") || 999999));
      lead.mp = Math.min(Number(lead.mp || 0) + mp, mpMax);
      p.hp = lead.hp; p.mp = lead.mp;
    }
    emitLocalCombat({ tick: ctx.globalT || 0, kind: "damage", source: Number(p.id) || 0, target: Number(p.id) || 0, mapId: G.mapId, x: p.x, y: p.y, amount: -hp, hpAfter: p.hp, animationId: ability.hitAnimationId, sound: ability.hitSound });
    if (!ability.damage && !ability.stateId) return true;
  }
  const total = ability.windupFrames + ability.activeFrames + ability.recoveryFrames;
  if (!sharedStartAttack(p.combat, p.dir, ability.windupFrames, ability.activeFrames, ability.recoveryFrames)) return false;
  p.combat.activeAbilityId = ability.id;
  p.combat.activeAbilityKind = ability.kind;
  p.attack = { total, framesLeft: total, dir: p.dir, windup: ability.windupFrames, active: ability.activeFrames, hitbox: ability.hitbox, range: ability.range, knockbackTiles: ability.knockbackTiles, staggerFrames: ability.staggerFrames, ability, hitIds: new Set() };
  if (slot.kind === "item" && ability.consumeOnStart) addInv("item", slot.id, -1);
  emitLocalCombat({ tick: ctx.globalT || 0, kind: "telegraph", source: Number(p.id) || 0, target: 0, mapId: G.mapId, x: p.x, y: p.y, dir: p.dir, animationId: ability.telegraphAnimationId, sound: ability.telegraphSound });
  return true;
}
function mapAttackDamage(enemy: any, attacker: any = G.player): number {
  const def = Number(enemy && enemy.stats && enemy.stats.def) || 0;
  const actor = resolveActorCombat(ctx.proj as any, attacker?.loadout?.actorId || browserLoadout().actorId, attacker?.loadout || browserLoadout());
  return playerDamageFor(ctx.proj as any, attacker?.loadout || browserLoadout(), def) * actor.attackRate;
}

/** Apply authoritative combat outcomes to the browser presentation layer. */
export function presentCombatEvents(events: CombatEvent[]): void {
  for (const event of events) {
    if (event.animationId) {
      const targetId = Number(event.target) || 0;
      const target = targetId === Number(G.player?.id) || targetId === Number(defaultWorld.roster.local)
        ? G.player
        : ctx.evRTs.find((rt: any) => Number(rt.ev?.id) === targetId) || { rx: Number(event.x) || 0, ry: Number(event.y) || 0 };
      void fns.playMapAnimation?.(event.animationId, target, false);
    }
    if (event.kind === "damage" && typeof event.amount === "number") {
      addMapFloatText("-" + event.amount, Number(event.x) + 0.5, Number(event.y) - 0.15, event.target === G.player?.id ? "#ff8a8a" : "#ffd86a");
    } else if (event.kind === "telegraph") {
      addMapFloatText("!", Number(event.x) + 0.5, Number(event.y) - 0.45, "#ffcf66");
    } else if (event.kind === "defeat") {
      addMapFloatText("DEFEATED", Number(event.x) + 0.5, Number(event.y) - 0.1, "#f6e27a");
    } else if (event.kind === "playerDeath") {
      addMapFloatText("DOWN", Number(event.x) + 0.5, Number(event.y) - 0.1, "#ff8a8a");
    } else if (event.kind === "revive") {
      addMapFloatText("REVIVED", Number(event.x) + 0.5, Number(event.y) - 0.1, "#9dffb0");
    }
    if (event.sound) sysSe(event.sound);
    else if (event.kind === "damage" || event.kind === "hit") sysSe("hit");
  }
}
function applyEnemyKnockback(rt: any, dir: any, tiles: any): void {
  if (!rt || rt.moving || tiles <= 0) return;
  const [dx, dy] = DIRD[dir] || [0, 0];
  const nx = rt.x + dx;
  const ny = rt.y + dy;
  if (!diagonalStepClear(rt.x, rt.y, dir, (x: any, y: any) => canEntityPass(rt, x, y))) return;
  if (!canEntityPass(rt, nx, ny)) return;
  rt.combat.knockback = Math.max(0, Number(tiles) || 0) - 1;
  rt.combat.knockbackDir = dir;
  startMove(rt, dir);
}
function defeatMapEnemy(rt: any, cfg: any): void {
  if (!combatReady(rt)) return;
  const persistent = !!cfg.persistentDefeat;
  if (persistent) {
    G.combatDefeated = G.combatDefeated || {};
    G.combatDefeated[combatDefeatKey(rt)] = true;
  }
  markDead(rt.combat, persistent ? 0 : Number(cfg.respawnFrames) || 0);
  rt.combat.hp = 0;
  onEnemyKilled(rt.combat.enemyId);
  addMapFloatText("DEFEATED", rt.rx + 0.5, rt.ry - 0.1, "#f6e27a");
  emitLocalCombat({ tick: ctx.globalT || 0, kind: "defeat", target: rt.ev.id, mapId: G.mapId, eventId: rt.ev.id, x: rt.x, y: rt.y, animationId: cfg.animationId, sound: cfg.defeatSound });
  sysSe("crit");
  const sw = persistent ? cfg.defeatSelfSwitch : (Number(cfg.respawnFrames) > 0 ? "" : cfg.defeatSelfSwitch);
  if (sw) {
    G.selfSw[G.mapId + ":" + rt.ev.id + ":" + sw] = true;
    refreshAllPages();
  } else if (persistent || Number(cfg.respawnFrames) <= 0) {
    rt.erased = true;
  }
}
function damageMapEnemy(rt: any, attacker: any = G.player, ability: any = null): void {
  if (!combatReady(rt) || rt.combat.invuln > 0) return;
  const cfg = combatConfig(rt.page);
  const enemy = combatEnemy(cfg);
  const attackerDir = Number(attacker?.dir) || 0;
  const source = Number(attacker?.id) || Number(defaultWorld.roster.local) || 0;
  const loadout = attacker?.loadout || browserLoadout();
  const actor = resolveActorCombat(ctx.proj as any, loadout.actorId, loadout);
  const dmg = ability ? Math.max(1, Math.round((Number(ability.damage) || actor.damage) * (Number(ability.damageScale) || 1))) : mapAttackDamage(enemy, attacker);
  rt.combat.hp = Math.max(0, rt.combat.hp - dmg);
  rt.combat.invuln = Math.max(0, Number(cfg.invulnFrames) || 0);
  rt.combat.hurtFlash = 12;
  rt.combat.stagger = Math.max(rt.combat.stagger || 0, Number(ability?.staggerFrames) || actor.staggerFrames);
  if (ability?.stateId && ability.stateChance >= 100 || (ability?.stateId && rnd(100) < Number(ability.stateChance))) {
    const state = (ctx.proj.states || []).find((entry: any) => Number(entry.id) === Number(ability.stateId));
    if (state?.actionCombat) rt.combat.states = applyActionState(rt.combat.states || [], Number(ability.stateId), state.actionCombat);
  }
  addMapFloatText("-" + dmg, rt.rx + 0.5, rt.ry - 0.15, "#ffd86a");
  emitLocalCombat({ tick: ctx.globalT || 0, kind: "hit", source, target: rt.ev.id, mapId: G.mapId, eventId: rt.ev.id, attackId: attacker?.combat?.attackId, x: rt.x, y: rt.y, dir: attackerDir, animationId: ability?.hitAnimationId || actor.hitAnimationId, sound: ability?.hitSound || actor.hitSound });
  emitLocalCombat({ tick: ctx.globalT || 0, kind: "damage", source, target: rt.ev.id, mapId: G.mapId, eventId: rt.ev.id, amount: dmg, hpAfter: rt.combat.hp, x: rt.x, y: rt.y, dir: attackerDir, animationId: cfg.hurtAnimationId, sound: cfg.hurtSound });
  sysSe("hit");
  if (rt.combat.hp <= 0) {
    defeatMapEnemy(rt, cfg);
  } else {
    applyEnemyKnockback(rt, attackerDir, Number(ability?.knockbackTiles) || actor.knockbackTiles);
  }
}
function damagePlayerFromEnemy(rt: any, target: any = G.player): void {
  const cfg = combatConfig(rt.page);
  const ability = rt.combat?.activeAbilityId ? resolveActionAbility(ctx.proj as any, rt.combat.activeAbilityKind || "skill", rt.combat.activeAbilityId) : null;
  const dmg = ability ? Math.max(1, Math.round((Number(ability.damage) || Number(cfg && cfg.touchDamage) || 1) * (Number(ability.damageScale) || 1))) : Number(cfg && cfg.touchDamage) || 0;
  const actor = target === G.player ? G.party[0] : null;
  const loadout = target?.loadout || (actor ? { actorId: actor.actorId || actor.id, level: actor.level, weaponId: actor.weaponId, weapon2Id: actor.weapon2Id, armorId: actor.armorId } : browserLoadout());
  const resolvedActor = resolveActorCombat(ctx.proj as any, loadout.actorId, loadout);
  if (!target || !target.combat || !dmg || !sharedAttackIsActive(rt.combat) || target.combat.dead || target.combat.invuln > 0 || (target.hurtInvuln || 0) > 0) return;
  if (!attackHitsEntity(rt, target, rt.dir, ability?.hitbox || cfg.hitbox, ability?.range || cfg.attackRange)) return;
  rt.dir = dirTo(rt.x, rt.y, target.x, target.y);
  const hp = Math.max(0, Number(target.hp ?? actor?.hp ?? target.maxHp ?? 100) - dmg);
  target.hp = hp;
  if (actor) actor.hp = hp;
  applyHurt(target.combat, Math.round(resolvedActor.invulnFrames * resolvedActor.defenseRate), Number(cfg.staggerFrames) || 0);
  target.hurtInvuln = Math.round(resolvedActor.invulnFrames * resolvedActor.defenseRate);
  addMapFloatText("-" + dmg, target.rx + 0.5, target.ry - 0.2, "#ff8a8a");
  const targetId = Number(target.id) || (target === G.player ? Number(defaultWorld.roster.local) || 0 : 0);
  emitLocalCombat({ tick: ctx.globalT || 0, kind: "damage", source: rt.ev.id, target: targetId, mapId: G.mapId, eventId: rt.ev.id, amount: dmg, hpAfter: hp, x: target.x, y: target.y, animationId: ability?.hitAnimationId || cfg.hurtAnimationId, sound: ability?.hitSound || cfg.hurtSound });
  sysSe("hit");
  ctx.shakePower = 3;
  ctx.shakeSpeed = 6;
  ctx.shakeTimer = 12;
  ctx.shakeDuration = 12;
  if (hp <= 0) {
    const combatActor = resolvedActor;
    const reviveFrames = Math.max(1, combatActor.reviveFrames || 300);
    markDead(target.combat, reviveFrames);
    target.revive = reviveFrames;
    emitLocalCombat({ tick: ctx.globalT || 0, kind: "playerDeath", source: rt.ev.id, target: targetId, mapId: G.mapId, eventId: rt.ev.id, x: target.x, y: target.y, animationId: combatActor.defeatAnimationId, sound: combatActor.defeatSound });
  }
}
// Compatibility marker: the legacy contact path remains based on the shared
// configured contract `attackHitsEntity(rt, target, rt.dir, cfg.hitbox, cfg.attackRange)`.
export function updateMapCombat(): void {
  const p = G.player;
  const playerLoadout = p?.loadout || browserLoadout();
  const playerActor = p ? resolveActorCombat(ctx.proj as any, playerLoadout.actorId, playerLoadout) : null;
  if (p && p.hurtInvuln > 0) p.hurtInvuln--;
  if (p && p.combat) {
    tickActionCooldowns({ mp: 0, tp: 0, cooldowns: p.combat.resourceCooldowns || (p.combat.resourceCooldowns = {}) });
    const stateTick = tickActionStates(p.combat.states || [], Object.fromEntries((ctx.proj.states || []).map((state: any) => [Number(state.id), state.actionCombat])));
    p.combat.states = stateTick.effects;
    if (stateTick.damage > 0) p.hp = Math.max(0, Number(p.hp || 0) - stateTick.damage);
    tickAttack(p.combat, playerActor?.windupFrames ?? 3, playerActor?.activeFrames ?? 9);
    if (p.combat.dead && respawnIfReady(p.combat)) {
      const actor = playerActor || resolveActorCombat(ctx.proj as any, browserLoadout().actorId, browserLoadout());
      const a = G.party[0];
      if (a) a.hp = actor.reviveHp;
      p.hp = actor.reviveHp; p.maxHp = actor.maxHp; p.revive = 0;
      emitLocalCombat({ tick: ctx.globalT || 0, kind: "revive", target: p.id || 0, mapId: G.mapId, x: p.x, y: p.y, animationId: actor.reviveAnimationId, sound: actor.reviveSound });
    }
  }
  if (p && p.attack) {
    if (attackIsActive(p.attack)) {
      for (const rt of ctx.evRTs) {
        if (!combatReady(rt) || p.attack.hitIds.has(rt.ev.id)) continue;
        if (!attackHitsEntity(p, rt, p.attack.dir, p.attack.hitbox, p.attack.range)) continue;
        p.attack.hitIds.add(rt.ev.id);
        damageMapEnemy(rt, p, p.attack.ability || null);
      }
    }
    p.attack.framesLeft--;
    if (p.attack.framesLeft <= 0) {
      p.attack = null;
      if (p.combat) {
        p.combat.phase = "idle";
        p.combat.framesLeft = 0;
        p.combat.totalFrames = 0;
        p.combat.activeAbilityId = 0;
        p.combat.activeAbilityKind = null;
      }
    }
  }
  for (const rp of playersOnMap(defaultWorld, G.mapId)) {
    if (rp.combat) {
      const actor = resolveActorCombat(ctx.proj as any, rp.loadout?.actorId || 1, rp.loadout);
      tickAttack(rp.combat, actor.windupFrames, actor.activeFrames);
      if (rp.combat.dead && respawnIfReady(rp.combat)) {
        const actor = resolveActorCombat(ctx.proj as any, rp.loadout?.actorId || 1, rp.loadout);
        rp.hp = actor.reviveHp;
        rp.maxHp = actor.maxHp;
        rp.revive = 0;
        emitLocalCombat({ tick: ctx.globalT || 0, kind: "revive", target: rp.id, mapId: G.mapId, x: rp.x, y: rp.y, animationId: actor.reviveAnimationId, sound: actor.reviveSound });
      }
      if (sharedAttackIsActive(rp.combat)) {
        for (const rt of ctx.evRTs) {
          if (!combatReady(rt) || rp.combat.hitIds.has(rt.ev.id) || !attackHitsEntity(rp, rt, rp.combat.dir, actor.hitbox, actor.range)) continue;
          rp.combat.hitIds.add(rt.ev.id);
          damageMapEnemy(rt, rp);
        }
      }
    }
  }
  for (const rt of ctx.evRTs) {
    const cfg = combatConfig(rt.page);
    if (!cfg || !rt.combat) continue;
    if (rt.combat.dead) {
      tickAttack(rt.combat, Number(cfg.attackWindupFrames) || 0, Number(cfg.attackActiveFrames) || 1);
      if (!cfg.persistentDefeat && Number(cfg.respawnFrames) > 0 && respawnIfReady(rt.combat)) {
        rt.combat.hp = combatMaxHp(cfg, combatEnemy(cfg));
        rt.erased = false;
        emitLocalCombat({ tick: ctx.globalT || 0, kind: "respawn", target: rt.ev.id, mapId: G.mapId, eventId: rt.ev.id, x: rt.x, y: rt.y, sound: cfg.reviveSound });
        refreshEventCombat(rt);
      }
      continue;
    }
    const targets = [p, ...playersOnMap(defaultWorld, G.mapId)].filter((candidate: any) => candidate && !candidate.combat?.dead);
    const target = selectCombatTarget(rt, targets, 8);
    const enemy = combatEnemy(cfg);
    const enemyAbilityRows = enemy?.actionCombat?.abilities || [];
    const enemyAbilityRow = enemy && enemyAbilityRows.length > 0 && selectEnemyCombatAbility(enemyAbilityRows, {
      hpPct: rt.combat.hp / Math.max(1, combatMaxHp(cfg, enemy)) * 100,
      distance: target ? tileDistance(target, rt) : Infinity,
      states: [], switches: G.switches,
    }, rndf());
    const enemyAbility = enemyAbilityRow ? resolveActionAbility(ctx.proj as any, "skill", enemyAbilityRow.skillId) : null;
    if (rt.combat.phase === "idle" && rt.combat.attackCooldown <= 0 && (enemyAbility || Number(cfg.touchDamage) > 0) && target &&
        tileDistance(target, rt) <= (Number(enemyAbility?.range) || Number(cfg.attackRange) || 1)) {
      rt.dir = dirTo(rt.x, rt.y, target.x, target.y);
      rt.combat.activeAbilityId = enemyAbility?.id || 0;
      rt.combat.activeAbilityKind = enemyAbility ? "skill" : null;
      const windup = Number(enemyAbility?.windupFrames ?? cfg.attackWindupFrames) || 0;
      const active = Number(enemyAbility?.activeFrames ?? cfg.attackActiveFrames) || 1;
      const recovery = Number(enemyAbility?.recoveryFrames ?? cfg.attackRecoveryFrames) || 0;
      sharedStartAttack(rt.combat, rt.dir, windup, active, recovery);
      rt.combat.attackCooldown = Number(enemyAbility?.cooldownFrames ?? cfg.attackCooldown) || 0;
      emitLocalCombat({ tick: ctx.globalT || 0, kind: "telegraph", source: rt.ev.id, target: Number(target.id) || Number(defaultWorld.roster.local) || 0, mapId: G.mapId, eventId: rt.ev.id, x: rt.x, y: rt.y, dir: rt.dir, animationId: enemyAbility?.telegraphAnimationId || enemyAbility?.animationId || cfg.telegraphAnimationId, sound: enemyAbility?.telegraphSound || enemyAbility?.attackSound || cfg.telegraphSound });
    }
    if (target === p) damagePlayerFromEnemy(rt, p);
    for (const rp of playersOnMap(defaultWorld, G.mapId)) damagePlayerFromEnemy(rt, rp);
    const liveAbility = rt.combat.activeAbilityId ? resolveActionAbility(ctx.proj as any, rt.combat.activeAbilityKind || "skill", rt.combat.activeAbilityId) : null;
    tickAttack(rt.combat, Number(liveAbility?.windupFrames ?? cfg.attackWindupFrames) || 0, Number(liveAbility?.activeFrames ?? cfg.attackActiveFrames) || 1);
    if (rt.combat.phase === "idle") { rt.combat.activeAbilityId = 0; rt.combat.activeAbilityKind = null; }
  }
  for (let i = mapFloatTexts.length - 1; i >= 0; i--) {
    mapFloatTexts[i].life--;
    if (mapFloatTexts[i].life <= 0) mapFloatTexts.splice(i, 1);
  }
}

/** Client-only cosmetic attack progression. Hits are never resolved here. */
export function tickPlayerAttackPresentation(): void {
  const p = G.player;
  if (!p || !p.attack) return;
  p.attack.framesLeft--;
  if (p.attack.framesLeft <= 0) {
    p.attack = null;
    if (p.combat) {
      p.combat.phase = "idle";
      p.combat.framesLeft = 0;
      p.combat.totalFrames = 0;
    }
  }
}
export function combatStaggered(rt: any): boolean {
  return !!(rt && rt.combat && rt.combat.stagger > 0);
}
export function combatChaseDir(rt: any): number {
  const p = G.player;
  if (!combatReady(rt) || !p || !rt.page) return -1;
  const cfg = combatConfig(rt.page);
  if (combatAi(cfg) !== "chase") return -1;
  if (combatStaggered(rt) || rt.locked || ctx.blockingRun) return -1;
  const target = selectCombatTarget(rt, [p, ...playersOnMap(defaultWorld, G.mapId)].filter((candidate: any) => !candidate.combat?.dead));
  if (!target) return -1;
  const dx = target.x - rt.x;
  const dy = target.y - rt.y;
  const dist = Math.abs(dx) + Math.abs(dy);
  if (dist <= 1 || dist > 8) return -1;
  const xDir = dx > 0 ? 2 : dx < 0 ? 1 : -1;
  const yDir = dy > 0 ? 0 : dy < 0 ? 3 : -1;
  const dirs = Math.abs(dx) >= Math.abs(dy) ? [xDir, yDir] : [yDir, xDir];
  for (const dir of dirs) {
    if (dir < 0) continue;
    const [mx, my] = DIRD[dir];
    // The page's wander leash applies to the chase too: a guard with
    // maxDistance set gives up at the end of its rope instead of following the
    // player across the map. Absent ⇒ always true (unchanged chasing).
    if (canCombatChasePass(rt, rt.x + mx, rt.y + my) && eventMayStep(rt, rt.x + mx, rt.y + my))
      return dir;
  }
  return -1;
}
function drawSwordSlash(g: any, hitbox: any, dir: any): void {
  const x = hitbox.x * TILE;
  const y = hitbox.y * TILE;
  const w = hitbox.w * TILE;
  const h = hitbox.h * TILE;
  g.save();
  g.globalAlpha = 0.85;
  g.strokeStyle = "#e8f6ff";
  g.lineWidth = 5;
  g.lineCap = "round";
  g.beginPath();
  if (dir >= 4) {
    const rising = dir === 4 || dir === 7;
    g.moveTo(rising ? x : x + w, y + h);
    g.quadraticCurveTo(x + w / 2, y - h * 0.1, rising ? x + w : x, y);
  } else if (dir === 3) {
    g.arc(x + w / 2, y + h, w * 0.55, Math.PI * 1.12, Math.PI * 1.88);
  } else if (dir === 0) {
    g.arc(x + w / 2, y, w * 0.55, Math.PI * 0.12, Math.PI * 0.88);
  } else if (dir === 1) {
    g.arc(x + w, y + h / 2, h * 0.55, Math.PI * 0.62, Math.PI * 1.38);
  } else {
    g.arc(x, y + h / 2, h * 0.55, Math.PI * -0.38, Math.PI * 0.38);
  }
  g.stroke();
  g.restore();
}
export function drawMapCombatOverlay(g: any, camX: any, camY: any, shakeX: any, shakeY: any, alpha: any, playerX: any, playerY: any): void {
  g.save();
  g.translate(Math.round(shakeX), Math.round(shakeY));
  g.scale(ctx.cameraZoom, ctx.cameraZoom);
  g.translate(-camX, -camY);
  const p = G.player;
  if (p && p.attack && attackIsActive(p.attack)) {
    drawSwordSlash(g, swordHitboxAt(playerX, playerY, p.attack.dir), p.attack.dir);
  }
  for (const rp of playersOnMap(defaultWorld, G.mapId)) {
    if (rp.combat && sharedAttackIsActive(rp.combat)) {
      const rx = rp.prx + (rp.rx - rp.prx) * alpha;
      const ry = rp.pry + (rp.ry - rp.pry) * alpha;
      drawSwordSlash(g, swordHitboxAt(rx, ry, rp.combat.dir), rp.combat.dir);
    }
  }
  for (const rt of ctx.evRTs) {
    if (!combatReady(rt) || rt.combat.hurtFlash <= 0) continue;
    const rx = (rt.prx == null ? rt.rx : rt.prx + (rt.rx - rt.prx) * alpha) * TILE;
    const ry = (rt.pry == null ? rt.ry : rt.pry + (rt.ry - rt.pry) * alpha) * TILE;
    g.fillStyle = "rgba(255,255,255,0.36)";
    g.fillRect(rx + 6, ry - 6, TILE - 12, TILE);
  }
  g.font = "700 14px " + (ctx.proj.system.fontMenu || "sans-serif");
  g.textAlign = "center";
  g.textBaseline = "middle";
  for (const ft of mapFloatTexts) {
    const t = ft.life / ft.total;
    g.globalAlpha = clamp(t * 1.4, 0, 1);
    g.fillStyle = "rgba(0,0,0,0.75)";
    g.fillText(ft.text, ft.x * TILE + 1, (ft.y - (1 - t) * 0.55) * TILE + 1);
    g.fillStyle = ft.color;
    g.fillText(ft.text, ft.x * TILE, (ft.y - (1 - t) * 0.55) * TILE);
  }
  g.restore();
  g.globalAlpha = 1;
}

export function updateEntityMotion(ent: any, speed: any): boolean {
  if (!ent.moving) return false;
  const sx = Math.sign(ent.tx - ent.rx),
    sy = Math.sign(ent.ty - ent.ry);
  ent.rx += sx * speed;
  ent.ry += sy * speed;
  if (
    (sx !== 0 && Math.sign(ent.tx - ent.rx) !== sx) ||
    (sy !== 0 && Math.sign(ent.ty - ent.ry) !== sy) ||
    (sx === 0 && sy === 0)
  ) {
    ent.rx = ent.tx;
    ent.ry = ent.ty;
    ent.x = ent.tx;
    ent.y = ent.ty;
    ent.moving = false;
    normalizeLoopArrival(ent);
    // Ladder tiles (M4·A): landing on one snaps the facing up — the climb
    // look, MZ-style. ladderAt gates on the map's presence mask.
    if (ladderAt(ent.x, ent.y)) ent.dir = 3;
    return true; // arrived
  }
  ent.animT++;
  return false;
}
/** Fold a just-arrived entity back into the grid on looping maps, shifting its
 *  render/interp coords by the same whole-map delta so the camera and the
 *  between-tick interpolation stay continuous. No-op on bounded maps. */
function normalizeLoopArrival(ent: any): void {
  const m = ctx.map;
  if (!m || !m.loop) return;
  const wx = wrapX(ent.x), wy = wrapY(ent.y);
  if (wx !== ent.x) {
    const d = wx - ent.x;
    ent.x = wx; ent.tx += d; ent.rx += d;
    if (ent.prx != null) ent.prx += d;
  }
  if (wy !== ent.y) {
    const d = wy - ent.y;
    ent.y = wy; ent.ty += d; ent.ry += d;
    if (ent.pry != null) ent.pry += d;
  }
}
export function walkFrame(ent: any): number {
  // Walking Animation off (a move-route step): the sprite slides without its
  // legs moving — how a ghost drifts, or a statue is pushed. Stepping
  // Animation on is the opposite: it keeps cycling while standing still.
  if (ent.walkAnim === false && !ent.stepAnim) return 1;
  if (!ent.moving && ent.kind !== "object" && !ent.stepAnim) return 1;
  const seq = [0, 1, 2, 1];
  const speed = ent.kind === "object" ? 24 : 8;
  // animT only advances while a character is moving, so a standing character
  // with Stepping Animation on reads the world clock instead (otherwise it
  // would freeze on whatever frame it stopped at).
  const clock = ent.stepAnim && !ent.moving ? ctx.globalT : ent.animT || ctx.globalT;
  return seq[Math.floor(clock / speed) % 4];
}

// ---- routes ----
// The step machine itself is shared with the headless zone driver
// (src/shared/map/move-route.ts) — the two runtimes used to carry diverging copies,
// and the zone's understood barely half the steps. This file supplies only the
// map scene's capabilities: its passability rules, its hop arc, its sound.
export function setRoute(ent: any, steps: any, onDone: any, opts?: any): void {
  ent.route = {
    steps, idx: 0, wait: 0, onDone,
    repeat: !!(opts && opts.repeat),
    skippable: !opts || opts.skippable !== false,
    gap: (opts && Number(opts.gap)) || 0,
    touch: !!(opts && opts.touch),
    blocked: 0,
  };
}

/** The map scene's RouteOps. `stepOk` keeps the historic split — the player
 *  walks by playerStepPassable, everything else by canEntityPass — and adds
 *  the corner rule for diagonal steps (a character may not squeeze between two
 *  blocked neighbours), which "forward" used to special-case on its own. */
const MAP_ROUTE_OPS: RouteOps = {
  canStep(ent: any, x: number, y: number): boolean {
    const stepOk = (px: number, py: number) =>
      ent === G.player ? playerStepPassable(px, py) : canEntityPass(ent, px, py);
    if (!stepOk(x, y)) return false;
    const dx = x - ent.x;
    const dy = y - ent.y;
    if (dx !== 0 && dy !== 0 && !(stepOk(x, ent.y) && stepOk(ent.x, y))) return false;
    return true;
  },
  startMove,
  startJump(ent: any, dx: number, dy: number): void {
    // The shared machine speaks in tile offsets; this runtime's hop takes a
    // direction and a distance, so translate (they only ever differ for the
    // parameterized jump, which is straight or diagonal by construction).
    const tiles = Math.max(Math.abs(dx), Math.abs(dy));
    if (tiles === 0) { startJump(ent, ent.dir, 0); return; }
    const dir = dx === 0 ? (dy > 0 ? 0 : 3)
      : dy === 0 ? (dx > 0 ? 2 : 1)
        : dx < 0 ? (dy > 0 ? 4 : 6) : (dy > 0 ? 5 : 7);
    startJump(ent, dir, tiles);
  },
  playerTile: () => (G.player ? { x: G.player.x, y: G.player.y } : null),
  rnd,
  playSe: (name: string) => { if (name) Sfx.play(name); },
  setSwitch: (id: number, on: boolean) => {
    if (id > 0) G.switches[id] = on;
    refreshAllPages();
  },
  setGraphic(ent: any, charset: string): void {
    ent.charsetIdx = charset ? Assets.charsetIndex(charset) : -1;
    ent.kind = ent.charsetIdx >= 0 ? Assets.charsets[ent.charsetIdx].kind : "";
  },
};

export function updateRoute(ent: any): void {
  if (!ent.route || ent.moving || ent.jumping) return;
  advanceRoute(ent, MAP_ROUTE_OPS);
}

/** The live runtime for an event id on THIS map, or null. Set Move Route's
 *  "another event" target resolves through here; an id that isn't on the map
 *  (wrong map, erased) is a quiet no-op rather than an error. */
export function eventRuntimeById(id: any): any {
  const wanted = Number(id) || 0;
  if (!wanted) return null;
  return ctx.evRTs.find((rt: any) => rt.ev && rt.ev.id === wanted && !rt.erased) || null;
}

// ---- player entity ----
export function initPlayer(x: any, y: any, dir?: any): void {
  const previous = G.player;
  const actor = resolveActorCombat(ctx.proj as any, Number(G.party[0] && G.party[0].actorId) || 1);
  const maxHp = actor.maxHp || 100;
  const lead: any = G.party && G.party[0];
  const maxMp = Number(lead?.maxMp || actor.maxMp || 0);
  G.player = {
    id: Number(defaultWorld.roster.local) || 0,
    x, y, rx: x, ry: y, prx: x, pry: y, tx: x, ty: y, dir: dir == null ? 0 : dir,
    moving: false, animT: 0, frame: 1, route: null, kind: "human",
    charsetIdx: 0, page: null, attack: null, hurtInvuln: 0, combat: createCombatState(),
    hp: previous && typeof previous.hp === "number" ? previous.hp : (G.party[0] && G.party[0].hp) || maxHp,
    maxHp, mp: previous?.mp ?? lead?.mp ?? 0, maxMp, tp: previous?.tp ?? lead?.tp ?? 0, maxTp: lead?.maxTp || 100,
    revive: previous && previous.revive || 0,
  };
  refreshPlayerCharset();
}
export function refreshPlayerCharset(): void {
  // riding a vehicle swaps the player sprite for the vehicle's (Phase 5;
  // vehicleDef folds in the M4·A Change Vehicle Image override)
  if (G.vehicle) {
    const def = vehicleDef(G.vehicle);
    const ci = def && def.charset ? Assets.charsetIndex(def.charset) : -1;
    if (ci >= 0) {
      G.player.charsetIdx = ci;
      G.player.kind = Assets.charsets[ci].kind;
      return;
    }
  }
  G.player.kind = "human";
  const lead = G.party[0];
  if (lead)
    G.player.charsetIdx = Math.max(0, Assets.charsetIndex(lead.charset));
}

// ============================================================================
// Phase 5 Stage C — regions, vehicles, followers, jumps
// ============================================================================

/** The region tag under a tile (0 = none). */
export function regionAt(x: any, y: any): number {
  const m = ctx.map;
  x = wrapX(x); y = wrapY(y);
  if (!m || !m.regions || x < 0 || y < 0 || x >= m.width || y >= m.height) return 0;
  return m.regions[y * m.width + x] || 0;
}

/** Read map info at a tile for the Get Location Info command (Project Compass
 *  M2·C, RM 285). Terrain tags read real values since M4·A (Database ▸
 *  Tilesets terrain, topmost painted tag); region / event id / ground tile id
 *  map cleanly. */
export function locationInfo(x: any, y: any, infoType: any): number {
  if (infoType === "region") return regionAt(x, y);
  if (infoType === "eventId") {
    const rt = entityAt(x, y).find((e: any) => e && e.ev);
    return rt ? rt.ev.id : 0;
  }
  if (infoType === "tileId") {
    x = wrapX(x); y = wrapY(y);
    if (!ctx.map || x < 0 || y < 0 || x >= ctx.map.width || y >= ctx.map.height) return 0;
    return tileId(tileAt("ground", x, y)) || 0;
  }
  return terrainTagAt(x, y); // "terrain" tag (M4·A)
}

function groundKeyAt(x: any, y: any): string {
  x = wrapX(x); y = wrapY(y);
  if (x < 0 || y < 0 || x >= ctx.map.width || y >= ctx.map.height) return "";
  const t = Assets.tiles[tileId(tileAt("ground", x, y))]; // mask Stage-E flags
  return t ? t.key : "";
}

// ---- vehicles ----
// Terrain rules: boat = bare shallow water; ship = bare water or deep water;
// airship = anywhere in bounds. "Bare" = no decor on the cell (bridges and
// lilies block hulls).
function vehicleCanPass(type: any, nx: any, ny: any): boolean {
  nx = wrapX(nx); ny = wrapY(ny);
  if (nx < 0 || ny < 0 || nx >= ctx.map.width || ny >= ctx.map.height) return false;
  if (type === "airship") return true;
  if (tileAt("decor", nx, ny) !== 0 || tileAt("decor2", nx, ny) !== 0) return false;
  const k = groundKeyAt(nx, ny);
  if (type === "boat") return k === "water";
  return k === "water" || k === "deepwater";
}
/** Player step passability, forked on the ridden vehicle (null = on foot). */
export function playerStepPassable(nx: any, ny: any): boolean {
  nx = wrapX(nx); ny = wrapY(ny);
  if (nx < 0 || ny < 0 || nx >= ctx.map.width || ny >= ctx.map.height) return false;
  // A move route can turn Through on for the player too (a cutscene walking
  // them over a table). Map bounds still hold — off-map is never a tile.
  if (G.player && G.player.routeThrough) return true;
  if (developerThroughActive()) return true;
  if (G.vehicle) return vehicleCanPass(G.vehicle, nx, ny);
  return tilePassable(nx, ny) && !blockingEventAt(nx, ny);
}
/** Ctrl is a temporary Through flag only in an editor-launched playtest. */
export function developerThroughActive(): boolean {
  return !!(
    ctx.playtestMode &&
    ctx.Input &&
    ctx.Input.pressed(DEVELOPER_THROUGH_ACTION)
  );
}
function vehicleDef(type: any): any {
  const v = (ctx.proj.system.vehicles || {})[type];
  if (!v) return null;
  // Change Vehicle Image (M4·A, RM 323): a save-persisted charset override.
  const ov = G.vehicleImages && G.vehicleImages[type];
  const def = ov ? { ...v, charset: ov } : v;
  return def.charset ? def : null;
}
/** Live position record for a configured vehicle (lazily seeded from the
 *  System-tab definition; persisted in saves via G.vehicles). */
export function vehicleState(type: any): any {
  const def = vehicleDef(type);
  if (!def) return null;
  G.vehicles = G.vehicles || {};
  if (!G.vehicles[type]) {
    G.vehicles[type] = { mapId: Number(def.mapId) || 0, x: Number(def.x) || 0, y: Number(def.y) || 0 };
  }
  return G.vehicles[type];
}
export const VEHICLE_TYPES = ["boat", "ship", "airship"];
function vehicleAtTile(x: any, y: any): any {
  for (const type of VEHICLE_TYPES) {
    if (G.vehicle === type) continue; // being ridden
    const st = vehicleState(type);
    if (st && st.mapId === G.mapId && st.x === x && st.y === y) return type;
  }
  return null;
}
/** Parked vehicles on the current map, as render drawables. */
export function vehicleDrawables(): any[] {
  const out: any[] = [];
  for (const type of VEHICLE_TYPES) {
    if (G.vehicle === type) continue;
    const st = vehicleState(type);
    if (!st || st.mapId !== G.mapId) continue;
    const ci = Assets.charsetIndex(vehicleDef(type).charset);
    if (ci < 0) continue;
    out.push({
      vehicleId: type, x: st.x, y: st.y, rx: st.x, ry: st.y, prx: st.x, pry: st.y,
      dir: 0, moving: false, animT: 0, page: null,
      charsetIdx: ci, kind: Assets.charsets[ci].kind,
    });
  }
  return out;
}
/** Board (facing or standing on a vehicle) / disembark on the action key.
 *  Returns true when the press was consumed by a vehicle. */
export function tryVehicleAction(): boolean {
  const p = G.player;
  if (!p) return false;
  if (G.vehicle) return tryDisembark();
  const [dx, dy] = DIRD[p.dir] || [0, 0];
  const type = vehicleAtTile(p.x + dx, p.y + dy) || vehicleAtTile(p.x, p.y);
  if (!type) return false;
  const st = vehicleState(type);
  G.vehicle = type;
  p.route = null;
  p.x = p.tx = st.x; p.y = p.ty = st.y;
  p.rx = p.prx = st.x; p.ry = p.pry = st.y;
  p.moving = false;
  refreshPlayerCharset();
  const def = vehicleDef(type);
  if (def.music && def.music !== "none") Music.play(def.music);
  sysSe("ok");
  return true;
}
function tryDisembark(): boolean {
  const p = G.player;
  const type = G.vehicle;
  // land on the tile ahead (airship: set down on the spot)
  let lx = p.x, ly = p.y;
  if (type !== "airship") {
    const [dx, dy] = DIRD[p.dir] || [0, 0];
    lx = p.x + dx; ly = p.y + dy;
  }
  if (!tilePassable(lx, ly) || blockingEventAt(lx, ly)) {
    sysSe("buzzer");
    return true;
  }
  const st = vehicleState(type);
  st.mapId = G.mapId; st.x = p.x; st.y = p.y;
  G.vehicle = null;
  p.x = p.tx = lx; p.y = p.ty = ly;
  p.rx = p.prx = lx; p.ry = p.pry = ly;
  p.moving = false;
  refreshPlayerCharset();
  Music.play(ctx.map.music || "none");
  sysSe("ok");
  return true;
}

// ---- party followers ----
/** (Re)build follower records from party[1..]; snap = pile onto the player
 *  (transfers, new game, load). */
export function syncFollowers(snap: any): void {
  const p = G.player;
  if (!ctx.proj.system.followers || !p) {
    G.followers = [];
    G.followerTrail = [];
    return;
  }
  const prevList = G.followers || [];
  G.followers = G.party.slice(1, 4).map((a: any, i: any) => {
    const prev = prevList[i] || {};
    const f: any = {
      followerId: i + 1,
      x: prev.x, y: prev.y, tx: prev.tx, ty: prev.ty,
      rx: prev.rx, ry: prev.ry, prx: prev.prx, pry: prev.pry,
      dir: prev.dir == null ? p.dir : prev.dir,
      moving: snap ? false : !!prev.moving,
      animT: prev.animT || 0, frame: 1, kind: "human", page: null,
      charsetIdx: Math.max(0, Assets.charsetIndex(a.charset)),
    };
    if (snap || f.x == null) {
      f.x = f.tx = p.x; f.y = f.ty = p.y;
      f.rx = f.prx = p.x; f.ry = f.pry = p.y;
      f.moving = false;
      f.dir = p.dir;
    }
    return f;
  });
  if (snap || !G.followerTrail) G.followerTrail = [];
}
/** Record the tile the player just left; follower i heads for crumb i. */
export function noteFollowerCrumb(x: any, y: any, dir: any): void {
  if (!ctx.proj || !ctx.proj.system.followers) return;
  const trail = G.followerTrail || (G.followerTrail = []);
  trail.unshift({ x, y, dir });
  if (trail.length > 8) trail.length = 8;
}
/** Advance followers one tick (ghosts: no collision, pure visuals). */
export function updateFollowers(speed: any): void {
  if (!ctx.proj.system.followers) return;
  const want = Math.max(0, Math.min(3, G.party.length - 1));
  if ((G.followers || []).length !== want) syncFollowers(false);
  const trail = G.followerTrail || [];
  (G.followers || []).forEach((f: any, i: any) => {
    f.prx = f.rx; f.pry = f.ry;
    if (f.moving) {
      updateEntityMotion(f, speed);
      return;
    }
    const crumb = trail[i];
    if (!crumb) return;
    if (f.x === crumb.x && f.y === crumb.y) {
      f.dir = crumb.dir;
      return;
    }
    startMove(f, dirTo(f.x, f.y, crumb.x, crumb.y));
  });
}

// ---- jumps (route step "jump" + ledge tiles passOv === 3) ----
export function startJump(ent: any, dir: any, tiles: any): void {
  const [dx, dy] = DIRD[dir] || [0, 0];
  if (ent === G.player) noteFollowerCrumb(ent.x, ent.y, dir);
  ent.dir = dir;
  ent.jumping = {
    fx: ent.x, fy: ent.y,
    tx: ent.x + dx * tiles, ty: ent.y + dy * tiles,
    t: 0, total: Math.max(10, 8 * tiles + 6),
  };
  sysSe("miss"); // the whoosh
}
/** Advance a jump one tick; true when the hop lands this tick. The arc is
 *  applied through ry so both render paths (and depth sort) see it. */
export function updateJumpMotion(ent: any): boolean {
  const j = ent.jumping;
  if (!j) return false;
  j.t++;
  const k = Math.min(1, j.t / j.total);
  ent.rx = j.fx + (j.tx - j.fx) * k;
  ent.ry = j.fy + (j.ty - j.fy) * k - Math.sin(Math.PI * k) * 0.85;
  ent.animT++;
  if (k >= 1) {
    ent.x = ent.tx = j.tx;
    ent.y = ent.ty = j.ty;
    ent.rx = j.tx;
    ent.ry = j.ty;
    ent.jumping = null;
    normalizeLoopArrival(ent);
    if (ladderAt(ent.x, ent.y)) ent.dir = 3; // M4·A ladder facing
    return true;
  }
  return false;
}
/** The ledge value under a target tile (passOv 3), bounds-safe. */
export function ledgeAt(x: any, y: any): boolean {
  const m = ctx.map;
  x = wrapX(x); y = wrapY(y);
  if (!m || !m.passOv || x < 0 || y < 0 || x >= m.width || y >= m.height) return false;
  return m.passOv[y * m.width + x] === 3;
}
