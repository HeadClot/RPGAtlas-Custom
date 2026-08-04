/* RPGAtlas — src/editor/console/commands-inspect.ts
   Console commands: project inspection (help, validate, stats, find, ai).
   Read-only over the live project; `find` results are clickable jumps.
   Copyright (C) 2026 RPGAtlas contributors — GPL-3.0-or-later (see LICENSE). */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { editorState as S } from "../editor-state";
import { setMode } from "../workspace";
import { rebuildMapList } from "../map-editor/map-list";
import { renderMap } from "../map-editor/map-render";
import { setStatus } from "../map-editor/status";
import { walkCommands } from "../event-editor/command-list";
import { openDatabase } from "../database";
import {
  assetUrlSync, isAssetKey, libraryCatalog, libraryMetas, usedAssetKeys,
} from "../../shared/asset-library";
import {
  registerConsoleCommand, listConsoleCommands, getConsoleCommand,
  done, fail, text, table, link,
  type ConsoleBlock,
} from "./registry";

function jumpToMap(mapId: number, ev?: any) {
  S.curMapId = mapId;
  S.selectedEvent = ev || null;
  if (ev) setMode("event");
  rebuildMapList();
  renderMap();
  setStatus();
}

// ---- help ----
registerConsoleCommand({
  name: "help",
  group: "Console",
  summary: "List every command, or explain one in detail",
  usage: "help [command]",
  args: [{ name: "command", hint: "a command name, e.g. “validate” or “build web”" }],
  run(args) {
    if (args.length) {
      const name = args.join(" ").toLowerCase();
      const def = getConsoleCommand(name);
      if (!def) return fail("No command called “" + name + "”. Type “help” to see them all.");
      const blocks: ConsoleBlock[] = [
        text(def.name + " — " + def.summary),
        text("Usage: " + def.usage, "dim"),
      ];
      for (const a of def.args || []) {
        blocks.push(text("  " + a.name + (a.required ? " (required)" : "") + " — " + a.hint, "dim"));
      }
      return done(blocks, { command: def.name, summary: def.summary, usage: def.usage, args: def.args || [] });
    }
    const all = listConsoleCommands();
    const blocks: ConsoleBlock[] = [
      text("RPGAtlas Console — type a command and press Enter. Add --json to any command for machine-readable output."),
    ];
    let group = "";
    for (const c of all) {
      if (c.group !== group) { group = c.group; blocks.push(text(group, "info")); }
      blocks.push(text("  " + c.usage.padEnd(28) + " " + c.summary, "dim"));
    }
    blocks.push(text("Tip: “help <command>” explains one command. Tab completes names, ↑ recalls history."));
    return done(blocks, { commands: all });
  },
});

// ---- validate ----
registerConsoleCommand({
  name: "validate",
  group: "Project",
  summary: "Check the project for broken references and missing assets",
  usage: "validate",
  run() {
    const p = S.proj;
    const problems: { where: string; what: string; mapId?: number }[] = [];
    const mapIds = new Set(p.maps.map((m: any) => m.id));

    if (!mapIds.has(p.system.startMapId)) {
      problems.push({ where: "System", what: "Start map " + p.system.startMapId + " does not exist" });
    }
    const checkCommands = (cmds: any[], where: string, mapId?: number) => {
      walkCommands(cmds, (c: any) => {
        if (c.t === "transfer" && !mapIds.has(c.mapId)) {
          problems.push({ where, what: "Transfer Player targets missing map " + c.mapId, mapId });
        }
        if (c.t === "commonEvent" && !p.commonEvents.some((ce: any) => ce.id === c.commonEventId)) {
          problems.push({ where, what: "Call Common Event targets missing common event " + c.commonEventId, mapId });
        }
        if (c.t === "battle" && c.troopId != null && !p.troops.some((tr: any) => tr.id === c.troopId)) {
          problems.push({ where, what: "Battle command targets missing troop " + c.troopId, mapId });
        }
        if (c.t === "item") {
          const list = (p as any)[c.kind + "s"];
          if (Array.isArray(list) && !list.some((it: any) => it.id === c.id)) {
            problems.push({ where, what: "Change Items targets missing " + c.kind + " " + c.id, mapId });
          }
        }
      });
    };
    for (const m of p.maps) {
      for (const ev of m.events || []) {
        for (const pg of ev.pages || []) {
          checkCommands(pg.commands || [], m.name + " → " + ev.name, m.id);
        }
      }
    }
    for (const ce of p.commonEvents) checkCommands(ce.commands || [], "Common event: " + ce.name);

    const missingAssets: string[] = [];
    try {
      for (const key of usedAssetKeys(p, libraryCatalog())) {
        if (isAssetKey(key) && assetUrlSync(key) == null) missingAssets.push(key);
      }
    } catch { /* library unavailable in this session — skip the asset pass */ }
    for (const key of missingAssets) problems.push({ where: "Assets", what: "Used asset not in this device's library: " + key });

    if (!problems.length) {
      return done([text("✓ No problems found — every reference points somewhere real.", "ok")], { ok: true, problems: [] });
    }
    const blocks: ConsoleBlock[] = [text(problems.length + " problem" + (problems.length === 1 ? "" : "s") + " found:", "warn")];
    for (const pr of problems) {
      if (pr.mapId != null) {
        const id = pr.mapId;
        blocks.push(link("  ⚠ " + pr.where + ": " + pr.what + "  (click to open map)", () => jumpToMap(id)));
      } else {
        blocks.push(text("  ⚠ " + pr.where + ": " + pr.what, "warn"));
      }
    }
    return { ok: false, blocks, data: { ok: false, problems: problems.map((x) => ({ where: x.where, what: x.what })) } };
  },
});

// ---- stats ----
registerConsoleCommand({
  name: "stats",
  group: "Project",
  summary: "Project at a glance: maps, events, database sizes, assets",
  usage: "stats",
  run() {
    const p = S.proj;
    const events = p.maps.reduce((n: number, m: any) => n + (m.events || []).length, 0);
    const tiles = p.maps.reduce((n: number, m: any) => n + m.width * m.height, 0);
    const metas = (() => { try { return libraryMetas(); } catch { return []; } })();
    const assetBytes = metas.reduce((n, m: any) => n + (m.bytes || 0), 0);
    const jsonBytes = JSON.stringify(p).length;
    const fmt = (n: number) => n < 1024 * 1024 ? Math.round(n / 1024) + " KB" : (n / 1024 / 1024).toFixed(1) + " MB";
    const data = {
      title: p.system.title, maps: p.maps.length, events, tiles,
      commonEvents: p.commonEvents.length, quests: p.quests.length, plugins: p.plugins.length,
      actors: p.actors.length, classes: p.classes.length, skills: p.skills.length,
      items: p.items.length, weapons: p.weapons.length, armors: p.armors.length,
      enemies: p.enemies.length, troops: p.troops.length, animations: p.animations.length,
      libraryAssets: metas.length, libraryBytes: assetBytes, projectJsonBytes: jsonBytes,
    };
    return done([
      text("“" + (p.system.title || "Untitled") + "”"),
      table(["What", "Count"], [
        ["Maps", String(data.maps) + "  (" + tiles + " tiles)"],
        ["Map events", String(events)],
        ["Common events", String(data.commonEvents)],
        ["Quests", String(data.quests)],
        ["Plugins", String(data.plugins)],
        ["Actors / Classes", data.actors + " / " + data.classes],
        ["Skills / Items", data.skills + " / " + data.items],
        ["Weapons / Armors", data.weapons + " / " + data.armors],
        ["Enemies / Troops", data.enemies + " / " + data.troops],
        ["Battle animations", String(data.animations)],
        ["Library assets", metas.length + "  (" + fmt(assetBytes) + ")"],
        ["Project JSON", fmt(jsonBytes)],
      ]),
    ], data);
  },
});

// ---- find ----
registerConsoleCommand({
  name: "find",
  group: "Project",
  summary: "Search maps, events, and the database for a name or text",
  usage: "find <text>",
  args: [{ name: "text", hint: "what to look for (quotes for phrases)", required: true, rest: true }],
  run(args) {
    const term = args.join(" ").toLowerCase();
    const blocks: ConsoleBlock[] = [];
    const hits: { kind: string; label: string }[] = [];
    const push = (label: string, run?: () => void) => {
      blocks.push(run ? link("  " + label, run) : text("  " + label, "dim"));
    };

    for (const m of S.proj.maps) {
      if ((m.name || "").toLowerCase().includes(term)) {
        hits.push({ kind: "map", label: m.name });
        push("🗺 Map " + m.id + ": " + m.name, () => jumpToMap(m.id));
      }
      for (const ev of m.events || []) {
        let matched = (ev.name || "").toLowerCase().includes(term);
        let snippet = "";
        if (!matched) {
          for (const pg of ev.pages || []) {
            walkCommands(pg.commands || [], (c: any) => {
              if (matched) return;
              const texts: string[] = [];
              if (c.t === "text") texts.push(c.text || "", c.name || "");
              if (c.t === "choices") texts.push(...(c.options || []));
              for (const s of texts) {
                if (String(s).toLowerCase().includes(term)) {
                  matched = true;
                  snippet = String(s).slice(0, 60);
                  return;
                }
              }
            });
            if (matched) break;
          }
        }
        if (matched) {
          hits.push({ kind: "event", label: m.name + " → " + ev.name });
          push("◆ " + m.name + " (" + ev.x + "," + ev.y + "): " + ev.name + (snippet ? " — “" + snippet + "”" : ""),
            () => jumpToMap(m.id, ev));
        }
      }
    }
    const dbLists: [string, any[]][] = [
      ["Actor", S.proj.actors], ["Class", S.proj.classes], ["Skill", S.proj.skills],
      ["Item", S.proj.items], ["Weapon", S.proj.weapons], ["Armor", S.proj.armors],
      ["Enemy", S.proj.enemies], ["Troop", S.proj.troops], ["State", S.proj.states],
      ["Quest", S.proj.quests], ["Common event", S.proj.commonEvents],
    ];
    for (const [label, list] of dbLists) {
      for (const entry of list || []) {
        if ((entry.name || "").toLowerCase().includes(term)) {
          hits.push({ kind: label.toLowerCase(), label: entry.name });
          push("📖 " + label + " " + entry.id + ": " + entry.name + "  (click to open Database)", () => openDatabase());
        }
      }
    }

    if (!hits.length) return done([text("Nothing found for “" + term + "”.", "dim")], { term, hits: [] });
    blocks.unshift(text(hits.length + " result" + (hits.length === 1 ? "" : "s") + " for “" + term + "”:"));
    return done(blocks, { term, hits });
  },
});

// ---- ai (integration scaffolding) ----
registerConsoleCommand({
  name: "ai",
  group: "Console",
  summary: "How assistants and scripts can drive this console",
  usage: "ai",
  run() {
    const count = listConsoleCommands().length;
    return done([
      text("AI & automation surface", "info"),
      text("Every Console command can be driven programmatically — the hook a future AI assistant (or your own scripts, plugins, and tests) uses:"),
      text("  window.AtlasConsole.list()        → all " + count + " commands with their argument specs", "dim"),
      text("  await window.AtlasConsole.run(\"stats --json\")  → { ok, text, data }", "dim"),
      text("Results carry structured data (the same payload --json prints), so tools can read them without parsing terminal text."),
      text("An in-editor AI assistant that plans and runs these commands for you is on the roadmap — this console is its foundation.", "dim"),
    ], { api: "window.AtlasConsole", version: 1, commands: count });
  },
});
