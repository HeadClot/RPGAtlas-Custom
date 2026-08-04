/* RPGAtlas — src/editor/tools/plugin-manager.ts
   The Plugin Manager modal: project-embedded JavaScript plugins with a list
   (status/ordering), metadata form, code editor, built-in plugin picker, and a
   drag-resizable split.
   Verbatim move from the editor monolith (Phase 1 Stage C, Package 3):
   logic unchanged, closure vars routed through editor-state.ts.
   Copyright (C) 2026 RPGAtlas contributors — GPL-3.0-or-later (see LICENSE). */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { AtlasBuiltins, RA, editorState as S } from "../editor-state";
import { h } from "../dom";
import { modal, confirmBox } from "../modals";
import { touch } from "../persistence";
import { flashStatus } from "../map-editor/status";

const PLUGIN_TEMPLATE = `/* RPGAtlas plugin — runs once when the game boots.
 * Available objects:
 *   atlas.project / atlas.map / atlas.player / atlas.scene
 *   atlas.SCREEN_W atlas.SCREEN_H atlas.TILE   atlas.Assets / atlas.Sfx / atlas.Music
 *   atlas.onMapLoad(fn)        fn(map) after every map load
 *   atlas.onUpdate(fn)         fn() every frame on the map scene
 *   atlas.onRender(ctx, info)  draw over the map each frame (info: w,h,t,map,camX,camY)
 *   atlas.onMessageText(fn)    transform message HTML (text codes)
 *   atlas.setTransition({out,in})   custom transfer effect
 *   atlas.registerCommand(type, fn) handle a custom event command
 *   atlas.startBattle(troopId)      start a battle, resolves "win"/"lose"/"escape"
 *   game.setSwitch/getSwitch/setVar/getVar/addGold/callCommonEvent/party/state
 * Tip: the bundled Atlas_* plugins (Add → Built-in…) show real examples.
 * A hook that throws is disabled (see the browser console). */
atlas.onMapLoad((map) => {
  console.log("Entered " + map.name);
});`;

export function openPluginManager() {
  const plugins = S.proj.plugins;
  let cur = plugins[0] || null;
  const list = h("ul", { class: "plug-list" });
  const nameIn = h("input", { type: "text", placeholder: "Plugin name", oninput(e: any) { if (cur) { cur.name = e.target.value; touch(); redrawList(); } } });
  const pluginIdIn = h("input", { type: "text", placeholder: "Plugin ID, e.g. atlas.weather", oninput(e: any) { if (cur) { cur.pluginId = e.target.value.trim(); touch(); redrawList(); } } });
  const versionIn = h("input", { type: "text", placeholder: "Version", oninput(e: any) { if (cur) { cur.version = e.target.value.trim(); touch(); } } });
  const authorIn = h("input", { type: "text", placeholder: "Author", oninput(e: any) { if (cur) { cur.author = e.target.value; touch(); } } });
  const depsIn = h("input", { type: "text", placeholder: "Dependencies: atlas.core, other.plugin", oninput(e: any) { if (cur) { cur.dependencies = e.target.value.split(",").map((s: any) => s.trim()).filter(Boolean); touch(); redrawList(); } } });
  const descIn = h("textarea", { class: "plug-desc", placeholder: "Description", spellcheck: "true", oninput(e: any) { if (cur) { cur.description = e.target.value; touch(); } } });
  const codeTa = h("textarea", { spellcheck: "false", oninput(e: any) { if (cur) { cur.code = e.target.value; touch(); } } });
  function pluginIdentity(pl: any) { return String(pl && (pl.pluginId || pl.key || pl.name || ("plugin." + pl.id)) || "").trim(); }
  function pluginStatus(pl: any) {
    const id = pluginIdentity(pl);
    if (!id) return { label: "missing id", cls: "warn" };
    if (plugins.some((other: any) => other !== pl && pluginIdentity(other) === id)) return { label: "duplicate id", cls: "warn" };
    const missing = (pl.dependencies || []).filter((dep: any) => !plugins.some((other: any) => other.on && pluginIdentity(other) === dep));
    if (pl.on && missing.length) return { label: "missing dep", cls: "warn" };
    return { label: pl.on ? "ready" : "disabled", cls: pl.on ? "ok" : "off" };
  }
  function redrawList() {
    list.innerHTML = "";
    plugins.forEach((pl: any) => {
      const st = pluginStatus(pl);
      const cb = h("input", { type: "checkbox",
        onclick(e: any) { e.stopPropagation(); },
        onchange(e: any) { pl.on = e.target.checked; touch(); redrawList(); },
        ...(pl.on ? { checked: "" } : {}) });
      const kids = [cb, h("span", { class: "plug-name" }, pl.name || "(unnamed)")];
      if (pl.builtin) kids.push(h("span", { class: "plug-badge" }, "built-in"));
      // Shells the RM import's plugin converter made — credits + settings kept.
      if (pl.rmImport) kids.push(h("span", { class: "plug-badge", title: "Converted from an RPG Maker add-on — the original author's credit and settings are kept inside" }, "from RPG Maker"));
      kids.push(h("span", { class: "plug-status " + st.cls }, st.label));
      list.appendChild(h("li", {
        class: (pl === cur ? "sel" : "") + (pl.on ? "" : " off"),
        onclick() { cur = pl; redrawList(); redrawForm(); },
      }, ...kids));
    });
  }
  function addBuiltinPicker() {
    const missing = typeof AtlasBuiltins !== "undefined" ? AtlasBuiltins.missingFor(plugins) : [];
    if (!missing.length) { flashStatus("All bundled plugins are already in this project"); return; }
    const box = h("div", { class: "minilist" });
    const picker = modal({ title: "Add Bundled Plugin", content: box, buttons: [{ label: "Cancel" }] });
    missing.forEach((spec: any) => {
      box.appendChild(h("div", { class: "minirow", style: "align-items:flex-start" },
        h("div", { style: "flex:1" }, h("b", null, spec.key), h("div", { class: "dim" }, spec.desc)),
        h("button", { class: "mini", onclick() {
          const id = RA.nextId(plugins.length ? plugins : [{ id: 0 }]);
          const pl = AtlasBuiltins.make(spec.key, id);
          plugins.push(pl); cur = pl;
          touch(); redrawList(); redrawForm(); picker.close();
        } }, "Add")));
    });
  }
  function redrawForm() {
    nameIn.value = cur ? cur.name : "";
    pluginIdIn.value = cur ? (cur.pluginId || cur.key || "") : "";
    versionIn.value = cur ? (cur.version || "") : "";
    authorIn.value = cur ? (cur.author || "") : "";
    depsIn.value = cur ? (cur.dependencies || []).join(", ") : "";
    descIn.value = cur ? (cur.description || "") : "";
    codeTa.value = cur ? cur.code : "";
    nameIn.disabled = pluginIdIn.disabled = versionIn.disabled = authorIn.disabled = depsIn.disabled = descIn.disabled = codeTa.disabled = !cur;
  }
  function move(d: any) {
    if (!cur) return;
    const i = plugins.indexOf(cur), ni = i + d;
    if (ni < 0 || ni >= plugins.length) return;
    plugins.splice(i, 1); plugins.splice(ni, 0, cur);
    touch(); redrawList();
  }
  const side = h("div", { class: "plug-side" },
    h("div", { class: "dbbtns" },
      h("button", { onclick() {
        const id = RA.nextId(plugins.length ? plugins : [{ id: 0 }]);
        const pl = { id: id, name: "New Plugin", pluginId: "plugin." + id, version: "1.0.0", author: "", description: "", dependencies: [], on: true, code: PLUGIN_TEMPLATE };
        plugins.push(pl); cur = pl;
        touch(); redrawList(); redrawForm();
      } }, "+ New"),
      h("button", { title: "Add one of the engine's bundled plugins", onclick: addBuiltinPicker }, "+ Built-in…"),
      h("button", { onclick() {
        if (!cur) return;
        confirmBox('Delete plugin "' + cur.name + '"?', () => {
          plugins.splice(plugins.indexOf(cur), 1);
          cur = plugins[0] || null;
          touch(); redrawList(); redrawForm();
        });
      } }, "Delete"),
      h("button", { class: "mini", title: "Run earlier", onclick: () => move(-1) }, "↑"),
      h("button", { class: "mini", title: "Run later", onclick: () => move(1) }, "↓"),
    ),
    list,
    h("div", { class: "dim" }, "Checked plugins run top-to-bottom at game boot."),
  );
  const meta = h("div", { class: "plug-meta" },
    h("label", null, "Name", nameIn),
    h("label", null, "Plugin ID", pluginIdIn),
    h("label", null, "Version", versionIn),
    h("label", null, "Author", authorIn),
    h("label", { class: "wide" }, "Dependencies", depsIn),
    h("label", { class: "wide" }, "Description", descIn));
  const form = h("div", { class: "plug-form" }, meta, codeTa);
  const minSideW = 220, minFormW = 360;
  let draggingSplit = false, dragStartX = 0, dragStartW = 0;
  function clampSideW(w: any) {
    const max = Math.max(minSideW, wrap.getBoundingClientRect().width - minFormW);
    return Math.max(minSideW, Math.min(max, w));
  }
  const split = h("div", {
    class: "plug-split",
    title: "Drag to resize the plugin list",
    onpointerdown(e: any) {
      draggingSplit = true;
      dragStartX = e.clientX;
      dragStartW = side.getBoundingClientRect().width;
      split.classList.add("dragging");
      split.setPointerCapture(e.pointerId);
      e.preventDefault();
    },
    onpointermove(e: any) {
      if (!draggingSplit) return;
      side.style.width = clampSideW(dragStartW + e.clientX - dragStartX) + "px";
    },
    onpointerup(e: any) {
      draggingSplit = false;
      split.classList.remove("dragging");
      if (split.hasPointerCapture(e.pointerId)) split.releasePointerCapture(e.pointerId);
    },
    onpointercancel(e: any) {
      draggingSplit = false;
      split.classList.remove("dragging");
      if (split.hasPointerCapture(e.pointerId)) split.releasePointerCapture(e.pointerId);
    },
  });
  const wrap = h("div", { class: "plug-wrap" }, side, split, form);
  redrawList(); redrawForm();
  modal({ title: "Plugin Manager", wide: true, resizable: true, dismissable: false, class: "plugin-modal",
    content: wrap,
    buttons: [{ label: "Close", primary: true }] });
}
