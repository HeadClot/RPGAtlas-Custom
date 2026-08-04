/* RPGAtlas — src/editor/console/commands-data.ts
   Console commands: bulk data & asset operations — database tables as JSON
   (export/import), folder-scale asset import, and the editor-translation
   parity check. The painful-through-dialogs bulk work.
   Copyright (C) 2026 RPGAtlas contributors — GPL-3.0-or-later (see LICENSE). */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { downloadBlob } from "../../../js/editor/project-io.js";
import { EDITOR_LOCALE_MESSAGES } from "../../../js/editor/i18n.js";
import { Assets, editorState as S, editorHooks } from "../editor-state";
import { touch } from "../persistence";
import { importAssets, libraryImageEntries, type ImportItem } from "../../shared/asset-library";
import { registerConsoleCommand, done, fail, text, table, type ConsoleBlock } from "./registry";

// Database tables addressable from the console. Import stays limited to these
// flat lists — maps travel via full project files, which run the migrator.
const TABLES: Record<string, { get: () => any[]; set?: (v: any[]) => void }> = {
  actors: { get: () => S.proj.actors, set: (v) => (S.proj.actors = v) },
  classes: { get: () => S.proj.classes, set: (v) => (S.proj.classes = v) },
  skills: { get: () => S.proj.skills, set: (v) => (S.proj.skills = v) },
  states: { get: () => S.proj.states, set: (v) => (S.proj.states = v) },
  items: { get: () => S.proj.items, set: (v) => (S.proj.items = v) },
  weapons: { get: () => S.proj.weapons, set: (v) => (S.proj.weapons = v) },
  armors: { get: () => S.proj.armors, set: (v) => (S.proj.armors = v) },
  enemies: { get: () => S.proj.enemies, set: (v) => (S.proj.enemies = v) },
  troops: { get: () => S.proj.troops, set: (v) => (S.proj.troops = v) },
  quests: { get: () => S.proj.quests, set: (v) => (S.proj.quests = v) },
  commonevents: { get: () => S.proj.commonEvents, set: (v) => (S.proj.commonEvents = v) },
  maps: { get: () => S.proj.maps }, // export-only
};
const TABLE_NAMES = Object.keys(TABLES).join(", ");

/** One-shot hidden file picker. Resolves null when the user cancels. */
function pickFiles(opts: { accept?: string; multiple?: boolean }): Promise<File[] | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    if (opts.accept) input.accept = opts.accept;
    if (opts.multiple) input.multiple = true;
    input.style.display = "none";
    document.body.appendChild(input);
    let settled = false;
    const finish = (v: File[] | null) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(v);
    };
    input.onchange = () => finish(input.files && input.files.length ? [...input.files] : null);
    // Cancel detection: the picker closing refocuses the window with no change event.
    window.addEventListener("focus", () => setTimeout(() => finish(null), 400), { once: true });
    input.click();
  });
}

registerConsoleCommand({
  name: "data export",
  group: "Data",
  summary: "Download a database table as a JSON file",
  usage: "data export <table>",
  args: [{ name: "table", hint: "one of: " + TABLE_NAMES, required: true }],
  run(args) {
    const key = args[0].toLowerCase();
    const tab = TABLES[key];
    if (!tab) return fail("No table called “" + args[0] + "”. Tables: " + TABLE_NAMES);
    const list = tab.get() || [];
    const name = (S.proj.system.title || "project").replace(/\W+/g, "-").toLowerCase() + "-" + key + ".json";
    downloadBlob(new Blob([JSON.stringify(list, null, 2)], { type: "application/json" }), name);
    return done([text("✓ Exported " + list.length + " " + key + " to " + name + ".", "ok")], { table: key, count: list.length });
  },
});

registerConsoleCommand({
  name: "data import",
  group: "Data",
  summary: "Replace a database table from a JSON file (export first for a backup!)",
  usage: "data import <table>",
  args: [{ name: "table", hint: "one of: " + TABLE_NAMES.replace(", maps", "") + " (not maps)", required: true }],
  async run(args) {
    const key = args[0].toLowerCase();
    const tab = TABLES[key];
    if (!tab) return fail("No table called “" + args[0] + "”. Tables: " + TABLE_NAMES);
    if (!tab.set) return fail("Maps can't be imported this way — use File ▸ Open Project for whole projects (it runs the format migrator).");
    const files = await pickFiles({ accept: ".json,application/json" });
    if (!files) return done([text("Import cancelled — nothing changed.", "dim")]);
    let parsed: any;
    try {
      parsed = JSON.parse(await files[0].text());
    } catch {
      return fail("That file isn't valid JSON.");
    }
    if (!Array.isArray(parsed) || parsed.some((e) => !e || typeof e !== "object" || typeof e.id !== "number")) {
      return fail("Expected a JSON array of " + key + " entries (each with a numeric id) — like the one “data export " + key + "” produces.");
    }
    const before = tab.get().length;
    tab.set(parsed);
    editorHooks.rebuildAll();
    touch();
    return done([
      text("✓ Imported " + parsed.length + " " + key + " (replaced the previous " + before + ").", "ok"),
      text("This replaced the whole table and can't be undone — “data export " + key + "” beforehand is your backup.", "dim"),
    ], { table: key, imported: parsed.length, replaced: before });
  },
});

const IMAGE_TYPES = ["characters", "facesets", "enemies", "tilesets"];

registerConsoleCommand({
  name: "assets import",
  group: "Data",
  summary: "Batch-import image or audio files into the asset library",
  usage: "assets import <type>",
  args: [{ name: "type", hint: "audio, or an image type: " + IMAGE_TYPES.join(", "), required: true }],
  async run(args) {
    const type = args[0].toLowerCase();
    if (type !== "audio" && !IMAGE_TYPES.includes(type)) {
      return fail("Pick what these files are: audio, " + IMAGE_TYPES.join(", ") + ". Example: assets import characters");
    }
    const files = await pickFiles({
      accept: type === "audio" ? "audio/*,.ogg,.mp3,.wav,.m4a,.flac" : "image/*",
      multiple: true,
    });
    if (!files) return done([text("Import cancelled — nothing changed.", "dim")]);
    const items: ImportItem[] = files.map((f) => ({
      blob: f,
      name: f.name,
      type: type === "audio" ? undefined : (type as any),
    }));
    const metas = await importAssets(items);
    // Live-register image entries so tile/character pickers see them without a reload.
    await Assets.registerExternalAssets(libraryImageEntries(), S.proj);
    const rows = metas.map((m: any) => [m.name, m.type, m.w ? m.w + "×" + m.h : m.dur ? m.dur.toFixed(1) + "s" : "", Math.round((m.bytes || 0) / 1024) + " KB"]);
    return done([
      text("✓ Imported " + metas.length + " file" + (metas.length === 1 ? "" : "s") + " into the library (duplicates are detected and reused).", "ok"),
      table(["Name", "Type", "Size", "Bytes"], rows),
      text("They're now available in the Asset Browser and all pickers.", "dim"),
    ], { imported: metas.map((m: any) => ({ key: m.key, name: m.name, type: m.type })) });
  },
});

registerConsoleCommand({
  name: "i18n check",
  group: "Data",
  summary: "Check the editor translations for missing keys across languages",
  usage: "i18n check",
  run() {
    const locales = Object.keys(EDITOR_LOCALE_MESSAGES);
    const messagesOf = (loc: string) => (EDITOR_LOCALE_MESSAGES as any)[loc].messages || {};
    const union = new Set<string>();
    for (const loc of locales) for (const k of Object.keys(messagesOf(loc))) union.add(k);
    const blocks: ConsoleBlock[] = [];
    const report: Record<string, string[]> = {};
    let missingTotal = 0;
    for (const loc of locales) {
      const keys = new Set(Object.keys(messagesOf(loc)));
      const missing = [...union].filter((k) => !keys.has(k));
      report[loc] = missing;
      missingTotal += missing.length;
      if (missing.length) {
        blocks.push(text(loc + " is missing " + missing.length + " key" + (missing.length === 1 ? "" : "s") + ":", "warn"));
        for (const k of missing.slice(0, 20)) blocks.push(text("  " + k, "dim"));
        if (missing.length > 20) blocks.push(text("  …and " + (missing.length - 20) + " more (use --json for the full list)", "dim"));
      }
    }
    if (!missingTotal) {
      blocks.push(text("✓ All " + locales.length + " translation dictionaries cover the same " + union.size + " keys.", "ok"));
      blocks.push(text("(The full source-derived gate also runs in CI: tests-unit/i18n-parity.test.ts.)", "dim"));
    }
    return { ok: !missingTotal, blocks, data: { locales, keys: union.size, missing: report } };
  },
});
