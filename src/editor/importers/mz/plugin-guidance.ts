/* RPGAtlas — src/editor/importers/mz/plugin-guidance.ts
   Project Compass M5·A: the plugin guidance table — the maintainable DATA (not
   prose in code, per roadmap M5·A) that turns a `js/plugins.js` add-on list into
   honest, kid-friendly guidance. RPG Maker JS plugins CANNOT auto-convert
   (phase M5 intro), so what we owe the user is clarity: name every add-on, keep
   its settings, and say whether Atlas already does that (`builtin`), does
   something close (`partial`), doesn't do it (`none` — the game still plays), or
   whether we simply don't recognize it (`unknown` — settings kept, won't run).
   No plugin code is ever executed (locked decision 5, matrix §14) — the manifest
   is read as text upstream in intake.ts (`parsePluginsJs`), never `eval`'d.

   To add a plugin family: append a row to GUIDANCE with tolerant `match`
   patterns (they run against a normalized name that strips author prefixes like
   `YEP_` / `VisuMZ_1_` / `MOG_`). First matching row wins; unmatched → `unknown`.
   Pure — no DOM. Copyright (C) 2026 RPGAtlas contributors — GPL-3.0-or-later. */

import type { ImportReportPlugin } from "../../../shared/schema";
import type { RmPlugin } from "./raw-types";
import type { ConvertedRmPlugin } from "./plugin-converter";

/** How well Atlas covers what a plugin did. `builtin` = Atlas already has this ·
 *  `partial` = Atlas has something close · `none` = Atlas doesn't do this (the
 *  game still plays without it) · `unknown` = we don't recognize the add-on
 *  (its settings are kept, but it won't run). */
export type PluginVerdict = "builtin" | "partial" | "none" | "unknown";

/** One row of the guidance table: tolerant name matchers → a verdict + one
 *  kid-friendly sentence + an optional pointer to where to look in Atlas. */
export interface PluginGuide {
  /** Regexes tested (first-wins) against the NORMALIZED plugin name. */
  match: RegExp[];
  verdict: PluginVerdict;
  /** Plain-words explanation: what the add-on did → what Atlas offers. */
  advice: string;
  /** Where to look in Atlas ("Quests panel", "Database ▸ Types"), if any. */
  pointer?: string;
}

/** Normalize a plugin name for matching: split CamelCase into words, lower-case,
 *  strip a leading author prefix (+ VisuStella's numeric tier), collapse
 *  separators. "YEP_QuestJournal" / "VisuMZ_2_QuestSystem" → "quest journal" /
 *  "quest system"; "OrangeMovementEx" → "movement ex". */
export function normalizePluginName(name: string): string {
  let s = String(name || "").trim();
  // Strip a leading author prefix (+ VisuStella's "_<tier>_" number) FIRST, on
  // the raw name — before CamelCase splitting would break "VisuMZ" into
  // "Visu MZ" and stop the prefix from matching.
  s = s.replace(
    /^(yep|visumz|visustella|mog|moghunter|galv|orange|srd|sumrndmdde|tddp|dsi|hime|olivia|victor|iavra|gubid|drx?|frog)[_\s-]+(\d+[_\s-]+)?/i,
    "",
  );
  // A leftover leading numeric tier ("2_QuestSystem").
  s = s.replace(/^\d+[_\s-]+/, "");
  // CamelCase → spaced words, then lower-case.
  s = s.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  s = s.toLowerCase();
  // Separators → single spaces.
  s = s.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  // Hudell's "Orange" vendor joins CamelCase-style with no separator
  // (OrangeMovementEx → "orange movement ex"); drop the leading vendor word.
  s = s.replace(/^orange\s+/, "");
  return s;
}

/** The guidance table — top community add-on families (MV YEP / MZ VisuStella +
 *  common others). ORDER MATTERS: more specific rows sit above broader ones (e.g.
 *  "events move core" before generic "movement"). Data, not code (roadmap M5·A).
 *  Copy follows D11: name the thing, one honest sentence, always a next step or a
 *  reassurance; never a scary "UNSUPPORTED". */
export const GUIDANCE: PluginGuide[] = [
  {
    match: [/quest/],
    verdict: "builtin",
    advice: "This add-on gave your game a quest journal. Atlas has one built right in.",
    pointer: "Quests panel",
  },
  {
    match: [/events? move/],
    verdict: "partial",
    advice: "This add-on added fancy event movement. Atlas has move routes for events, though not every trick this one did.",
    pointer: "an event's Set Movement Route command",
  },
  {
    match: [/movement/, /diagonal/, /pixel move/, /\b8 ?dir/, /eight ?dir/, /q ?movement/, /altimit/],
    verdict: "none",
    advice: "This add-on let heroes walk pixel-by-pixel or diagonally. Atlas moves tile-by-tile — the game still plays, it just walks on the grid.",
  },
  {
    match: [/message/, /text ?code/, /name ?box/, /extended message/],
    verdict: "partial",
    advice: "This add-on powered fancy message boxes. Atlas has text codes (color, icons, variables) and a speaker name box already.",
    pointer: "Show Text ▸ the text-code help",
  },
  {
    match: [/battle ?(engine|core|system|ai|manager)/, /\batb\b/, /\bctb\b/, /\botb\b/, /\bftb\b/, /action ?sequence/, /side ?view battle/],
    verdict: "partial",
    advice: "This add-on changed how battles run. Atlas has its own battle systems (turn-based, ATB, and CTB) you can pick in the Database.",
    pointer: "Database ▸ System ▸ Battle System",
  },
  {
    match: [/items? ?equips/, /item ?core/, /equip ?core/, /shop/],
    verdict: "partial",
    advice: "This add-on reworked items, equipment, or the shop. Atlas has items, weapons, armor, and a Shop Processing command already.",
    pointer: "Database ▸ Items / Weapons / Armor",
  },
  {
    match: [/skills? ?states/, /buffs? ?states/, /states? ?core/, /skill ?core/],
    verdict: "partial",
    advice: "This add-on added skill and status-effect options. Atlas has skills, states, and traits — more of them arrive as the importer grows.",
    pointer: "Database ▸ Skills / States",
  },
  {
    match: [/param(eter)? ?formula/, /extra ?param/, /class ?(change|system)/, /\bcnt\b/],
    verdict: "partial",
    advice: "This add-on tuned stats or class changing. Atlas has class stats and traits, and a Change Class command.",
    pointer: "Database ▸ Classes",
  },
  {
    match: [/save ?(core|engine|system)/],
    verdict: "partial",
    advice: "This add-on customized saving. Atlas saves its own way — the player can save from the menu.",
    pointer: "the in-game menu ▸ Save",
  },
  {
    match: [/menu/],
    verdict: "partial",
    advice: "This add-on restyled the menus. Atlas has its own menu that's always available.",
  },
  {
    match: [/encounter/, /region ?(restrict|encounter)/],
    verdict: "partial",
    advice: "This add-on controlled random battles by region. Atlas can roll encounters inside painted regions too.",
    pointer: "Map Properties ▸ Encounters",
  },
  {
    match: [/weather/],
    verdict: "partial",
    advice: "This add-on made weather. Atlas has rain, storm, snow, and fog with the Set Weather command.",
    pointer: "the Set Weather Effect command",
  },
  {
    match: [/self ?(switch|var)/],
    verdict: "none",
    advice: "This add-on gave events extra private memory. Atlas events already have their own A–D self-switches for most of that.",
    pointer: "the Control Self Switch command",
  },
  {
    match: [/light(ing|s)?\b/, /terrax/, /khas/, /\bglow\b/],
    verdict: "none",
    advice: "This add-on drew glowing lights and shadows. Atlas doesn't do dynamic lighting yet — the game plays fine, just evenly lit.",
  },
  {
    match: [/\bhud\b/, /map ?status/, /gauge/, /\bhp ?bar/, /party ?bar/],
    verdict: "none",
    advice: "This add-on drew extra bars and info on the screen. Atlas draws its own game info — the game still works without it.",
  },
  {
    match: [/day ?night/, /daynight/, /time ?system/, /\bclock\b/],
    verdict: "none",
    advice: "This add-on tracked a day/night clock. Atlas has no clock, but you can build one with switches and variables.",
  },
  {
    match: [/fast ?travel/, /world ?map/, /region ?map/, /travel ?menu/],
    verdict: "none",
    advice: "This add-on gave a travel map. Atlas doesn't have one built in — a little menu of Transfer choices does the same job.",
    pointer: "the Show Choices + Transfer Player commands",
  },
  {
    match: [/achievement/],
    verdict: "none",
    advice: "This add-on tracked achievements. Atlas doesn't have achievements — you can fake them with switches and a quest.",
  },
  {
    match: [/gab ?window/, /notification/, /toast/, /popup ?window/],
    verdict: "none",
    advice: "This add-on popped little notices on screen. The closest thing in Atlas is a quick Show Text message.",
    pointer: "the Show Text command",
  },
  {
    match: [/core ?engine/, /community ?basic/, /\bmz3d\b/, /base ?core/, /\bmvcommons\b/, /\butils?\b/],
    verdict: "partial",
    advice: "This add-on was a core/base tweak (like screen size). Atlas brought your screen size across and runs on its own engine, so the rest isn't needed.",
  },
];

/** Guidance for a single plugin name. First matching GUIDANCE row wins; an
 *  unrecognized add-on gets the honest `unknown` fallback (settings kept, but it
 *  won't run — the game still plays). Matches against the normalized name and the
 *  raw lower-cased name so odd formats still land. */
export function guidePlugin(name: string): { verdict: PluginVerdict; advice: string; pointer?: string } {
  const norm = normalizePluginName(name);
  const raw = String(name || "").toLowerCase();
  for (const g of GUIDANCE) {
    if (g.match.some((re) => re.test(norm) || re.test(raw))) {
      return g.pointer ? { verdict: g.verdict, advice: g.advice, pointer: g.pointer } : { verdict: g.verdict, advice: g.advice };
    }
  }
  return {
    verdict: "unknown",
    advice: "We don't know this add-on, so we kept its settings but it won't run in Atlas. Try your game — if something's missing, it's probably this.",
  };
}

/** Turn a parsed `js/plugins.js` list into the report's plugin section. Empty in,
 *  empty out (a project with no plugins shows no add-ons section). `converted`
 *  (the plugin converter's output, when it ran) adds each add-on's author
 *  credit + the "now in your Plugin Manager" flag to its card. */
export function buildPluginReport(
  plugins: RmPlugin[] | undefined,
  converted?: ConvertedRmPlugin[],
): ImportReportPlugin[] {
  if (!plugins || !plugins.length) return [];
  const convByName = new Map<string, ConvertedRmPlugin>();
  for (const c of converted || []) convByName.set(String(c.entry.name || ""), c);
  return plugins.map((pl) => {
    const g = guidePlugin(pl.name);
    const paramCount = pl.parameters ? Object.keys(pl.parameters).length : 0;
    const name = String(pl.name || "").trim() || "(unnamed add-on)";
    const conv = convByName.get(name);
    return {
      name,
      on: !!pl.status,
      paramCount,
      verdict: g.verdict,
      advice: g.advice,
      ...(g.pointer ? { pointer: g.pointer } : {}),
      ...(conv ? { converted: true } : {}),
      ...(conv && conv.author ? { author: conv.author } : {}),
    };
  });
}
