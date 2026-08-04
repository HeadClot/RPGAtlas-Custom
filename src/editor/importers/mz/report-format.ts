/* RPGAtlas — src/editor/importers/mz/report-format.ts
   Project Compass M6·A: two pure helpers that sit beside the DOM import wizard
   so they stay node/vitest-testable (no `window`, no DOM):

   - `reportDocToText(doc)` renders a saved `ImportReportDoc` as a plain-text
     file a beginner can read, save, or paste into a bug report — the same
     kid-friendly voice as the on-screen report (locked decision 6), minus the
     colors. Wired to the wizard's "Save as Text…" / "Copy" buttons.
   - `reimportDelta(prev, next)` compares the report from a previous import
     against a fresh one so the wizard can celebrate what Atlas has *learned to
     convert* since last time — the point of the re-import flow (roadmap M6·A:
     "project improved since M1? re-run picks up flipped table entries").

   Both are pure string/number work over the schema types, so the same voice is
   shared by the browser and the test. Copyright (C) 2026 RPGAtlas contributors
   — GPL-3.0-or-later (see LICENSE). */

import type {
  ImportReportDoc,
  ImportReportLine,
  ImportReportPlugin,
} from "../../../shared/schema";

// ---------------------------------------------------------------------------
// Shared verdict vocabulary (one source of truth for text + DOM badges)
// ---------------------------------------------------------------------------

/** Verdict → icon + short word. The wizard's colored badge builds on this so
 *  the text export and the on-screen card never drift apart. */
export const PLUGIN_VERDICT_WORD: Record<ImportReportPlugin["verdict"], { icon: string; word: string }> = {
  builtin: { icon: "✅", word: "Atlas already does this" },
  partial: { icon: "🔷", word: "Atlas has something close" },
  none: { icon: "▫️", word: "Atlas doesn't do this — your game still plays" },
  unknown: { icon: "❔", word: "Settings kept, but it won't run" },
};

// ---------------------------------------------------------------------------
// Text export
// ---------------------------------------------------------------------------

const SUMMARY_LABELS: [keyof ImportReportDoc["summary"], string][] = [
  ["maps", "maps"], ["actors", "heroes"], ["skills", "skills"], ["items", "items"],
  ["weapons", "weapons"], ["armors", "armor pieces"], ["enemies", "enemies"],
  ["troops", "battle groups"], ["commonEvents", "common events"],
  ["switches", "switches"], ["variables", "variables"],
];

/** `Date.now()` → a stable YYYY-MM-DD stamp (no locale/timezone surprises in a
 *  saved file or a test). */
function dateStamp(when: number): string {
  return new Date(when).toISOString().slice(0, 10);
}

/** One report line → " • What — detail (seen N times)". */
function lineText(l: ImportReportLine): string {
  const suffix = l.count && l.count > 1 ? ` (seen ${l.count} times)` : "";
  return `  • ${l.what}${l.detail ? " — " + l.detail : ""}${suffix}`;
}

/** Render the plain-text import report — good news first, then the honest
 *  caveats grouped exactly like the on-screen report, then the add-ons and the
 *  "what next". Ends with an RPGAtlas provenance line. */
export function reportDocToText(doc: ImportReportDoc): string {
  const srcName = doc.source === "mz" ? "RPG Maker MZ" : "RPG Maker MV";
  const out: string[] = [];
  out.push(`Your ${srcName} game is in RPGAtlas!`);
  if (doc.gameTitle) out.push(doc.gameTitle);
  out.push("");
  out.push("Here's everything that came along:");
  for (const [key, label] of SUMMARY_LABELS) {
    const n = doc.summary[key];
    if (n > 0) out.push(`  • ${n} ${label}`);
  }

  const byKind = (k: ImportReportLine["kind"]) => doc.lines.filter((l) => l.kind === k);
  const partial = byKind("partial"), todo = byKind("todo"), skipped = byKind("skipped"), notes = byKind("converted");

  out.push("");
  if (!partial.length && !todo.length && !skipped.length) {
    out.push("Everything came across cleanly — nothing was left behind.");
  } else {
    out.push("A few things need a note — nothing was thrown away:");
  }
  const section = (title: string, lines: ImportReportLine[]) => {
    if (!lines.length) return;
    out.push("");
    out.push(title);
    for (const l of lines) out.push(lineText(l));
  };
  section("Came in a little differently:", partial);
  section("Saved for a later update:", todo);
  section("Left out on purpose:", skipped);
  section("Notes:", notes);

  if (doc.plugins && doc.plugins.length) {
    out.push("");
    out.push(`Add-ons (plugins) — ${doc.plugins.length} found:`);
    for (const pl of doc.plugins) {
      const v = PLUGIN_VERDICT_WORD[pl.verdict] || PLUGIN_VERDICT_WORD.unknown;
      const meta: string[] = [];
      if (!pl.on) meta.push("was turned off");
      if (pl.paramCount > 0) meta.push("kept its " + pl.paramCount + " setting" + (pl.paramCount === 1 ? "" : "s"));
      if (pl.converted) meta.push("converted into your Plugin Manager");
      const credit = pl.author ? " (by " + pl.author + ")" : "";
      out.push(`  ${v.icon} ${pl.name}${credit} — ${v.word}${meta.length ? " · " + meta.join(", ") : ""}`);
      out.push(`      ${pl.advice}${pl.pointer ? " Look in " + pl.pointer + "." : ""}`);
    }
  }

  out.push("");
  out.push("What next?");
  out.push("  • Press Playtest (F5) to try your game right away.");
  out.push("  • Your maps kept their shapes, layout, and events. To bring in your own tile");
  out.push("    artwork, use the Asset Browser (Tools ▸ Asset Browser) and Import Autotile Sheet.");
  out.push("  • Re-run File ▸ Import from RPG Maker on the same folder any time — Atlas keeps");
  out.push("    learning to convert more, and a re-import picks up whatever's newly supported.");

  out.push("");
  out.push(`— Import report from RPGAtlas · ${dateStamp(doc.when)}`);
  return out.join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// Re-import delta
// ---------------------------------------------------------------------------

/** How a fresh import compares to the one this project already carried. */
export interface ReimportDelta {
  /** The new import has strictly fewer "saved for later" (todo) notes. */
  improved: boolean;
  /** How many todo notes the previous report had (weighted by aggregate count). */
  prevTodo: number;
  /** How many todo notes the fresh report has. */
  nowTodo: number;
  /** Notes resolved since last time (`max(0, prevTodo - nowTodo)`). */
  resolved: number;
  /** A kid-friendly one-liner to show as a banner, or `null` when there's
   *  nothing worth interrupting the user for. */
  headline: string | null;
}

/** Count "things still waiting", summing each todo line's aggregate `count`
 *  (an aggregated line like "damage formulas — seen 7 times" is 7 things). */
function todoWeight(doc: ImportReportDoc): number {
  let n = 0;
  for (const l of doc.lines) if (l.kind === "todo") n += l.count && l.count > 0 ? l.count : 1;
  return n;
}

/** Compare the report a project already had (`prev`) against a fresh import
 *  (`next`) so the wizard can celebrate what Atlas learned to convert since.
 *  When there's no previous report the delta is neutral (headline `null`). */
export function reimportDelta(prev: ImportReportDoc | undefined, next: ImportReportDoc): ReimportDelta {
  const prevTodo = prev ? todoWeight(prev) : 0;
  const nowTodo = todoWeight(next);
  const resolved = Math.max(0, prevTodo - nowTodo);
  const improved = !!prev && nowTodo < prevTodo;
  let headline: string | null = null;
  if (improved) {
    headline =
      `Good news — ${resolved} thing${resolved === 1 ? "" : "s"} that ${resolved === 1 ? "was" : "were"} ` +
      "waiting for a later update now come across. Re-importing was worth it!";
  } else if (prev && nowTodo === prevTodo && prevTodo > 0) {
    headline = "This import matches your last one — Atlas hasn't learned anything new to convert here yet.";
  }
  return { improved, prevTodo, nowTodo, resolved, headline };
}
