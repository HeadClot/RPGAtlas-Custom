/* RPGAtlas — src/editor/importers/mz/import-run.ts
   Project Compass M1·D: the DOM-free heart of the import wizard. `runRmImport`
   glues the M1·A–C pipeline (intake → sniff → convert database + tilesets + maps
   + events) onto an injected fresh-project base and folds in the saved import
   report; `buildImportReportDoc` turns the converters' structured report lines +
   the assembled project's contents into the reopenable `ImportReportDoc` the
   wizard renders in kid-friendly language (locked decision 6).

   The base project is INJECTED (not `DataDefaults.newProject()`, which lives on
   `window`) so this module stays node/vitest-testable — the wizard passes a real
   fresh project in the browser; the unit test passes the shipped sample. The
   pixel/canvas work and the file-pickers live in ../rm-import-wizard.ts.
   Copyright (C) 2026 RPGAtlas contributors — GPL-3.0-or-later (see LICENSE). */

import type { ImportReportDoc, ImportReportSummary, Project } from "../../../shared/schema";
import { assembleProject, importMzProject, type MzFileSource, type MzProjectResult } from "./index";
import { buildPluginReport } from "./plugin-guidance";

export interface RmImportOutcome {
  /** The assembled Atlas project, with `importReport` already attached. */
  project: Project;
  /** Which RPG Maker format the source was sniffed as. */
  format: "mv" | "mz";
  /** The saved report (same object as `project.importReport`). */
  report: ImportReportDoc;
  /** The full conversion result, for callers that want the raw data (art
   *  slicing, tests). */
  conversion: MzProjectResult;
}

/** One step of the import, reported to `onProgress` so the wizard can show a
 *  live progress note instead of a frozen spinner (M6·A). `step`/`total` drive
 *  a progress bar; `label` is the kid-friendly line to display. */
export interface ImportProgress {
  stage: "reading" | "assembling" | "report" | "done";
  label: string;
  step: number;
  total: number;
}

/** A progress sink. Awaited between stages, so the browser wizard can yield to
 *  paint the update; in Node/tests it's a plain recorder. */
export type ImportProgressFn = (p: ImportProgress) => void | Promise<void>;

const STAGES: { stage: ImportProgress["stage"]; label: string }[] = [
  { stage: "reading", label: "Reading and converting your RPG Maker game…" },
  { stage: "assembling", label: "Building your Atlas project…" },
  { stage: "report", label: "Writing your import report…" },
  { stage: "done", label: "Finishing up…" },
];

/** Count how many real records came in (dense Atlas arrays — no leading null). */
function summarize(project: Project): ImportReportSummary {
  const len = (a: unknown): number => (Array.isArray(a) ? a.length : 0);
  return {
    maps: len(project.maps),
    actors: len(project.actors),
    skills: len(project.skills),
    items: len(project.items),
    weapons: len(project.weapons),
    armors: len(project.armors),
    enemies: len(project.enemies),
    troops: len(project.troops),
    commonEvents: len(project.commonEvents),
    switches: len(project.system?.switches),
    variables: len(project.system?.variables),
  };
}

/** Build the reopenable report document from a conversion + its assembled
 *  project. The converters already wrote each line in the "what it was → what
 *  happened" voice; the summary leads with the good news. */
export function buildImportReportDoc(conv: MzProjectResult, project: Project): ImportReportDoc {
  // M5·A: the add-ons section — parse js/plugins.js into honest guidance (never
  // executed; the manifest was read as text in intake). The plugin converter's
  // output adds author credits + the converted flag. Omitted when empty.
  const plugins = buildPluginReport(conv.raw?.plugins, conv.convertedPlugins);
  return {
    source: conv.format,
    when: Date.now(),
    gameTitle: project.system?.title,
    summary: summarize(project),
    lines: conv.report.lines.map((l) => ({
      area: l.area,
      kind: l.kind,
      what: l.what,
      ...(l.detail != null ? { detail: l.detail } : {}),
      ...(l.count != null ? { count: l.count } : {}),
      ...(l.code != null ? { code: l.code } : {}),
    })),
    ...(plugins.length ? { plugins } : {}),
  };
}

/**
 * Run the full import over a file source and assemble it onto `base` (a fresh
 * `DataDefaults.newProject()`). Returns the ready-to-load project with its
 * import report attached. Pure data — no DOM, no editor state — so the wizard and
 * the unit test share one code path. `onProgress` (M6·A) is awaited between the
 * heavy stages so the wizard can repaint a live progress note; omit it for the
 * silent test path.
 */
export async function runRmImport(
  source: MzFileSource,
  base: Project,
  onProgress?: ImportProgressFn,
): Promise<RmImportOutcome> {
  const total = STAGES.length;
  const tick = async (i: number): Promise<void> => {
    if (onProgress) await onProgress({ ...STAGES[i], step: i + 1, total });
  };
  await tick(0);
  const conversion = await importMzProject(source);
  await tick(1);
  const project = assembleProject(base, conversion);
  await tick(2);
  const report = buildImportReportDoc(conversion, project);
  project.importReport = report;
  await tick(3);
  return { project, format: conversion.format, report, conversion };
}
