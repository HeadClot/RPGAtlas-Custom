/* RPGAtlas — spatial Connections editor.
   This is intentionally separate from World View: World View remains the
   Transfer-Player graph, while this panel edits runtime worldOrigin values. */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { editorState as S, curMap, TILE } from "../editor-state";
import { h } from "../dom";
import { touch } from "../persistence";
import { mapAnimFrame, renderMap, renderMapView, type MapView } from "./map-render";
import { rebuildMapList } from "./map-list";
import { setStatus, flashStatus } from "./status";
import { focusPanel, getFocusedPanel, isPanelVisible, togglePanel } from "../dock/dock";
import { connectionSegment, deriveConnections, validateLayout } from "../../shared/map-connections";

export const CONNECTIONS_PANEL = "connections";
const TILE_PX = 24;
const PAD = 80;
const PREVIEW_MAX_PX = 256;

let root: HTMLElement | null = null;
let viewport: HTMLElement | null = null;
let stage: HTMLElement | null = null;
let svg: SVGSVGElement | null = null;
let hud: HTMLElement | null = null;
let zoom = 0.8;
let selectedId = -1;
let dirty = true;
let timer: any = null;
const provisional = new Map<number, { x: number; y: number }>();
const nodeEls = new Map<number, HTMLElement>();

function visible(): boolean {
  return !!root && root.offsetParent !== null && root.clientWidth > 0;
}
function originFor(m: any, index: number): { x: number; y: number } {
  if (m.worldOrigin && Number.isInteger(m.worldOrigin.x) && Number.isInteger(m.worldOrigin.y)) return m.worldOrigin;
  if (!provisional.has(m.id)) {
    // Keep unplaced cards in a non-overlapping provisional row. The old
    // index * 8 spacing put wide maps on top of one another, so a later card
    // intercepted clicks intended for the first card in the CI browser.
    const x = S.proj.maps.slice(0, index)
      .reduce((sum: number, previous: any) => sum + Math.max(1, Number(previous.width) || 1) + 1, 0);
    provisional.set(m.id, { x, y: 0 });
  }
  return provisional.get(m.id)!;
}
function allMaps() { return (S.proj.maps || []).map((m: any, i: number) => ({ m, o: originFor(m, i) })); }
function bounds() {
  const items = allMaps();
  if (!items.length) return { minX: 0, minY: 0, maxX: 20, maxY: 15 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const { m, o } of items) {
    minX = Math.min(minX, o.x); minY = Math.min(minY, o.y);
    maxX = Math.max(maxX, o.x + m.width); maxY = Math.max(maxY, o.y + m.height);
  }
  return { minX, minY, maxX, maxY };
}
function stagePoint(x: number, y: number) {
  const b = bounds();
  return { x: PAD + (x - b.minX) * TILE_PX, y: PAD + (y - b.minY) * TILE_PX };
}
function applyZoom() {
  if (!stage) return;
  stage.style.transform = `scale(${zoom})`;
  stage.style.transformOrigin = "0 0";
}
function setZoom(v: number) { zoom = Math.max(0.25, Math.min(2, v)); applyZoom(); }

function mapPreview(m: any): HTMLCanvasElement {
  const canvas = h("canvas", { class: "cv-map-preview", "aria-hidden": "true" }) as HTMLCanvasElement;
  const g = canvas.getContext("2d");
  if (!g) return canvas;
  const scale = Math.min(1, PREVIEW_MAX_PX / Math.max(1, m.width * TILE), PREVIEW_MAX_PX / Math.max(1, m.height * TILE));
  const previewWidth = Math.max(1, Math.round(m.width * TILE * scale));
  const previewHeight = Math.max(1, Math.round(m.height * TILE * scale));
  canvas.width = previewWidth;
  canvas.height = previewHeight;
  // Absolute positioning is relative to the card's padding box. Extend the
  // preview across the border so its rendered bounds match the full card.
  canvas.style.inset = "0";
  canvas.style.width = "calc(100% + 4px)";
  canvas.style.height = "calc(100% + 4px)";
  const view: MapView = {
    zoom: scale, mode: "map", layer: "auto", tool: "pen",
    selection: null, hoverCell: null, hoverQuad: 0, rectStart: null,
    painting: false, pasteMode: null, clipTiles: null,
    selectedEvent: null, system: S.proj.system, frame: mapAnimFrame(), preview: true,
  };
  renderMapView(g, m, view);
  return canvas;
}

function rebuild() {
  if (!stage || !svg) return;
  dirty = false;
  const items = allMaps();
  const b = bounds();
  const w = PAD * 2 + (b.maxX - b.minX) * TILE_PX;
  const hgt = PAD * 2 + (b.maxY - b.minY) * TILE_PX;
  stage.style.width = `${Math.max(w, 500)}px`;
  stage.style.height = `${Math.max(hgt, 360)}px`;
  stage.innerHTML = "";
  svg.setAttribute("width", String(w)); svg.setAttribute("height", String(hgt));
  stage.appendChild(svg);
  nodeEls.clear();
  for (const { m, o } of items) {
    const p = stagePoint(o.x, o.y);
    const el = h("div", {
      class: "cv-map" + (m.id === selectedId ? " sel" : "") + (m.worldOrigin ? " placed" : " unplaced"),
      style: `left:${p.x}px;top:${p.y}px;width:${Math.max(48, m.width * TILE_PX)}px;height:${Math.max(40, m.height * TILE_PX)}px`,
      title: "Drag to place · double-click to open",
    }, mapPreview(m), h("div", { class: "cv-map-name" }, `${m.id}: ${m.name || "—"}`),
      h("div", { class: "cv-map-dims" }, `${m.width}×${m.height}`));
    el.addEventListener("mousedown", (e: MouseEvent) => beginDrag(e, m.id));
    el.addEventListener("dblclick", () => openMap(m.id));
    stage.appendChild(el); nodeEls.set(m.id, el);
  }
  drawConnections();
  updateHud();
}

function drawConnections() {
  if (!svg) return;
  svg.replaceChildren();
  const items = allMaps();
  const byId = new Map(items.map(({ m, o }) => [m.id, { m, o }]));
  for (const c of deriveConnections(S.proj.maps)) {
    const a = byId.get(c.aMapId), bb = byId.get(c.bMapId);
    if (!a || !bb) continue;
    const segment = connectionSegment(c, a.m);
    const start = stagePoint(segment.x1, segment.y1), end = stagePoint(segment.x2, segment.y2);
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", String(start.x)); line.setAttribute("y1", String(start.y));
    line.setAttribute("x2", String(end.x)); line.setAttribute("y2", String(end.y));
    line.setAttribute("class", "cv-connection"); svg.appendChild(line);
  }
}

function worldFromMouse(e: MouseEvent) {
  const r = stage!.getBoundingClientRect(), b = bounds();
  return { x: Math.round(b.minX + ((e.clientX - r.left) / zoom - PAD) / TILE_PX),
    y: Math.round(b.minY + ((e.clientY - r.top) / zoom - PAD) / TILE_PX) };
}
function snapOrigin(id: number, candidate: { x: number; y: number }) {
  const m = S.proj.maps.find((x: any) => x.id === id); if (!m) return candidate;
  let best = { ...candidate }, bestDistance = 1.01;
  for (const other of S.proj.maps) {
    if (other.id === id || !other.worldOrigin) continue;
    const oo = other.worldOrigin;
    const verticalOverlap = Math.min(candidate.y + m.height, oo.y + other.height) - Math.max(candidate.y, oo.y);
    const horizontalOverlap = Math.min(candidate.x + m.width, oo.x + other.width) - Math.max(candidate.x, oo.x);
    const tries = [
      { x: oo.x + other.width, y: candidate.y, d: Math.abs(candidate.x - (oo.x + other.width)) },
      { x: oo.x - m.width, y: candidate.y, d: Math.abs(candidate.x - (oo.x - m.width)) },
      { x: candidate.x, y: oo.y + other.height, d: Math.abs(candidate.y - (oo.y + other.height)) },
      { x: candidate.x, y: oo.y - m.height, d: Math.abs(candidate.y - (oo.y - m.height)) },
    ];
    for (const t of tries) {
      if (t.d <= bestDistance && ((t.x !== candidate.x && verticalOverlap > 0) || (t.y !== candidate.y && horizontalOverlap > 0))) {
        best = { x: t.x, y: t.y }; bestDistance = t.d;
      }
    }
  }
  return best;
}
function beginDrag(e: MouseEvent, id: number) {
  if (e.button !== 0 || !stage) return;
  e.preventDefault(); e.stopPropagation(); selectedId = id;
  root?.focus({ preventScroll: true });
  const m = S.proj.maps.find((x: any) => x.id === id); if (!m) return;
  const start = worldFromMouse(e), initial = { ...originFor(m, S.proj.maps.indexOf(m)) };
  let moved = false;
  const move = (ev: MouseEvent) => {
    const p = worldFromMouse(ev);
    provisional.set(id, { x: initial.x + p.x - start.x, y: initial.y + p.y - start.y });
    moved = moved || p.x !== start.x || p.y !== start.y; rebuild();
  };
  const up = () => {
    window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up);
    if (moved) {
      const p = snapOrigin(id, provisional.get(id)!);
      m.worldOrigin = { x: p.x, y: p.y }; provisional.delete(id); touch(); rebuild();
      flashStatus(`Placed map ${id} at (${p.x}, ${p.y})`);
    }
  };
  window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
  rebuild();
}
function openMap(id: number) {
  S.curMapId = id; S.selectedEvent = null; selectedId = id;
  rebuildMapList(); renderMap(); setStatus(); flashStatus("Opened map " + id);
}
function updateHud() {
  if (!hud) return;
  const diag = validateLayout(S.proj.maps), placed = S.proj.maps.filter((m: any) => m.worldOrigin).length;
  hud.innerHTML = "";
  hud.appendChild(h("div", { class: "cv-hud-row" },
    h("span", { class: "cv-info" }, `${placed}/${S.proj.maps.length} maps placed · ${deriveConnections(S.proj.maps).length} connections`),
    h("span", { class: "cv-spacer" }),
    h("button", { class: "mini", onclick: () => setZoom(zoom / 1.15) }, "−"),
    h("span", { class: "cv-zoom" }, `${Math.round(zoom * 100)}%`),
    h("button", { class: "mini", onclick: () => setZoom(zoom * 1.15) }, "+"),
    h("button", { class: "mini", onclick: autoArrange }, "Place in row"),
  ));
  if (diag.issues.length) hud.appendChild(h("div", { class: "cv-warn" }, "⚠ " + diag.issues.slice(0, 3).map((x) => x.message).join(" · ") + (diag.issues.length > 3 ? " · …" : "")));
  if (diag.unplaced.length) hud.appendChild(h("div", { class: "cv-dim" }, `Unplaced maps: ${diag.unplaced.join(", ")} — drag them onto the canvas.`));
  const m = S.proj.maps.find((x: any) => x.id === selectedId);
  if (!m) return;
  const o = originFor(m, 0);
  const x = h("input", { class: "cv-origin", type: "number", value: String(o.x), onchange: (e: any) => setOrigin(m, Number(e.target.value), o.y) });
  const y = h("input", { class: "cv-origin", type: "number", value: String(o.y), onchange: (e: any) => setOrigin(m, o.x, Number(e.target.value)) });
  hud.appendChild(h("div", { class: "cv-inspect" }, h("span", null, `Map ${m.id}: ${m.name || "—"}`), h("button", { class: "mini", onclick: () => openMap(m.id) }, "Open"), h("span", { class: "cv-dim" }, "Origin"), x, y));
}
function setOrigin(m: any, x: number, y: number) {
  if (!Number.isInteger(x) || !Number.isInteger(y)) return;
  m.worldOrigin = { x, y }; provisional.delete(m.id); touch(); rebuild();
}
function nudgeSelected(e: KeyboardEvent) {
  if (!visible() || getFocusedPanel() !== CONNECTIONS_PANEL || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
  const target = e.target as HTMLElement | null;
  if (target && typeof target.closest === "function" &&
      target.closest("input, textarea, select, button, [contenteditable='true'], [role='textbox']")) return;
  const delta = e.key === "ArrowLeft" ? { x: -1, y: 0 }
    : e.key === "ArrowRight" ? { x: 1, y: 0 }
      : e.key === "ArrowUp" ? { x: 0, y: -1 }
        : e.key === "ArrowDown" ? { x: 0, y: 1 } : null;
  if (!delta || selectedId < 0) return;
  const index = S.proj.maps.findIndex((m: any) => m.id === selectedId);
  const m = index < 0 ? null : S.proj.maps[index];
  if (!m) return;
  const origin = originFor(m, index);
  m.worldOrigin = { x: origin.x + delta.x, y: origin.y + delta.y };
  provisional.delete(m.id);
  e.preventDefault();
  touch();
  rebuild();
}
function autoArrange() {
  let x = 0;
  for (const m of S.proj.maps) { m.worldOrigin = { x, y: 0 }; x += m.width; }
  provisional.clear(); touch(); rebuild(); flashStatus("Placed all maps edge-to-edge");
}
function bindPan() {
  if (!viewport) return;
  viewport.addEventListener("mousedown", (e: MouseEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest(".cv-map")) return;
    const sx = e.clientX, sy = e.clientY, l0 = viewport!.scrollLeft, t0 = viewport!.scrollTop;
    const move = (ev: MouseEvent) => { viewport!.scrollLeft = l0 - (ev.clientX - sx); viewport!.scrollTop = t0 - (ev.clientY - sy); };
    const up = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
    window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
  });
  viewport.addEventListener("wheel", (e: WheelEvent) => { if (!e.ctrlKey) return; e.preventDefault(); setZoom(zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1)); }, { passive: false });
}

export function connectionsDirty() { dirty = true; clearTimeout(timer); timer = setTimeout(() => { if (dirty && visible()) rebuild(); }, 100); }
export function mountConnectionsView(): HTMLElement {
  if (root) return root;
  svg = document.createElementNS("http://www.w3.org/2000/svg", "svg") as SVGSVGElement;
  svg.setAttribute("class", "cv-edges");
  stage = h("div", { class: "cv-stage" }) as HTMLElement;
  viewport = h("div", { class: "cv-viewport" }, stage) as HTMLElement;
  hud = h("div", { class: "cv-hud" });
  root = h("div", { class: "connections-view dock-panel-content", tabindex: "0" }, viewport, hud) as HTMLElement;
  root.addEventListener("keydown", nudgeSelected);
  bindPan(); applyZoom(); rebuild(); return root;
}
export function isConnectionsVisible() { return isPanelVisible(CONNECTIONS_PANEL); }
export function toggleConnections() {
  if (!isPanelVisible(CONNECTIONS_PANEL) || getFocusedPanel() !== CONNECTIONS_PANEL) {
    focusPanel(CONNECTIONS_PANEL); if (visible()) rebuild(); else connectionsDirty();
    if (selectedId < 0) { const m = curMap(); if (m) selectedId = m.id; }
  } else togglePanel(CONNECTIONS_PANEL);
}
