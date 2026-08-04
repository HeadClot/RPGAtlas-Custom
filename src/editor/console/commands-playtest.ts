/* RPGAtlas — src/editor/console/commands-playtest.ts
   Console commands: playtest control. "playtest [map [x y]]" launches the
   player (optionally straight onto a map), and give / switch / var / goto
   talk to the RUNNING playtest over the BroadcastChannel bridge
   (src/engine/playtest-bridge.ts answers on the other side).
   Copyright (C) 2026 RPGAtlas contributors — GPL-3.0-or-later (see LICENSE). */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { editorState as S } from "../editor-state";
import { runAct } from "../workspace";
import { registerConsoleCommand, done, fail, text } from "./registry";

// Mirrors src/engine/playtest-bridge.ts — keep in sync.
const PLAYTEST_START_KEY = "rpgatlas_playtest_start";
const PLAYTEST_CHANNEL = "rpgatlas_playtest_bridge";

const NOT_RUNNING =
  "No running playtest answered. Start one with “playtest” (F5), then try again.";

let channel: BroadcastChannel | null = null;
const pending = new Map<string, (v: { ok: boolean; text: string }) => void>();
let seq = 1;

function sendToPlaytest(msg: Record<string, unknown>, timeoutMs = 700): Promise<{ ok: boolean; text: string }> {
  if (typeof BroadcastChannel === "undefined")
    return Promise.reject(new Error("This browser cannot talk to the playtest window."));
  if (!channel) {
    channel = new BroadcastChannel(PLAYTEST_CHANNEL);
    channel.onmessage = (ev: MessageEvent) => {
      const d = ev.data;
      if (!d || !d.re) return;
      const resolve = pending.get(d.re);
      if (resolve) { pending.delete(d.re); resolve({ ok: !!d.ok, text: String(d.text || "") }); }
    };
  }
  // `rid` correlates request and reply — kept apart from domain fields like a
  // switch/item `id` so the payload can never clobber it.
  const rid = "c" + seq++ + "_" + Date.now();
  return new Promise((resolve, reject) => {
    pending.set(rid, resolve);
    setTimeout(() => {
      if (pending.delete(rid)) reject(new Error(NOT_RUNNING));
    }, timeoutMs);
    channel!.postMessage({ rid, ...msg });
  });
}

function findMap(idOrName: string) {
  const id = Number(idOrName);
  if (Number.isFinite(id)) return S.proj.maps.find((m: any) => m.id === id) || null;
  const q = idOrName.toLowerCase();
  return S.proj.maps.find((m: any) => (m.name || "").toLowerCase() === q) ||
         S.proj.maps.find((m: any) => (m.name || "").toLowerCase().includes(q)) || null;
}

/** Resolve "potion", "Iron Sword", or a bare id across items/weapons/armors. */
function findGoods(idOrName: string): { kind: string; entry: any } | null {
  const lists: [string, any[]][] = [["item", S.proj.items], ["weapon", S.proj.weapons], ["armor", S.proj.armors]];
  const id = Number(idOrName);
  const q = idOrName.toLowerCase();
  for (const exact of [true, false]) {
    for (const [kind, list] of lists) {
      for (const entry of list || []) {
        if (Number.isFinite(id) && entry.id === id) return { kind, entry };
        const name = (entry.name || "").toLowerCase();
        if (exact ? name === q : name.includes(q)) return { kind, entry };
      }
    }
    if (Number.isFinite(id)) break; // numeric ids don't need the fuzzy pass
  }
  return null;
}

registerConsoleCommand({
  name: "playtest",
  group: "Playtest",
  summary: "Save and run the game — optionally starting on a chosen map and tile",
  usage: "playtest [map] [x y]",
  args: [
    { name: "map", hint: "map id or name to start on (skips the title screen)" },
    { name: "x", hint: "start column on that map" },
    { name: "y", hint: "start row on that map" },
  ],
  run(args) {
    if (args.length) {
      const map = findMap(args[0]);
      if (!map) return fail("No map called “" + args[0] + "”. “stats” lists how many maps you have; the Maps panel shows their names.");
      const x = args.length > 1 ? Number(args[1]) : Math.floor(map.width / 2);
      const y = args.length > 2 ? Number(args[2]) : Math.floor(map.height / 2);
      if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x >= map.width || y >= map.height) {
        return fail("That spot is outside “" + map.name + "” (" + map.width + "×" + map.height + " tiles).");
      }
      try {
        localStorage.setItem(PLAYTEST_START_KEY, JSON.stringify({ mapId: map.id, x, y, ts: Date.now() }));
      } catch { /* quota — the playtest just starts normally */ }
      runAct("play");
      return done([text("▶ Playtest starting on “" + map.name + "” at (" + x + "," + y + ") — title screen skipped.", "ok")],
        { mapId: map.id, x, y });
    }
    runAct("play");
    return done([text("▶ Playtest starting (same as the Playtest button / F5).", "ok")], {});
  },
});

registerConsoleCommand({
  name: "give",
  group: "Playtest",
  summary: "Give the party an item / weapon / armor in the running playtest",
  usage: "give <item> [count]",
  args: [
    { name: "item", hint: "item name or id (weapons and armors too)", required: true },
    { name: "count", hint: "how many (default 1, negative takes away)" },
  ],
  async run(args) {
    const count = args.length > 1 ? Number(args[args.length - 1]) : 1;
    const nameArgs = Number.isFinite(count) && args.length > 1 ? args.slice(0, -1) : args;
    const goods = findGoods(nameArgs.join(" "));
    if (!goods) return fail("Nothing in the database matches “" + nameArgs.join(" ") + "”. Try “find " + nameArgs.join(" ") + "”.");
    const n = Number.isFinite(count) ? count : 1;
    const r = await sendToPlaytest({ op: "give", kind: goods.kind, id: goods.entry.id, n });
    return r.ok ? done([text("✓ " + r.text, "ok")], r) : fail(r.text);
  },
});

registerConsoleCommand({
  name: "switch",
  group: "Playtest",
  summary: "Flip a game switch in the running playtest",
  usage: "switch <id> <on|off>",
  args: [
    { name: "id", hint: "switch number", required: true },
    { name: "state", hint: "on or off", required: true },
  ],
  async run(args) {
    const id = Number(args[0]);
    const state = args[1].toLowerCase();
    if (!Number.isFinite(id)) return fail("Switch id must be a number. Usage: switch 5 on");
    if (state !== "on" && state !== "off") return fail("Say on or off. Usage: switch " + args[0] + " on");
    const r = await sendToPlaytest({ op: "switch", id, val: state === "on" });
    return r.ok ? done([text("✓ " + r.text, "ok")], r) : fail(r.text);
  },
});

registerConsoleCommand({
  name: "var",
  group: "Playtest",
  summary: "Set a game variable in the running playtest",
  usage: "var <id> <value>",
  args: [
    { name: "id", hint: "variable number", required: true },
    { name: "value", hint: "the number to store", required: true },
  ],
  async run(args) {
    const id = Number(args[0]);
    const val = Number(args[1]);
    if (!Number.isFinite(id) || !Number.isFinite(val)) return fail("Both id and value must be numbers. Usage: var 3 100");
    const r = await sendToPlaytest({ op: "var", id, val });
    return r.ok ? done([text("✓ " + r.text, "ok")], r) : fail(r.text);
  },
});

registerConsoleCommand({
  name: "goto",
  group: "Playtest",
  summary: "Teleport the player in the running playtest",
  usage: "goto <map> <x> <y>",
  args: [
    { name: "map", hint: "map id or name", required: true },
    { name: "x", hint: "column", required: true },
    { name: "y", hint: "row", required: true },
  ],
  async run(args) {
    const map = findMap(args[0]);
    if (!map) return fail("No map called “" + args[0] + "”.");
    const x = Number(args[1]), y = Number(args[2]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return fail("x and y must be numbers. Usage: goto " + map.id + " 5 7");
    // Teleporting plays the map-transfer transition (~1–2s) before replying.
    const r = await sendToPlaytest({ op: "goto", mapId: map.id, x, y }, 6000);
    return r.ok ? done([text("✓ " + r.text, "ok")], r) : fail(r.text);
  },
});
