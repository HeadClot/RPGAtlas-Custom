/* RPGAtlas — src/editor/map-editor/world-view.ts
   World View (Phase 3 Stage E): a dockable bird's-eye panel (dock id "world")
   that draws the whole project as a map-connection graph. Nodes are maps; the
   arrows between them are parsed live from every event's Transfer-Player
   command by the pure core (src/shared/world-graph.ts). It is an editor
   surface, not a passive diagram:

   - drag a map node to arrange the world; its position persists on
     map.worldPos (an additive editor-only field). Unpinned maps fall back to
     the deterministic auto-layout.
   - click a node to select its map (and edit the map's per-map notes in the
     inspector); double-click to jump the editor to that map.
   - drag the ↻ handle on an arrow onto another map to re-link every transfer
     behind that connection (retargetEdge) — drag-to-relink.

   The panel rebuilds on show and whenever an edit calls worldDirty() (wired
   into touch(), like the HD-2D viewport). Positions redraw cheaply during a
   drag without re-walking the whole project.
   Copyright (C) 2026 RPGAtlas contributors — GPL-3.0-or-later (see LICENSE). */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { editorState as S, curMap } from "../editor-state";
import { h } from "../dom";
import { touch } from "../persistence";
import { renderMap } from "./map-render";
import { setStatus, flashStatus } from "./status";
import { rebuildMapList, openMapProps } from "./map-list";
import { focusPanel, isPanelVisible, getFocusedPanel, togglePanel } from "../dock/dock";
import { buildWorldGraph, autoLayout, retargetEdge, type WorldGraph } from "../../shared/world-graph";

export const WORLD_PANEL = "world";

// layout constants (px, in un-zoomed stage space)
const CELL_W = 190, CELL_H = 150, NODE_W = 148, NODE_H = 88, PAD = 48;
const SVGNS = "http://www.w3.org/2000/svg";

// ---- panel DOM ----
let root: HTMLElement | null = null;
let viewport: HTMLElement | null = null; // scroll container
let stage: HTMLElement | null = null;    // scaled inner surface
let svg: SVGSVGElement | null = null;    // edge layer
let nodesLayer: HTMLElement | null = null;
let hud: HTMLElement | null = null;

// ---- state ----
let zoom = 1;
let selId = -1;                          // selected map id
let dirty = true;
let kick: any = null;
let graph: WorldGraph = { nodes: [], edges: [], dangling: [] };
let cell: Map<number, { x: number; y: number }> = new Map(); // cell coords per map id
const nodeEls = new Map<number, HTMLElement>();

// ============================ dirty / rebuild ============================
export function worldDirty() {
  dirty = true;
  if (!root) return;
  clearTimeout(kick);
  kick = setTimeout(() => { if (isShowing()) rebuild(); }, 350);
}
function isShowing() {
  return !!root && root.offsetParent !== null && root.clientWidth > 0;
}

// Cell coordinate for a map: its pinned worldPos, else the auto-layout slot.
function cellOf(mapId: number, auto: Record<number, { x: number; y: number }>) {
  const m = S.proj.maps.find((mm: any) => mm.id === mapId);
  const wp = m && m.worldPos;
  if (wp && typeof wp.x === "number" && typeof wp.y === "number" && isFinite(wp.x) && isFinite(wp.y)) {
    return { x: wp.x, y: wp.y };
  }
  return auto[mapId] || { x: 0, y: 0 };
}

function rebuild() {
  if (!stage || !svg || !nodesLayer) return;
  dirty = false;
  graph = buildWorldGraph(S.proj.maps);
  const auto = autoLayout(graph);
  cell = new Map();
  for (const n of graph.nodes) cell.set(n.id, cellOf(n.id, auto));

  // Build node DOM.
  nodesLayer.innerHTML = "";
  nodeEls.clear();
  const startId = S.proj.system && S.proj.system.startMapId;
  for (const n of graph.nodes) {
    const el = h("div", {
      class: "wv-node" + (n.id === selId ? " sel" : "") + (n.id === S.curMapId ? " current" : ""),
      title: "Drag to arrange · click to select · double-click to open",
    },
      h("div", { class: "wv-node-title" },
        n.id === startId ? h("span", { class: "wv-start", title: "Starting map" }, "▶") : null,
        h("span", { class: "wv-node-name" }, (n.id + ": " + (n.name || "—"))),
      ),
      h("div", { class: "wv-node-dims" }, n.width + "×" + n.height),
    ) as HTMLElement;
    el.addEventListener("mousedown", (e: MouseEvent) => beginNodeDrag(e, n.id));
    el.addEventListener("dblclick", () => openMap(n.id));
    nodesLayer.appendChild(el);
    nodeEls.set(n.id, el);
  }
  renderPositions();
  updateHud();
}

// Reposition nodes + redraw edges from the current `cell` map (cheap; used
// during drags so we don't re-walk the project on every mouse move).
function renderPositions() {
  if (!stage || !svg || !nodesLayer) return;
  let maxX = 0, maxY = 0;
  const center = new Map<number, { x: number; y: number }>();
  for (const n of graph.nodes) {
    const c = cell.get(n.id)!;
    const left = PAD + c.x * CELL_W, top = PAD + c.y * CELL_H;
    const el = nodeEls.get(n.id);
    if (el) { el.style.left = left + "px"; el.style.top = top + "px"; }
    center.set(n.id, { x: left + NODE_W / 2, y: top + NODE_H / 2 });
    maxX = Math.max(maxX, left + NODE_W); maxY = Math.max(maxY, top + NODE_H);
  }
  const w = maxX + PAD, hgt = maxY + PAD;
  stage.style.width = w + "px";
  stage.style.height = hgt + "px";
  drawEdges(center, w, hgt);
}

function drawEdges(center: Map<number, { x: number; y: number }>, w: number, hgt: number) {
  if (!svg) return;
  svg.setAttribute("width", String(w));
  svg.setAttribute("height", String(hgt));
  svg.setAttribute("viewBox", "0 0 " + w + " " + hgt);
  // marker def + edges
  let inner = '<defs><marker id="wv-arrow" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto">'
    + '<path d="M0,0 L7,3 L0,6 Z" class="wv-arrowhead"/></marker></defs>';
  for (const e of graph.edges) {
    const a = center.get(e.from), b = center.get(e.to);
    if (!a || !b) continue;
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    // trim endpoints to the node box edges (approx via a fixed inset)
    const inset = 52;
    const bidir = graph.edges.some((o) => o.from === e.to && o.to === e.from);
    // perpendicular offset so A→B and B→A don't overlap
    const off = bidir ? 9 : 0;
    const px = -uy * off, py = ux * off;
    const x1 = a.x + ux * inset + px, y1 = a.y + uy * inset + py;
    const x2 = b.x - ux * inset + px, y2 = b.y - uy * inset + py;
    inner += '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2
      + '" class="wv-edge" marker-end="url(#wv-arrow)"/>';
    if (e.count > 1) {
      inner += '<text x="' + ((x1 + x2) / 2) + '" y="' + ((y1 + y2) / 2 - 4)
        + '" class="wv-edge-count">' + e.count + '</text>';
    }
    // re-link handle near the target end
    const hx = x2 - ux * 12, hy = y2 - uy * 12;
    inner += '<circle cx="' + hx + '" cy="' + hy + '" r="7" class="wv-relink" '
      + 'data-from="' + e.from + '" data-to="' + e.to + '"/>';
  }
  svg.innerHTML = inner;
}

// ============================ node drag / select ============================
function localStage(e: MouseEvent): { x: number; y: number } {
  const r = stage!.getBoundingClientRect();
  return { x: (e.clientX - r.left) / zoom, y: (e.clientY - r.top) / zoom };
}

function beginNodeDrag(e: MouseEvent, id: number) {
  if (e.button !== 0) return;
  e.preventDefault();
  select(id);
  const start = localStage(e);
  const c0 = { ...cell.get(id)! };
  let moved = false;
  const move = (ev: MouseEvent) => {
    const p = localStage(ev);
    const nx = c0.x + (p.x - start.x) / CELL_W;
    const ny = c0.y + (p.y - start.y) / CELL_H;
    if (Math.abs(p.x - start.x) + Math.abs(p.y - start.y) > 3) moved = true;
    cell.set(id, { x: nx, y: ny });
    renderPositions();
  };
  const up = () => {
    window.removeEventListener("mousemove", move);
    window.removeEventListener("mouseup", up);
    if (moved) {
      const c = cell.get(id)!;
      // snap to a tidy quarter-cell grid so arrangements stay readable
      const snapped = { x: Math.round(c.x * 4) / 4, y: Math.round(c.y * 4) / 4 };
      cell.set(id, snapped);
      const m = S.proj.maps.find((mm: any) => mm.id === id);
      if (m) m.worldPos = snapped;
      renderPositions();
      touch();
    }
  };
  window.addEventListener("mousemove", move);
  window.addEventListener("mouseup", up);
}

function select(id: number) {
  selId = id;
  for (const [nid, el] of nodeEls) el.classList.toggle("sel", nid === id);
  updateHud();
}

function openMap(id: number) {
  S.curMapId = id;
  S.selectedEvent = null;
  select(id);
  for (const [nid, el] of nodeEls) el.classList.toggle("current", nid === id);
  rebuildMapList(); renderMap(); setStatus();
  flashStatus("Opened map " + id);
}

// ============================ edge re-link (drag) ============================
function bindRelink() {
  if (!svg) return;
  svg.addEventListener("mousedown", (e: MouseEvent) => {
    const t = e.target as Element;
    if (!t || !t.classList || !t.classList.contains("wv-relink")) return;
    e.preventDefault(); e.stopPropagation();
    const from = Number(t.getAttribute("data-from"));
    const oldTo = Number(t.getAttribute("data-to"));
    const ghost = document.createElementNS(SVGNS, "line");
    ghost.setAttribute("class", "wv-relink-ghost");
    const a = localStage(e);
    ghost.setAttribute("x1", String(a.x)); ghost.setAttribute("y1", String(a.y));
    ghost.setAttribute("x2", String(a.x)); ghost.setAttribute("y2", String(a.y));
    svg!.appendChild(ghost);
    const move = (ev: MouseEvent) => {
      const p = localStage(ev);
      ghost.setAttribute("x2", String(p.x)); ghost.setAttribute("y2", String(p.y));
      highlightHit(ev);
    };
    const up = (ev: MouseEvent) => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      ghost.remove();
      const target = hitNode(ev);
      clearHitHighlight();
      if (target != null && target !== oldTo) applyRelink(from, oldTo, target);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  });
}

function nodeRects(): { id: number; r: DOMRect }[] {
  const out: { id: number; r: DOMRect }[] = [];
  for (const [id, el] of nodeEls) out.push({ id, r: el.getBoundingClientRect() });
  return out;
}
function hitNode(e: MouseEvent): number | null {
  for (const { id, r } of nodeRects()) {
    if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) return id;
  }
  return null;
}
function highlightHit(e: MouseEvent) {
  const id = hitNode(e);
  for (const [nid, el] of nodeEls) el.classList.toggle("wv-drop", nid === id);
}
function clearHitHighlight() {
  for (const el of nodeEls.values()) el.classList.remove("wv-drop");
}

function applyRelink(from: number, oldTo: number, newTo: number) {
  const fromMap = S.proj.maps.find((m: any) => m.id === from);
  if (!fromMap) return;
  const n = retargetEdge(fromMap, oldTo, newTo);
  if (n > 0) {
    touch(); rebuild();
    const fname = fromMap.name || from, tname = (S.proj.maps.find((m: any) => m.id === newTo) || {}).name || newTo;
    flashStatus("Re-linked " + n + (n > 1 ? " transfers" : " transfer") + " on " + fname + " → " + tname);
  }
}

// ============================ pan / zoom ============================
function applyZoom() {
  if (!stage) return;
  stage.style.transform = "scale(" + zoom + ")";
  stage.style.transformOrigin = "0 0";
  updateHud();
}
function setZoom(z: number) { zoom = Math.max(0.35, Math.min(2, z)); applyZoom(); }

function bindPan() {
  if (!viewport) return;
  // Drag empty background to pan the scroll container.
  viewport.addEventListener("mousedown", (e: MouseEvent) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest(".wv-node, .wv-relink")) return;
    const sx = e.clientX, sy = e.clientY, l0 = viewport!.scrollLeft, t0 = viewport!.scrollTop;
    viewport!.classList.add("panning");
    const move = (ev: MouseEvent) => {
      viewport!.scrollLeft = l0 - (ev.clientX - sx);
      viewport!.scrollTop = t0 - (ev.clientY - sy);
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      viewport!.classList.remove("panning");
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  });
  viewport.addEventListener("wheel", (e: WheelEvent) => {
    if (!e.ctrlKey) return; // plain wheel scrolls; Ctrl+wheel zooms
    e.preventDefault();
    setZoom(zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1));
  }, { passive: false });
}

// ============================ HUD / inspector ============================
function updateHud() {
  if (!hud) return;
  hud.innerHTML = "";
  hud.appendChild(h("div", { class: "wv-hud-row" },
    h("span", { class: "wv-hud-info" }, graph.nodes.length + " maps · " + graph.edges.length + " links"),
    h("span", { class: "wv-hud-spacer" }),
    h("button", { class: "mini", title: "Zoom out", onclick: () => setZoom(zoom / 1.15) }, "−"),
    h("span", { class: "wv-hud-zoom" }, Math.round(zoom * 100) + "%"),
    h("button", { class: "mini", title: "Zoom in", onclick: () => setZoom(zoom * 1.15) }, "+"),
    h("button", { class: "mini", title: "Reset positions to auto-layout", onclick: resetPositions }, "Auto-arrange"),
  ));
  if (graph.dangling.length) {
    hud.appendChild(h("div", { class: "wv-hud-warn" },
      "⚠ " + graph.dangling.length + " transfer" + (graph.dangling.length > 1 ? "s" : "")
      + " point to a deleted map"));
  }
  const m = selId >= 0 && S.proj.maps.find((mm: any) => mm.id === selId);
  if (m) {
    const notes = h("textarea", {
      class: "wv-notes", rows: "3", placeholder: "Notes for this map (design reminders, TODOs)…",
      oninput(e: any) { m.notes = e.target.value; touch(); },
    }) as HTMLTextAreaElement;
    notes.value = m.notes || "";
    hud.appendChild(h("div", { class: "wv-inspect" },
      h("div", { class: "wv-inspect-head" },
        h("span", null, "Map " + m.id + ": " + (m.name || "—")),
        h("button", { class: "mini", onclick: () => openMap(m.id) }, "Open"),
        h("button", { class: "mini", onclick: openMapProps }, "Properties…")),
      h("label", { class: "wv-notes-label" }, "Notes"),
      notes));
  } else {
    hud.appendChild(h("div", { class: "wv-inspect wv-inspect-empty dim" },
      "Select a map to edit its notes. Drag the ↻ handle on an arrow onto another map to re-link its transfers."));
  }
}

function resetPositions() {
  for (const m of S.proj.maps) delete m.worldPos;
  touch(); rebuild();
  flashStatus("World map auto-arranged");
}

// ============================ mount / dock integration ============================
export function mountWorldView(): HTMLElement {
  if (root) return root;
  svg = document.createElementNS(SVGNS, "svg") as SVGSVGElement;
  svg.setAttribute("class", "wv-edges");
  nodesLayer = h("div", { class: "wv-nodes" });
  stage = h("div", { class: "wv-stage" }, svg as any, nodesLayer) as HTMLElement;
  viewport = h("div", { class: "wv-viewport" }, stage) as HTMLElement;
  hud = h("div", { class: "wv-hud" });
  root = h("div", { class: "world-view dock-panel-content" }, viewport, hud) as HTMLElement;
  bindPan();
  bindRelink();
  applyZoom();
  rebuild();
  // Rebuild when the panel becomes visible again after being parked.
  setInterval(() => { if (dirty && isShowing()) rebuild(); }, 600);
  return root;
}

// ---- commands (bound by panels.ts / workspace.ts) ----
export function isWorldVisible() { return isPanelVisible(WORLD_PANEL); }
/** Toolbar / menu: show+focus when hidden or unfocused, otherwise hide. */
export function toggleWorld() {
  if (!isPanelVisible(WORLD_PANEL) || getFocusedPanel() !== WORLD_PANEL) {
    focusPanel(WORLD_PANEL);
    if (isShowing()) rebuild(); else worldDirty();
    // ensure current selection follows the editor's active map on open
    if (selId < 0) { const cm = curMap(); if (cm) select(cm.id); }
  } else {
    togglePanel(WORLD_PANEL);
  }
}
