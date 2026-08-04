/* RPGAtlas — src/editor/map-editor/sample-maps.ts
   The sample-map browser: the 🗺 button in the Maps panel opens a card grid of
   ready-made starter maps (layouts in sample-map-data.ts). Each card shows a
   live tile-rendered preview; "Add to project" appends a fresh copy with the
   next free map id and selects it, so beginners get a real map to explore and
   edit without touching the generator. Dialog body text is English-only by
   design (i18n scope rule: chrome only — see js/editor/i18n.js).
   Copyright (C) 2026 RPGAtlas contributors — GPL-3.0-or-later (see LICENSE). */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { Assets, RA, editorState as S } from "../editor-state";
import { h } from "../dom";
import { modal } from "../modals";
import { touch } from "../persistence";
import { renderMap } from "./map-render";
import { flashStatus } from "./status";
import { rebuildMapList } from "./map-list";
import { SAMPLE_MAPS, buildSampleMap, type SampleMapDef } from "./sample-map-data";

const PREVIEW_SCALE = 6; // px per tile in the card thumbnails

function previewCanvas(m: any) {
  const c = h("canvas", {
    class: "sample-preview",
    width: String(m.width * PREVIEW_SCALE),
    height: String(m.height * PREVIEW_SCALE),
  });
  const g = c.getContext("2d");
  g.scale(PREVIEW_SCALE / Assets.TILE, PREVIEW_SCALE / Assets.TILE);
  for (let y = 0; y < m.height; y++) {
    for (let x = 0; x < m.width; x++) {
      const i = y * m.width + x;
      Assets.drawTile(g, m.layers.ground[i], x * Assets.TILE, y * Assets.TILE);
      if (m.layers.decor[i]) Assets.drawTile(g, m.layers.decor[i], x * Assets.TILE, y * Assets.TILE);
    }
  }
  return c;
}

function addSampleToProject(def: SampleMapDef) {
  const tilesetId = (S.proj.tilesets && S.proj.tilesets[0]) ? S.proj.tilesets[0].id : 1;
  const m = buildSampleMap(def, RA.nextId(S.proj.maps), Assets.T, tilesetId);
  S.proj.maps.push(m);
  S.curMapId = m.id;
  S.selectedEvent = null;
  rebuildMapList(); renderMap(); touch();
  flashStatus(`Added sample map "${m.name}"`);
}

export function openSampleMapsBrowser() {
  const grid = h("div", { class: "sample-grid" });
  for (const def of SAMPLE_MAPS) {
    // Build once with a throwaway id just for the thumbnail; the real map is
    // built fresh (with the next free id) each time the user clicks Add.
    const preview = buildSampleMap(def, 0, Assets.T, 1);
    const addBtn = h("button", { class: "mini", onclick(e: any) {
      addSampleToProject(def);
      const b = e.target;
      b.textContent = "✓ Added";
      setTimeout(() => { b.textContent = "+ Add to project"; }, 1200);
    } }, "+ Add to project");
    grid.appendChild(h("div", { class: "sample-card" },
      previewCanvas(preview),
      h("div", { class: "sample-name" }, def.name,
        h("span", { class: "dim" }, ` ${preview.width}×${preview.height}`)),
      h("div", { class: "sample-desc" }, def.desc),
      addBtn));
  }
  modal({
    title: "Sample Maps",
    wide: true,
    content: h("div", null,
      h("div", { class: "dim", style: "margin-bottom:8px" },
        "Pick a ready-made map to start from — you can add as many as you like, then edit them freely."),
      grid),
    buttons: [{ label: "Close" }],
  });
}
