/* RPGAtlas — src/editor/event-editor/quick-events.ts
   Quick-event builders: place a ready-made event (Sign / Transfer / Chest /
   Villager / Shopkeeper / Innkeeper / Locked Door / Door / Save Point /
   Healing Crystal / Monster / Gift NPC / Quest Giver) from a single small
   dialog without opening the full event editor. Each template generates
   ordinary pages and commands, so beginners can open the result afterwards and
   see exactly how it works.
   Sign/Transfer/Chest are a verbatim move from the editor monolith (Phase 1
   Stage C, Package 2): logic unchanged, closure vars routed through
   editor-state.ts; the toolbar refresh is imported directly from workspace.ts
   (Package 3 owns actions/toolbar; one-way edge — workspace does not import
   quick-events).
   Copyright (C) 2026 RPGAtlas contributors — GPL-3.0-or-later (see LICENSE). */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { Assets, DataDefaults, RA, editorState as S, curMap } from "../editor-state";
import { h, sel, tIn, nIn, chk, field, row, dbOpts, charsetOpts, DIR_OPTS } from "../dom";
import { modal } from "../modals";
import { touch } from "../persistence";
import { renderMap } from "../map-editor/map-render";
import { refreshToolbar } from "../workspace";
import { pushUndo } from "../map-editor/history";
import { eventAt } from "../map-editor/painting";
import { flashStatus } from "../map-editor/status";
import { editCommand } from "./command-defs";
import { openLocationPicker } from "./location-picker";

  // ---- quick-event builders ----
  // Build a page from the defaults, merging cond onto (not over) the default cond.
  function mkPage(opts: any, commands: any) {
    const p = DataDefaults.newPage();
    opts = opts || {};
    if (opts.cond) Object.assign(p.cond, opts.cond);
    for (const k in opts) if (k !== "cond") p[k] = opts[k];
    p.commands = commands || [];
    return p;
  }
  function placeQuickEvent(cell: any, name: any, pages: any) {
    if (eventAt(cell.x, cell.y)) { flashStatus("That cell already has an event"); return null; }
    pushUndo("Quick event");
    const ev = DataDefaults.newEvent(RA.nextId(curMap().events), cell.x, cell.y, name);
    ev.pages = pages;
    curMap().events.push(ev);
    S.selectedEvent = ev;
    touch(); renderMap(); refreshToolbar();
    return ev;
  }
  export function quickSign(cell: any) {
    if (eventAt(cell.x, cell.y)) { flashStatus("That cell already has an event"); return; }
    // Like Transfer/Chest: collect the content in a small dialog (here, the Show Text editor),
    // then build & place the event — no detour through the full event editor.
    const c = { t: "text", name: "", face: "", text: "" };
    // editCommand(cmd, onOK, skipSnapshot, snapFn, onCancel): skip the editor's own undo snapshot
    // (placeQuickEvent pushes one) and, on Cancel, do nothing so no empty event is left behind.
    editCommand(c, () => {
      placeQuickEvent(cell, "Sign", [
        mkPage({ charset: "sign", trigger: "action" }, [c]),
      ]);
    }, true, null, () => {});
  }
  export function quickTransfer(cell: any) {
    if (eventAt(cell.x, cell.y)) { flashStatus("That cell already has an event"); return; }
    const w = { mapId: S.proj.maps[0] ? S.proj.maps[0].id : 0, x: 0, y: 0, dir: 0 };
    // Keep refs to the Map/X/Y inputs so the visual picker can write back into them
    // (mirrors the full Transfer Player command form's "Pick destination" button).
    const mapSel = sel(w, "mapId", dbOpts(S.proj.maps));
    const xIn = nIn(w, "x", 0);
    const yIn = nIn(w, "y", 0);
    const content = h("div", null,
      row(field("Map", mapSel), field("X", xIn), field("Y", yIn),
        field("Facing", sel(w, "dir", DIR_OPTS))),
      h("button", { class: "mini", onclick() {
        openLocationPicker(w.mapId, w.x, w.y, (res: any) => {
          w.mapId = res.mapId; w.x = res.x; w.y = res.y;
          mapSel.value = String(res.mapId); xIn.value = res.x; yIn.value = res.y;
        });
      } }, "📍 Pick destination on map…"));
    modal({
      title: "New Transfer Event",
      content,
      buttons: [
        { label: "Create", primary: true, onClick(close: any) {
          close();
          placeQuickEvent(cell, "Transfer", [
            mkPage({ charset: "", trigger: "touch", priority: "below", through: true },
              [{ t: "transfer", mapId: w.mapId, x: w.x, y: w.y, dir: w.dir }]),
          ]);
        } },
        { label: "Cancel" },
      ],
      dialogKeys: true,
    });
  }
  export function quickChest(cell: any) {
    if (eventAt(cell.x, cell.y)) { flashStatus("That cell already has an event"); return; }
    const w = { kind: "item", id: S.proj.items[0] ? S.proj.items[0].id : 0, val: 1 };
    const entryWrap = h("span");
    function redrawEntry() {
      const isGold = w.kind === "gold";
      const arr = w.kind === "weapon" ? S.proj.weapons : w.kind === "armor" ? S.proj.armors : S.proj.items;
      if (!isGold) w.id = arr[0] ? arr[0].id : 0; // keep id valid when kind changes
      entryWrap.innerHTML = "";
      entryWrap.appendChild(isGold ? h("span", null, "—") : sel(w, "id", dbOpts(arr)));
    }
    const content = h("div", null,
      row(field("Kind", sel(w, "kind",
          [{ v: "item", l: "Item" }, { v: "weapon", l: "Weapon" }, { v: "armor", l: "Armor" }, { v: "gold", l: "Gold" }],
          redrawEntry)),
        field("Entry", entryWrap),
        field("Amount", nIn(w, "val", 1, 9999))));
    redrawEntry();
    modal({
      title: "New Chest",
      content,
      buttons: [
        { label: "Create", primary: true, onClick(close: any) {
          close();
          const give = w.kind === "gold"
            ? { t: "gold", op: "add", val: w.val }
            : { t: "item", kind: w.kind, id: w.id, op: "add", val: w.val };
          const label = w.kind === "gold" ? (w.val + " Gold") : ("×" + w.val);
          placeQuickEvent(cell, "Chest", [
            mkPage({ charset: "chest", trigger: "action" }, [
              { t: "se", name: "chest" },
              give,
              { t: "text", name: "", text: "Found " + label + "!" },
              { t: "selfsw", key: "A", val: true },
            ]),
            mkPage({ cond: { selfSw: "A" }, charset: "chest_open", trigger: "action" }, []),
          ]);
        } },
        { label: "Cancel" },
      ],
      dialogKeys: true,
    });
  }

  // ---- NPC-flavored templates (Villager / Shopkeeper / Innkeeper / Locked Door) ----
  // Charset picker with the same live face preview the Show Text form has.
  function charsetField(w: any, key: string, label: string) {
    const preview = h("span", { class: "char-preview" });
    function redraw() {
      preview.innerHTML = "";
      const ci = Assets.charsetIndex(w[key]);
      if (ci >= 0) preview.appendChild(Assets.faceCanvas(ci));
    }
    const s = sel(w, key, charsetOpts(true), redraw);
    redraw();
    return row(field(label, s), preview);
  }
  export function quickVillager(cell: any) {
    if (eventAt(cell.x, cell.y)) { flashStatus("That cell already has an event"); return; }
    const w = { charset: "villager_m", name: "", text: "Nice weather today, isn't it?", wander: true };
    const ta = h("textarea", { rows: 3, oninput(e: any) { w.text = e.target.value; } }, w.text);
    const content = h("div", null,
      charsetField(w, "charset", "Looks like"),
      row(field("Name shown over the text (optional)", tIn(w, "name")),
        field("Wanders around", chk(w, "wander"))),
      field("What they say", ta));
    modal({
      title: "New Villager",
      content,
      buttons: [
        { label: "Create", primary: true, onClick(close: any) {
          close();
          placeQuickEvent(cell, "Villager", [
            mkPage({ charset: w.charset, trigger: "action", moveType: w.wander ? "random" : "fixed" },
              [{ t: "text", name: w.name, face: w.charset, text: w.text }]),
          ]);
        } },
        { label: "Cancel" },
      ],
      dialogKeys: true,
    });
  }
  export function quickShopkeeper(cell: any) {
    if (eventAt(cell.x, cell.y)) { flashStatus("That cell already has an event"); return; }
    const w = { charset: "merchant", greeting: "Welcome! Take a look." };
    const goods: any[] = [];
    // Same goods list the Open Shop command form uses: rows with a ✕, plus a
    // kind/entry picker and "+ add" at the bottom.
    const list = h("div", { class: "minilist" });
    function redrawGoods() {
      list.innerHTML = "";
      goods.forEach((gd: any, i: any) => {
        const arr = gd.kind === "weapon" ? S.proj.weapons : gd.kind === "armor" ? S.proj.armors : S.proj.items;
        const e = RA.byId(arr, gd.id);
        list.appendChild(h("div", { class: "minirow" },
          h("span", null, gd.kind + ": " + (e ? e.name : "?")),
          h("button", { class: "mini", onclick() { goods.splice(i, 1); redrawGoods(); } }, "✕")));
      });
      const pick = { kind: "item", id: S.proj.items.length ? S.proj.items[0].id : 0 };
      const entry = h("span");
      function redrawEntry() {
        const arr = pick.kind === "weapon" ? S.proj.weapons : pick.kind === "armor" ? S.proj.armors : S.proj.items;
        pick.id = arr.length ? arr[0].id : 0;
        entry.innerHTML = "";
        entry.appendChild(sel(pick, "id", dbOpts(arr)));
      }
      redrawEntry();
      list.appendChild(h("div", { class: "minirow" },
        sel(pick, "kind", [{ v: "item", l: "Item" }, { v: "weapon", l: "Weapon" }, { v: "armor", l: "Armor" }], redrawEntry),
        entry,
        h("button", { class: "mini", onclick() { if (pick.id) { goods.push({ kind: pick.kind, id: pick.id }); redrawGoods(); } } }, "+ add")));
    }
    redrawGoods();
    const content = h("div", null,
      charsetField(w, "charset", "Looks like"),
      field("Greeting", tIn(w, "greeting")),
      h("div", { class: "fld" }, h("span", null, "Goods for sale"), list));
    modal({
      title: "New Shopkeeper",
      content,
      buttons: [
        { label: "Create", primary: true, onClick(close: any) {
          close();
          const cmds: any[] = [];
          if (w.greeting) cmds.push({ t: "text", name: "", face: w.charset, text: w.greeting });
          cmds.push({ t: "shop", goods });
          placeQuickEvent(cell, "Shopkeeper", [
            mkPage({ charset: w.charset, trigger: "action" }, cmds),
          ]);
        } },
        { label: "Cancel" },
      ],
      dialogKeys: true,
    });
  }
  export function quickInnkeeper(cell: any) {
    if (eventAt(cell.x, cell.y)) { flashStatus("That cell already has an event"); return; }
    const w = { charset: "villager_f", price: 20 };
    const content = h("div", null,
      charsetField(w, "charset", "Looks like"),
      row(field("Price per night (" + S.proj.system.currency + ")", nIn(w, "price", 0, 99999))));
    modal({
      title: "New Innkeeper",
      content,
      buttons: [
        { label: "Create", primary: true, onClick(close: any) {
          close();
          const cur = S.proj.system.currency;
          placeQuickEvent(cell, "Innkeeper", [
            mkPage({ charset: w.charset, trigger: "action" }, [
              { t: "text", name: "", face: w.charset,
                text: "Welcome, traveler! A cozy bed is " + w.price + " " + cur + " a night. Care to rest?" },
              { t: "choices", options: ["Rest (" + w.price + " " + cur + ")", "Not now"], branches: [
                [
                  { t: "if", cond: { kind: "gold", cmp: ">=", val: w.price }, then: [
                    { t: "gold", op: "sub", val: w.price },
                    // lights out: a long black flash reads as falling asleep
                    { t: "flash", color: "#000000", opacity: 1, duration: 90, wait: true },
                    { t: "heal", full: true },
                    { t: "se", name: "heal" },
                    { t: "text", name: "", face: w.charset,
                      text: "Rise and shine! You feel completely refreshed." },
                  ], else: [
                    { t: "text", name: "", face: w.charset,
                      text: "Oh dear — you're a little short on " + cur + ". Come back when you have " + w.price + "." },
                  ] },
                ],
                [
                  { t: "text", name: "", face: w.charset, text: "Safe travels! Come back anytime." },
                ],
              ] },
            ]),
          ]);
        } },
        { label: "Cancel" },
      ],
      dialogKeys: true,
    });
  }

  // ---- more staples (Door / Save Point / Healing Crystal / Monster / Gift / Quest Giver) ----
  // A press-to-open door: like Transfer, but action-triggered with a door sound —
  // the player walks up and presses it rather than stepping straight through.
  export function quickDoor(cell: any) {
    if (eventAt(cell.x, cell.y)) { flashStatus("That cell already has an event"); return; }
    const w = { mapId: S.proj.maps[0] ? S.proj.maps[0].id : 0, x: 0, y: 0, dir: 0 };
    const mapSel = sel(w, "mapId", dbOpts(S.proj.maps));
    const xIn = nIn(w, "x", 0);
    const yIn = nIn(w, "y", 0);
    const content = h("div", null,
      row(field("Leads to — Map", mapSel), field("X", xIn), field("Y", yIn),
        field("Facing", sel(w, "dir", DIR_OPTS))),
      h("button", { class: "mini", onclick() {
        openLocationPicker(w.mapId, w.x, w.y, (res: any) => {
          w.mapId = res.mapId; w.x = res.x; w.y = res.y;
          mapSel.value = String(res.mapId); xIn.value = res.x; yIn.value = res.y;
        });
      } }, "📍 Pick destination on map…"),
      h("div", { class: "dim" },
        "Place it on the doorway tile. The player presses it to open — it plays the door sound, then takes them across."));
    modal({
      title: "New Door",
      content,
      buttons: [
        { label: "Create", primary: true, onClick(close: any) {
          close();
          placeQuickEvent(cell, "Door", [
            mkPage({ charset: "", trigger: "action" }, [
              { t: "se", name: "door" },
              { t: "transfer", mapId: w.mapId, x: w.x, y: w.y, dir: w.dir },
            ]),
          ]);
        } },
        { label: "Cancel" },
      ],
      dialogKeys: true,
    });
  }
  export function quickSavePoint(cell: any) {
    if (eventAt(cell.x, cell.y)) { flashStatus("That cell already has an event"); return; }
    const w = { heal: true };
    const content = h("div", null,
      row(field("Also fully heal the party", chk(w, "heal"))),
      h("div", { class: "dim" },
        "A glowing save point. The player presses it to open the Save screen — and, if you like, wakes up fully restored first."));
    modal({
      title: "New Save Point",
      content,
      buttons: [
        { label: "Create", primary: true, onClick(close: any) {
          close();
          const cmds: any[] = [{ t: "se", name: "save" }];
          if (w.heal) cmds.push({ t: "heal", full: true });
          cmds.push({ t: "save" });
          placeQuickEvent(cell, "Save Point", [
            mkPage({ charset: "savepoint", trigger: "action" }, cmds),
          ]);
        } },
        { label: "Cancel" },
      ],
      dialogKeys: true,
    });
  }
  export function quickHealingCrystal(cell: any) {
    if (eventAt(cell.x, cell.y)) { flashStatus("That cell already has an event"); return; }
    const w = { text: "The crystal's warm light washes over you. You feel completely restored!" };
    const ta = h("textarea", { rows: 3, oninput(e: any) { w.text = e.target.value; } }, w.text);
    const content = h("div", null,
      field("Message when touched", ta),
      h("div", { class: "dim" },
        "A glowing crystal that fully restores the party's HP and MP every time it's touched."));
    modal({
      title: "New Healing Crystal",
      content,
      buttons: [
        { label: "Create", primary: true, onClick(close: any) {
          close();
          placeQuickEvent(cell, "Healing Crystal", [
            mkPage({ charset: "crystal", trigger: "action" }, [
              { t: "se", name: "heal" },
              { t: "heal", full: true },
              { t: "text", name: "", text: w.text },
            ]),
          ]);
        } },
        { label: "Cancel" },
      ],
      dialogKeys: true,
    });
  }
  export function quickMonster(cell: any) {
    if (eventAt(cell.x, cell.y)) { flashStatus("That cell already has an event"); return; }
    const w = { charset: "guard", troopId: S.proj.troops[0] ? S.proj.troops[0].id : 1,
      reward: 0, text: "The way is clear at last." };
    const content = h("div", null,
      charsetField(w, "charset", "Looks like"),
      row(field("Enemy troop", sel(w, "troopId", dbOpts(S.proj.troops))),
        field("Gold reward (0 = none)", nIn(w, "reward", 0, 999999))),
      field("Says after you win", tIn(w, "text")),
      h("div", { class: "dim" },
        "Blocks the way and fights (no escape) when the player steps up to it. Beaten, it hands over the reward and vanishes for good (self-switch A). Lose and it's Game Over."));
    modal({
      title: "New Monster",
      content,
      buttons: [
        { label: "Create", primary: true, onClick(close: any) {
          close();
          const cur = S.proj.system.currency;
          const win: any[] = [];
          if (w.reward > 0) {
            win.push({ t: "gold", op: "add", val: w.reward });
            win.push({ t: "text", name: "", text: "You found " + w.reward + " " + cur + "!" });
          }
          if (w.text) win.push({ t: "text", name: "", text: w.text });
          win.push({ t: "selfsw", key: "A", val: true });
          placeQuickEvent(cell, "Monster", [
            // Page 1 blocks (default priority "same") and fights on action.
            mkPage({ charset: w.charset, trigger: "action" }, [
              { t: "se", name: "encounter" },
              { t: "battle", troopId: w.troopId, escape: false, lose: false },
              ...win,
            ]),
            // Page 2 (after self-switch A): defeated — invisible and walk-through.
            mkPage({ cond: { selfSw: "A" }, charset: "", priority: "below", through: true }, []),
          ]);
        } },
        { label: "Cancel" },
      ],
      dialogKeys: true,
    });
  }
  export function quickGift(cell: any) {
    if (eventAt(cell.x, cell.y)) { flashStatus("That cell already has an event"); return; }
    const w: any = { charset: "villager_m", kind: "item",
      id: S.proj.items[0] ? S.proj.items[0].id : 0, val: 1,
      text: "Here, take this — you've earned it!", after: "Take care out there!" };
    const entryWrap = h("span");
    function redrawEntry() {
      const isGold = w.kind === "gold";
      const arr = w.kind === "weapon" ? S.proj.weapons : w.kind === "armor" ? S.proj.armors : S.proj.items;
      if (!isGold) w.id = arr[0] ? arr[0].id : 0; // keep id valid when kind changes
      entryWrap.innerHTML = "";
      entryWrap.appendChild(isGold ? h("span", null, "—") : sel(w, "id", dbOpts(arr)));
    }
    const content = h("div", null,
      charsetField(w, "charset", "Looks like"),
      row(field("Kind", sel(w, "kind",
          [{ v: "item", l: "Item" }, { v: "weapon", l: "Weapon" }, { v: "armor", l: "Armor" }, { v: "gold", l: "Gold" }],
          redrawEntry)),
        field("Gift", entryWrap),
        field("Amount", nIn(w, "val", 1, 9999))),
      field("What they say when giving it", tIn(w, "text")),
      field("What they say afterward", tIn(w, "after")),
      h("div", { class: "dim" },
        "Gives the gift once, then only repeats the afterward line (self-switch A)."));
    redrawEntry();
    modal({
      title: "New Gift NPC",
      content,
      buttons: [
        { label: "Create", primary: true, onClick(close: any) {
          close();
          const give = w.kind === "gold"
            ? { t: "gold", op: "add", val: w.val }
            : { t: "item", kind: w.kind, id: w.id, op: "add", val: w.val };
          placeQuickEvent(cell, "Gift NPC", [
            mkPage({ charset: w.charset, trigger: "action" }, [
              { t: "text", name: w.name || "", face: w.charset, text: w.text },
              { t: "se", name: "item" },
              give,
              { t: "selfsw", key: "A", val: true },
            ]),
            mkPage({ cond: { selfSw: "A" }, charset: w.charset, trigger: "action" },
              [{ t: "text", name: "", face: w.charset, text: w.after }]),
          ]);
        } },
        { label: "Cancel" },
      ],
      dialogKeys: true,
    });
  }
  export function quickQuestGiver(cell: any) {
    if (eventAt(cell.x, cell.y)) { flashStatus("That cell already has an event"); return; }
    const quests = S.proj.quests || [];
    const w: any = { charset: "elder",
      questId: quests[0] ? quests[0].id : 0,
      text: "Please, I need your help. Will you take on this task?",
      after: "Thank you — I'm counting on you!" };
    const content = h("div", null,
      charsetField(w, "charset", "Looks like"),
      field("Quest to start", sel(w, "questId", dbOpts(quests, "(none)"))),
      field("What they say when giving the quest", tIn(w, "text")),
      field("What they say afterward", tIn(w, "after")),
      h("div", { class: "dim" },
        "Speaks the first line and starts the quest, then only repeats the afterward line (self-switch A). Add quests in Database ▸ Quests first."));
    modal({
      title: "New Quest Giver",
      content,
      buttons: [
        { label: "Create", primary: true, onClick(close: any) {
          close();
          const cmds: any[] = [{ t: "text", name: "", face: w.charset, text: w.text }];
          if (w.questId) cmds.push({ t: "questStart", questId: w.questId });
          cmds.push({ t: "selfsw", key: "A", val: true });
          placeQuickEvent(cell, "Quest Giver", [
            mkPage({ charset: w.charset, trigger: "action" }, cmds),
            mkPage({ cond: { selfSw: "A" }, charset: w.charset, trigger: "action" },
              [{ t: "text", name: "", face: w.charset, text: w.after }]),
          ]);
        } },
        { label: "Cancel" },
      ],
      dialogKeys: true,
    });
  }
  export function quickLockedDoor(cell: any) {
    if (eventAt(cell.x, cell.y)) { flashStatus("That cell already has an event"); return; }
    const w = { keyId: S.proj.items[0] ? S.proj.items[0].id : 0, consume: false,
      mapId: S.proj.maps[0] ? S.proj.maps[0].id : 0, x: 0, y: 0, dir: 0 };
    const mapSel = sel(w, "mapId", dbOpts(S.proj.maps));
    const xIn = nIn(w, "x", 0);
    const yIn = nIn(w, "y", 0);
    const content = h("div", null,
      row(field("Key item", sel(w, "keyId", dbOpts(S.proj.items))),
        field("Key is used up", chk(w, "consume"))),
      row(field("Leads to — Map", mapSel), field("X", xIn), field("Y", yIn),
        field("Facing", sel(w, "dir", DIR_OPTS))),
      h("button", { class: "mini", onclick() {
        openLocationPicker(w.mapId, w.x, w.y, (res: any) => {
          w.mapId = res.mapId; w.x = res.x; w.y = res.y;
          mapSel.value = String(res.mapId); xIn.value = res.x; yIn.value = res.y;
        });
      } }, "📍 Pick destination on map…"),
      h("div", { class: "dim" },
        "Place it on the doorway tile: it blocks the way and says it's locked until the player has the key — after that it works like a normal door."));
    modal({
      title: "New Locked Door",
      content,
      buttons: [
        { label: "Create", primary: true, onClick(close: any) {
          close();
          const key = RA.byId(S.proj.items, w.keyId);
          const keyName = key ? key.name : "key";
          const unlock: any[] = [{ t: "se", name: "door" }];
          if (w.consume) unlock.push({ t: "item", kind: "item", id: w.keyId, op: "sub", val: 1 });
          unlock.push({ t: "text", name: "", text: "You unlock the door with the " + keyName + "!" });
          unlock.push({ t: "selfsw", key: "A", val: true });
          placeQuickEvent(cell, "Locked Door", [
            // Page 1 blocks (default priority "same") until the key turns.
            mkPage({ charset: "", trigger: "action" }, [
              { t: "if", cond: { kind: "item", itemKind: "item", id: w.keyId }, then: unlock, else: [
                { t: "se", name: "buzzer" },
                { t: "text", name: "", text: "It's locked. You need the " + keyName + "." },
              ] },
            ]),
            // Page 2 (after self-switch A): an ordinary walk-through door.
            mkPage({ cond: { selfSw: "A" }, charset: "", trigger: "touch", priority: "below", through: true },
              [{ t: "transfer", mapId: w.mapId, x: w.x, y: w.y, dir: w.dir }]),
          ]);
        } },
        { label: "Cancel" },
      ],
      dialogKeys: true,
    });
  }
