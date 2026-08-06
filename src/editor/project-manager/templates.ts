/* RPGAtlas — src/editor/project-manager/templates.ts
   Template → ready document (Project Harbor, Phase H2·A/B). `project_create` is
   template-agnostic (H1 §3.1): the manager resolves the child's chosen template
   into a complete, blob-free, FORMAT_VERSION-2 project document with the existing
   TS builders and hands the bytes to Rust. This module is only reachable through
   the dynamically-imported manager chunk, so the ~187 KB Atlas Quest sample it
   bundles never loads for the pure browser build.
   docs/harbor-2-spec.md §1.2. GPL-3.0-or-later (see LICENSE). */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { DataDefaults, RA } from "../core/editor-state";
import { validateProject } from "../../shared/schema";
import { FALLBACK_FOLDER_NAME } from "../../shared/project/project-name";
import type { TemplateId } from "../../shared/project/project-templates";
// Vite `?raw` keeps the type `string` (no 15k-line inferred JSON type in tsc) and
// bundles the sample's bytes into this lazy manager chunk. The sample is blob-free.
import atlasQuestRaw from "../../../Atlas_Quest.json?raw";

/** Build the ready project document for `templateId`, titled with the child's
 *  display name. Every path runs the result through `migrateProject` +
 *  `validateProject(…, "load")` so a template can never boot a broken editor —
 *  exactly the load-boundary the browser's stored-project path already passes. */
export function buildTemplateDocument(templateId: TemplateId, displayName: string): any {
  const title = (displayName || "").trim() || FALLBACK_FOLDER_NAME;
  let doc: any;

  if (templateId === "atlas-quest") {
    // The curated example adventure (the bundled sample project).
    doc = JSON.parse(atlasQuestRaw);
  } else if (templateId === "blank") {
    // "A tiny empty world": one fresh grass map, start position centred on it,
    // and the sample's quests dropped so nothing points at maps that aren't here.
    doc = DataDefaults.newProject();
    const map = DataDefaults.newMap(1, "My First Map", 20, 15);
    doc.maps = [map];
    doc.system.startMapId = map.id;
    doc.system.startX = Math.floor(map.width / 2);
    doc.system.startY = Math.floor(map.height / 2);
    doc.quests = [];
  } else if (templateId === "platformer") {
    doc = DataDefaults.newProject();
    const map = DataDefaults.newMap(1, "First Platform", 24, 14);
    doc.maps = [map];
    doc.quests = [];
    doc.system.gameMode = "platformer";
    doc.system.startMapId = map.id;
    doc.system.startX = 2;
    doc.system.startY = 8;
    doc.system.startDir = 2;
    // A minimal playable blockout: floor, two raised platforms, and a goal.
    for (let x = 0; x < map.width; x++) map.platformerCollision[(map.height - 1) * map.width + x] = 1;
    for (let x = 6; x <= 9; x++) map.platformerCollision[9 * map.width + x] = 3;
    for (let x = 13; x <= 17; x++) map.platformerCollision[6 * map.width + x] = 3;
    const checkpoint = DataDefaults.newEvent(2, 5, 12, "Checkpoint");
    checkpoint.pages[0].platformer = { role: "checkpoint", saveOnReach: false };
    checkpoint.pages[0].charset = "";
    map.events.push(checkpoint);
    const hazard = DataDefaults.newEvent(3, 11, 12, "Hazard");
    hazard.pages[0].platformer = { role: "hazard" };
    hazard.pages[0].charset = "";
    map.events.push(hazard);
    const goal = DataDefaults.newEvent(1, 21, 12, "Goal");
    goal.pages[0].platformer = { role: "goal" };
    goal.pages[0].charset = "";
    goal.pages[0].commands = [{ t: "text", name: "", text: "Level complete!" }];
    map.events.push(goal);
  } else {
    // "starter": today's first-run project (DataDefaults), unchanged.
    doc = DataDefaults.newProject();
  }

  // The folder leaf is sanitized separately; the document carries the child's
  // original chosen name as the game's display title.
  doc.system.title = title;
  return validateProject(RA.migrateProject(doc), "load");
}
