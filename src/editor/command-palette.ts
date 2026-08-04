/* RPGAtlas — src/editor/command-palette.ts
   The command palette (Phase 3 Stage A): Ctrl+P / Tools ▸ Command Palette.
   A top-centered overlay in #modal-root (so boot.ts's "modal open ⇒ global
   keys off" guard covers it with no new special cases) that fuzzy-searches
   every registered, currently-enabled command and runs the selection.
   Imports from workspace.ts are call-time only (function-only cycle, same
   pattern as help.ts ↔ workspace.ts — safe).
   Copyright (C) 2026 RPGAtlas contributors — GPL-3.0-or-later (see LICENSE). */

import { t } from "./editor-state";
import { h } from "./dom";
import { modalRoot } from "./modals";
import { commandEntries, runAct, type CommandEntry } from "./workspace";
import { fuzzyScore } from "./fuzzy";

let openRef: { overlay: HTMLElement } | null = null;

export function isPaletteOpen() { return !!openRef; }
export function closeCommandPalette() {
  if (!openRef) return;
  openRef.overlay.remove();
  openRef = null;
}

function matches(entries: CommandEntry[], query: string): CommandEntry[] {
  if (!query.trim()) return entries;
  const scored: { e: CommandEntry; s: number }[] = [];
  for (const e of entries) {
    const s = fuzzyScore(query, e.category + " " + e.label);
    const sid = fuzzyScore(query, e.id);
    const best = Math.max(s === null ? -Infinity : s, sid === null ? -Infinity : sid);
    if (best > -Infinity) scored.push({ e, s: best });
  }
  scored.sort((a, b) => b.s - a.s); // Array#sort is stable: ties keep menu order
  return scored.map((x) => x.e);
}

export function openCommandPalette() {
  if (openRef) { closeCommandPalette(); return; } // Ctrl+P toggles
  const entries = commandEntries().filter((e) => e.enabled && e.id !== "cmdpal");
  let shown = entries;
  let sel = 0;

  const list = h("div", { class: "cmdpal-list" });
  const input = h("input", {
    class: "cmdpal-input", type: "text",
    placeholder: t("Type a command…"), spellcheck: "false",
  });
  const box = h("div", { class: "cmdpal" }, input, list);
  const overlay = h("div", { class: "cmdpal-overlay" }, box);

  function run(id: string) {
    closeCommandPalette();
    runAct(id);
  }
  function renderList() {
    list.innerHTML = "";
    if (!shown.length) {
      list.appendChild(h("div", { class: "cmdpal-empty" }, t("No matching commands")));
      return;
    }
    shown.forEach((e, i) => {
      const row = h("div", {
        class: "cmdpal-item" + (i === sel ? " sel" : ""),
        onmousedown(ev: MouseEvent) { ev.preventDefault(); run(e.id); },
        onmouseenter() { if (sel !== i) { sel = i; renderList(); } },
      },
        h("span", { class: "cmdpal-cat" }, e.category + " ▸ "),
        h("span", { class: "cmdpal-label" }, e.label),
        e.key ? h("span", { class: "mi-key" }, e.key) : null);
      list.appendChild(row);
      if (i === sel) row.scrollIntoView({ block: "nearest" });
    });
  }

  input.addEventListener("input", () => {
    shown = matches(entries, input.value);
    sel = 0;
    renderList();
  });
  input.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.code === "ArrowDown") { e.preventDefault(); if (shown.length) { sel = (sel + 1) % shown.length; renderList(); } }
    else if (e.code === "ArrowUp") { e.preventDefault(); if (shown.length) { sel = (sel - 1 + shown.length) % shown.length; renderList(); } }
    else if (e.code === "Enter") { e.preventDefault(); if (shown[sel]) run(shown[sel].id); }
    else if (e.code === "Escape") { e.preventDefault(); closeCommandPalette(); }
    else if (e.code === "KeyP" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); closeCommandPalette(); }
  });
  overlay.addEventListener("mousedown", (e: MouseEvent) => { if (e.target === overlay) closeCommandPalette(); });

  modalRoot().appendChild(overlay);
  openRef = { overlay };
  renderList();
  input.focus();
}
