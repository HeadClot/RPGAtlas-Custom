/* RPGAtlas — src/editor/importers/mz/convert-map-events.ts
   Project Compass M1·C: RPG Maker map `events[]` → Atlas `MapEvent[]` (matrix
   §2 `events[].pages[]`). Each RM event page carries its appearance conditions,
   graphic, movement/trigger/priority/through flags, and a command list; this
   module maps those to an Atlas `EventPage` and runs the command list through
   the M1·C translator (`translate-commands.ts`, the spine). The M1·B map
   converter left `GameMap.events = []` behind the same injected-translator seam
   M1·A used for CommonEvent/Troop command bodies; M1·C fills it. Pure — no DOM.
   Copyright (C) 2026 RPGAtlas contributors — GPL-3.0-or-later (see LICENSE). */

import type { Dir, EventPage, EventPageCondition, MapEvent } from "../../../shared/schema";
import type { CommandTranslator } from "./convert-events";
import type { ImportReport } from "./report";
import type { RmEvent, RmEventPage, RmList } from "./raw-types";
import { slugKey } from "./slug";

const notNull = <T>(x: T | null): x is T => x != null;

/** RM facing (2 down · 4 left · 6 right · 8 up) → Atlas Dir (0 d/1 l/2 r/3 u). */
const RM_DIR: Record<number, Dir> = { 2: 0, 4: 1, 6: 2, 8: 3 };
/** RM trigger (0 action · 1/2 touch · 3 autorun · 4 parallel) → Atlas trigger. */
const TRIGGER: Record<number, EventPage["trigger"]> = { 0: "action", 1: "touch", 2: "touch", 3: "auto", 4: "parallel" };
/** RM priorityType (0 below · 1 same · 2 above) → Atlas priority. */
const PRIORITY: Record<number, EventPage["priority"]> = { 0: "below", 1: "same", 2: "above" };

/** Charset key synthesis, matching M1·A actors (A7): slug(name) + index suffix. */
function charsetKey(name: string | undefined, index: number | undefined): string {
  const s = slugKey(name || "");
  return s ? s + (index ? "-" + index : "") : "";
}

/** RM page conditions → Atlas `EventPageCondition` (matrix §2). */
function convertCond(page: RmEventPage, eventName: string, report: ImportReport): EventPageCondition | undefined {
  const rc = page.conditions;
  if (!rc) return undefined;
  const cond: EventPageCondition = {};
  let has = false;
  if (rc.switch1Valid) { cond.switchId = rc.switch1Id || 0; has = true; }
  if (rc.switch2Valid) {
    if (rc.switch1Valid) {
      report.bump("page-two-switch", () => ({
        area: "Events", kind: "partial", what: "two-switch page checks",
        detail: "Atlas checks one switch per page; a page needing two only keeps the first",
      }));
    } else { cond.switchId = rc.switch2Id || 0; has = true; }
  }
  if (rc.variableValid) { cond.varId = rc.variableId || 0; cond.varVal = rc.variableValue || 0; has = true; }
  if (rc.selfSwitchValid) { cond.selfSw = rc.selfSwitchCh || "A"; has = true; }
  if (rc.itemValid || rc.actorValid) {
    report.bump("page-cond-todo", () => ({
      area: "Events", kind: "todo", what: "item/hero page checks",
      detail: "pages that appear only when you hold an item or a hero is present arrive in a later update (M2·C)",
    }));
  }
  return has ? cond : undefined;
}

/** One RM page → Atlas `EventPage`. */
function convertPage(page: RmEventPage, eventName: string, translate: CommandTranslator, report: ImportReport): EventPage {
  const out: EventPage = { commands: translate(page.list || []) };

  // Always emit a `cond` object — the engine's page-selection (map-runtime.ts
  // pageActive) reads `page.cond.*` unguarded, and editor-authored pages always
  // carry one (data.js newPage()); an imported page must match that invariant or
  // map load throws on an event with no conditions.
  out.cond = convertCond(page, eventName, report) || {};

  const img = page.image;
  if (img) {
    if (img.tileId) {
      report.bump("page-tile-image", () => ({
        area: "Events", kind: "partial", what: "tile-picture events",
        detail: "events drawn with a map tile show up blank until you give them a character sprite",
      }));
    } else {
      const cs = charsetKey(img.characterName, img.characterIndex);
      if (cs) out.charset = cs;
    }
    if (img.direction != null && RM_DIR[img.direction] != null) out.dir = RM_DIR[img.direction];
  }

  // moveType: 0 fixed · 1 random · 2 approach · 3 custom (matrix §2).
  const mt = page.moveType || 0;
  out.moveType = mt === 1 ? "random" : "fixed";
  if (mt === 2) {
    out.moveType = "random";
    report.bump("page-move-approach", () => ({
      area: "Events", kind: "partial", what: "'approach the player' movement",
      detail: "events that chase the player wander randomly for now",
    }));
  } else if (mt === 3) {
    report.bump("page-move-custom", () => ({
      area: "Events", kind: "partial", what: "custom event movement paths",
      detail: "hand-drawn event movement paths aren't imported yet; the event stays put",
    }));
  }

  out.trigger = TRIGGER[page.trigger || 0] || "action";
  out.priority = PRIORITY[page.priorityType ?? 1] || "same";
  if (page.through) out.through = true;

  return out;
}

/** Convert one RM map's `events[]` (1-based, leading null) into Atlas events. */
export function convertMapEvents(
  events: RmList<RmEvent> | undefined,
  translate: CommandTranslator,
  report: ImportReport,
): MapEvent[] {
  const out: MapEvent[] = [];
  for (const e of (events || []).filter(notNull)) {
    const pages = (e.pages || []).map((pg) => convertPage(pg, e.name || "Event " + e.id, translate, report));
    out.push({
      id: e.id,
      name: e.name || "Event " + e.id,
      x: e.x || 0,
      y: e.y || 0,
      pages: pages.length ? pages : [{ commands: [], cond: {} }],
    });
  }
  return out;
}
