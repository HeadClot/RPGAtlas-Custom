/* RPGAtlas — src/editor/advanced/adv-automap.ts
   The Advanced Map Editor's Automap Rules drawer (Phase 8 Stage F, mockup 3): a
   collapsible bottom drawer that edits map.automapRules and drives Preview /
   Apply through the shared pure evaluator (src/shared/automap.ts).

   Each rule is an IF/AND/THEN sentence: a list of ANDed predicates (terrain is /
   tile is / near / not near / region is / passable) and a list of actions (place
   tile / place stamp / set region). Predicate & action operands are bound to the
   live project — terrains and tiles come from the palette selection and the
   project's autotile groups, layers from the generalized stack, stamps from
   proj.stamps, regions are plain numbers.

   Rule edits are autosaved config (touch(), NOT pushUndo) — they are the recipe,
   not the output, so they persist across an Apply's undo the way map folders do.
   Preview evaluates the rules and paints the diff as a canvas overlay; Apply
   takes ONE whole-map undo snapshot, writes the edits, and clears the preview —
   the Stage F "applies and undoes as one step" exit.
   Copyright (C) 2026 RPGAtlas contributors — GPL-3.0-or-later (see LICENSE). */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { editorState as S, curMap, t } from "../editor-state";
import { h } from "../dom";
import { touch } from "../persistence";
import { pushUndo } from "../map-editor/history";
import { flashStatus } from "../map-editor/status";
import { layerView } from "../../shared/layer-view";
import { tileIdOf, groupIdOf, isAutotileId } from "../../shared/autotile-registry";
import { tileId } from "../../shared/tile-flags";
import { evaluateAutomap, applyAutomapEdits, type AutomapEdit } from "../../shared/automap";
import type { AutomapRule, RulePredicate, RuleAction, Autotile, Stamp } from "../../shared/schema";
import { advState, advHooks } from "./adv-state";

// ---------------------------------------------------------------- storage ----

/** The live map.automapRules array, created lazily so a map that never opens
 *  the drawer keeps NO automapRules key (byte-identical export). */
function ensureRules(m: any): AutomapRule[] {
  if (!Array.isArray(m.automapRules)) m.automapRules = [];
  return m.automapRules;
}
function nextRuleId(rules: AutomapRule[]): number {
  return rules.reduce((mx, r) => Math.max(mx, r.id | 0), 0) + 1;
}
function autotiles(): Autotile[] {
  return (S.proj.autotiles as Autotile[]) || [];
}
function projStamps(): Stamp[] {
  return (S.proj.stamps as Stamp[]) || [];
}

/** Config edit: mutate, autosave, rebuild the drawer. Rule edits invalidate any
 *  standing preview (the diff no longer matches). Not on the undo stack. */
function editRules(fn: () => void) {
  fn();
  advState.automapPreview = null;
  touch();
  advHooks.rebuildAutomap();
  advHooks.render();
}

// ---------------------------------------------------------------- pickers ----

/** A human label for a tile/terrain value: an autotile group's name, else the
 *  masked numeric tile id. */
function tileLabel(value: number): string {
  if (isAutotileId(value)) {
    const g = autotiles().find((a) => a.id === groupIdOf(value));
    return g ? "🖌 " + g.name : t("Terrain") + " #" + groupIdOf(value);
  }
  return t("Tile") + " #" + tileId(value);
}

/** A tile/terrain value editor: shows the current value, a "use palette
 *  selection" button, and a dropdown of the project's terrain (autotile)
 *  groups. `onSet(value)` receives the chosen numeric id. */
function tileValueField(current: number, onSet: (v: number) => void): HTMLElement {
  const label = h("span", { class: "adv-am-tileval" }, tileLabel(current)) as HTMLElement;
  const useSel = h("button", {
    class: "adv-mini-btn", title: t("Use the currently selected palette tile"),
    onclick() { onSet(S.selectedTile); },
  }, "🎯") as HTMLElement;
  const groups = autotiles();
  const sel = h("select", {
    class: "adv-prop-select adv-am-terrsel",
    onchange(e: any) { const gid = Number(e.target.value); if (gid) onSet(tileIdOf(gid)); e.target.value = ""; },
  },
    h("option", { value: "" }, groups.length ? t("Terrain group…") : t("(no terrain groups)")),
    ...groups.map((g) => h("option", { value: String(g.id) }, g.name)),
  ) as HTMLSelectElement;
  return h("span", { class: "adv-am-tilefield" }, label, useSel, sel) as HTMLElement;
}

/** A layer selector: the four core roles + every generalized tile layer. Value
 *  is "core:<role>" for cores or the numeric layer id for tile layers. */
function layerSelect(current: number | string, onSet: (v: number | string) => void): HTMLElement {
  const m = curMap();
  const opts: { value: string; label: string }[] = [];
  for (const e of layerView(m)) {
    if (e.role) opts.push({ value: "core:" + e.role, label: e.name });
    else if (e.data) opts.push({ value: String(e.id), label: e.name });
  }
  const cur = typeof current === "number" ? String(current) : current;
  return h("select", {
    class: "adv-prop-select",
    onchange(e: any) { const v = e.target.value; onSet(v.startsWith("core:") ? v : Number(v)); },
  },
    ...opts.map((o) => h("option", { value: o.value, selected: o.value === cur ? "selected" : null }, o.label)),
  ) as HTMLElement;
}

function numField(cls: string, value: number, min: number, max: number, onSet: (v: number) => void): HTMLElement {
  return h("input", {
    type: "number", min: String(min), max: String(max), value: String(value),
    class: "adv-prop-input adv-prop-num " + cls,
    onchange(e: any) { onSet(Math.max(min, Math.min(max, Number(e.target.value) || min))); },
  }) as HTMLElement;
}

/** Percent field (0–100 in the UI, stored 0..1). */
function probField(value: number | undefined, onSet: (v: number) => void): HTMLElement {
  const pct = Math.round((value == null ? 1 : value) * 100);
  return h("input", {
    type: "number", min: "0", max: "100", value: String(pct), class: "adv-prop-input adv-prop-num adv-am-prob",
    title: t("Probability"),
    onchange(e: any) { onSet(Math.max(0, Math.min(100, Number(e.target.value) || 0)) / 100); },
  }) as HTMLElement;
}

// ------------------------------------------------------------- predicates ----

const PRED_KINDS: [RulePredicate["kind"], string][] = [
  ["terrainIs", "Terrain is"], ["tileIs", "Tile is"],
  ["near", "Near"], ["notNear", "Not near"],
  ["regionIs", "Region is"], ["passable", "Passable"],
];

function defaultPredicate(kind: RulePredicate["kind"]): RulePredicate {
  switch (kind) {
    case "terrainIs": return { kind, terrain: S.selectedTile };
    case "tileIs": return { kind, layerId: "core:ground", tile: S.selectedTile };
    case "near": return { kind, terrain: S.selectedTile, radius: 1 };
    case "notNear": return { kind, terrain: S.selectedTile, radius: 1 };
    case "regionIs": return { kind, region: 1 };
    case "passable": return { kind, value: true };
  }
}

function predicateOperands(rule: AutomapRule, p: RulePredicate, idx: number): HTMLElement[] {
  const patch = (np: RulePredicate) => editRules(() => { rule.if[idx] = np; });
  switch (p.kind) {
    case "terrainIs":
      return [tileValueField(p.terrain, (v) => patch({ ...p, terrain: v }))];
    case "tileIs":
      return [
        layerSelect(p.layerId, (v) => patch({ ...p, layerId: v as any })),
        tileValueField(p.tile, (v) => patch({ ...p, tile: v })),
      ];
    case "near":
    case "notNear":
      return [
        tileValueField(p.terrain, (v) => patch({ ...p, terrain: v })),
        h("span", { class: "adv-am-lbl" }, "r"),
        numField("adv-am-radius", p.radius, 1, 8, (v) => patch({ ...p, radius: v })),
      ];
    case "regionIs":
      return [numField("adv-am-region", p.region, 0, 63, (v) => patch({ ...p, region: v }))];
    case "passable": {
      const seltrue = p.value ? "selected" : null;
      return [h("select", {
        class: "adv-prop-select",
        onchange(e: any) { patch({ ...p, value: e.target.value === "true" }); },
      },
        h("option", { value: "true", selected: seltrue }, t("passable")),
        h("option", { value: "false", selected: p.value ? null : "selected" }, t("blocked")),
      ) as HTMLElement];
    }
  }
}

function predicateRow(rule: AutomapRule, p: RulePredicate, idx: number): HTMLElement {
  const kindSel = h("select", {
    class: "adv-prop-select adv-am-kind",
    onchange(e: any) { editRules(() => { rule.if[idx] = defaultPredicate(e.target.value); }); },
  },
    ...PRED_KINDS.map(([k, lbl]) => h("option", { value: k, selected: p.kind === k ? "selected" : null }, t(lbl))),
  ) as HTMLElement;
  return h("div", { class: "adv-am-row" },
    h("span", { class: "adv-am-conj" }, idx === 0 ? t("IF") : t("AND")),
    kindSel,
    ...predicateOperands(rule, p, idx),
    h("button", { class: "adv-zone-btn", title: t("Delete"), onclick() { editRules(() => { rule.if.splice(idx, 1); }); } }, "✕"),
  ) as HTMLElement;
}

// ---------------------------------------------------------------- actions ----

const ACT_KINDS: [RuleAction["kind"], string][] = [
  ["placeTile", "Place tile"], ["placeStamp", "Place stamp"], ["setRegion", "Set region"],
];

function defaultAction(kind: RuleAction["kind"]): RuleAction {
  switch (kind) {
    case "placeTile": return { kind, layerId: "core:decor", tile: S.selectedTile, probability: 1 };
    case "placeStamp": return { kind, stampId: projStamps()[0]?.id ?? 0, probability: 1 };
    case "setRegion": return { kind, region: 1 };
  }
}

function actionOperands(rule: AutomapRule, a: RuleAction, idx: number): HTMLElement[] {
  const patch = (na: RuleAction) => editRules(() => { rule.then[idx] = na; });
  switch (a.kind) {
    case "placeTile":
      return [
        layerSelect(a.layerId, (v) => patch({ ...a, layerId: v as any })),
        tileValueField(a.tile, (v) => patch({ ...a, tile: v })),
        h("span", { class: "adv-am-lbl" }, "%"),
        probField(a.probability, (v) => patch({ ...a, probability: v })),
      ];
    case "placeStamp": {
      const list = projStamps();
      const stampSel = h("select", {
        class: "adv-prop-select",
        onchange(e: any) { patch({ ...a, stampId: Number(e.target.value) }); },
      },
        ...(list.length ? list : [{ id: 0, name: t("(no stamps yet)") } as any]).map((s) =>
          h("option", { value: String(s.id), selected: s.id === a.stampId ? "selected" : null }, s.name)),
      ) as HTMLElement;
      return [
        stampSel,
        h("span", { class: "adv-am-lbl" }, "%"),
        probField(a.probability, (v) => patch({ ...a, probability: v })),
      ];
    }
    case "setRegion":
      return [numField("adv-am-region", a.region, 0, 63, (v) => patch({ ...a, region: v }))];
  }
}

function actionRow(rule: AutomapRule, a: RuleAction, idx: number): HTMLElement {
  const kindSel = h("select", {
    class: "adv-prop-select adv-am-kind",
    onchange(e: any) { editRules(() => { rule.then[idx] = defaultAction(e.target.value); }); },
  },
    ...ACT_KINDS.map(([k, lbl]) => h("option", { value: k, selected: a.kind === k ? "selected" : null }, t(lbl))),
  ) as HTMLElement;
  return h("div", { class: "adv-am-row" },
    h("span", { class: "adv-am-conj" }, idx === 0 ? t("THEN") : t("AND")),
    kindSel,
    ...actionOperands(rule, a, idx),
    h("button", { class: "adv-zone-btn", title: t("Delete"), onclick() { editRules(() => { rule.then.splice(idx, 1); }); } }, "✕"),
  ) as HTMLElement;
}

// ----------------------------------------------------------------- a rule ----

function ruleCard(rule: AutomapRule): HTMLElement {
  const enabled = rule.enabled !== false;
  const head = h("div", { class: "adv-am-rulehead" },
    h("input", { type: "checkbox", title: t("Enabled"), ...(enabled ? { checked: "" } : {}),
      onchange(e: any) { editRules(() => { rule.enabled = e.target.checked; }); } }),
    h("input", {
      type: "text", class: "adv-prop-input adv-am-rulename", value: rule.name || "",
      placeholder: t("Rule name"), spellcheck: "false",
      onchange(e: any) { editRules(() => { rule.name = e.target.value.trim() || undefined; }); },
    }),
    h("button", { class: "adv-zone-btn", title: t("Shuffle random seed"),
      onclick() { editRules(() => { rule.seed = (Math.random() * 0x7fffffff) | 0; }); } }, "🎲"),
    h("button", { class: "adv-zone-btn", title: t("Delete Rule"),
      onclick() { editRules(() => { const rs = ensureRules(curMap()); rs.splice(rs.indexOf(rule), 1); }); } }, "✕"),
  );
  const body = h("div", { class: "adv-am-rulebody" });
  (rule.if || []).forEach((p, i) => body.appendChild(predicateRow(rule, p, i)));
  body.appendChild(h("button", { class: "adv-am-add", onclick() { editRules(() => { (rule.if || (rule.if = [])).push(defaultPredicate("terrainIs")); }); } }, "＋ " + t("Add condition")));
  (rule.then || []).forEach((a, i) => body.appendChild(actionRow(rule, a, i)));
  body.appendChild(h("button", { class: "adv-am-add", onclick() { editRules(() => { (rule.then || (rule.then = [])).push(defaultAction("placeTile")); }); } }, "＋ " + t("Add action")));
  return h("div", { class: "adv-am-rule" + (enabled ? "" : " disabled") }, head, body) as HTMLElement;
}

// -------------------------------------------------------------- preview/apply

/** Evaluate the map's enabled rules into a diff. Shared by Preview and Apply so
 *  what you preview is exactly what applies. */
function evaluate(m: any): AutomapEdit[] {
  return evaluateAutomap(m, m.automapRules, { stamps: projStamps() }).edits;
}

export function previewAutomap() {
  const m = curMap();
  if (!m) return;
  const edits = evaluate(m);
  advState.automapPreview = edits;
  advHooks.render();
  advHooks.rebuildAutomap();
  flashStatus(edits.length
    ? "Automap preview: " + edits.length + " cell change(s) — press Apply to commit"
    : "Automap preview: no cells matched the current rules");
}

export function applyAutomap() {
  const m = curMap();
  if (!m) return;
  const edits = evaluate(m);
  if (!edits.length) { flashStatus("Automap: no cells matched — nothing to apply"); return; }
  pushUndo("Automap");
  applyAutomapEdits(m, edits);
  advState.automapPreview = null;
  touch();
  advHooks.render();
  advHooks.rebuildAutomap();
  advHooks.rebuildLayers();
  flashStatus("Automap applied " + edits.length + " cell change(s) — Ctrl+Z undoes it as one step");
}

export function clearAutomapPreview() {
  if (!advState.automapPreview) return;
  advState.automapPreview = null;
  advHooks.render();
  advHooks.rebuildAutomap();
}

export function toggleAutomapDrawer(open?: boolean) {
  advState.automapOpen = open == null ? !advState.automapOpen : open;
  advHooks.rebuildAutomap();
}

// ------------------------------------------------------------------ render ---

/** Build the whole drawer DOM into `el` (header + rule list). Called on mount
 *  and every rebuild. */
export function renderAutomapDrawer(el: HTMLElement) {
  el.innerHTML = "";
  const m = curMap();
  const rules = (m && (m.automapRules as AutomapRule[])) || [];
  const open = advState.automapOpen;
  el.classList.toggle("open", open);

  const preview = advState.automapPreview;
  const head = h("div", { class: "adv-automap-head" },
    h("button", { class: "adv-am-toggle", onclick() { toggleAutomapDrawer(); } },
      (open ? "▾ " : "▸ ") + t("Automap") + (rules.length ? " (" + rules.length + ")" : "")),
    h("span", { class: "adv-am-spacer" }),
    ...(preview ? [h("span", { class: "adv-am-preview-note" }, "◆ " + preview.length) as HTMLElement] : []),
    h("button", { class: "adv-mini-btn", title: t("Show the diff the current rules would produce"),
      onclick() { previewAutomap(); } }, t("Preview")),
    h("button", { class: "adv-am-applybtn", title: t("Commit the rules as one undoable step"),
      onclick() { applyAutomap(); } }, t("Apply")),
  ) as HTMLElement;
  el.appendChild(head);

  if (!open) return;
  const body = h("div", { class: "adv-automap-body" });
  body.appendChild(h("div", { class: "adv-am-hint dim" },
    t("Rules are editor-only — they reshape this map on Apply and never run in the game.")));
  if (!m) { el.appendChild(body); return; }
  const addBtn = h("button", { class: "adv-am-addrule", onclick() {
    editRules(() => {
      const rs = ensureRules(m);
      rs.push({ id: nextRuleId(rs), name: "", if: [{ kind: "terrainIs", terrain: S.selectedTile }], then: [{ kind: "placeTile", layerId: "core:decor", tile: S.selectedTile, probability: 1 }] });
    });
  } }, "＋ " + t("Add Rule"));
  body.appendChild(addBtn);
  for (const rule of rules) body.appendChild(ruleCard(rule));
  if (!rules.length) body.appendChild(h("div", { class: "adv-am-hint dim" }, t("No rules yet — add one to scatter detail across the map.")));
  el.appendChild(body);
}
