/* RPGAtlas — src/editor/importers/mz/plugin-converter.ts
   The RPG Maker → Atlas plugin converter. RM add-ons are JavaScript, but they
   talk to RPG Maker's insides (Game_Actor, Scene_Map, Window_Base…) which Atlas
   doesn't have — so a converted add-on is an honest Atlas plugin SHELL: the
   original name, author credit, description, url, help, every setting from
   js/plugins.js, and the original source carried along as inert reference data
   (a string constant — NEVER executed; locked decision 5 still holds). The
   generated code only publishes that bundle at `atlas.rm.plugins[name]` so
   Atlas plugins (or a human porting the add-on) can read it.

   Credits are sacred here: the author parsed from the plugin's own `@author`
   tag lands in the Plugin Manager's Author field, the generated header, and
   the import report — converting never removes a name from someone's work.

   Pure — no DOM, no engine imports — so vitest (env=node) covers it directly.
   Copyright (C) 2026 RPGAtlas contributors — GPL-3.0-or-later (see LICENSE). */

import type { PluginEntry } from "../../../shared/schema";
import type { RmPlugin } from "./raw-types";

// ---------------------------------------------------------------------------
// Annotation-block parsing (the "/*:" metadata comment RM plugins carry)
// ---------------------------------------------------------------------------

/** One `@param` from the annotation block (settings the author exposed). */
export interface RmPluginParamMeta {
  name: string;
  text?: string;
  desc?: string;
  type?: string;
  default?: string;
}

/** One `@command` (MZ plugin command) with its `@arg` names. */
export interface RmPluginCommandMeta {
  name: string;
  text?: string;
  desc?: string;
  args: string[];
}

/** Everything worth keeping from a plugin's annotation block. */
export interface RmPluginMeta {
  /** `@plugindesc` — the author's one-line description. */
  desc?: string;
  /** `@author` — whose work this is. Kept everywhere. */
  author?: string;
  /** `@url` — where the original lives. */
  url?: string;
  /** `@target` — "MZ" / "MV" as declared. */
  target?: string;
  /** A version sniffed from the desc/help ("v1.02", "Version 1.2"). */
  version?: string;
  /** The `@help` text (what the author told their users). */
  help?: string;
  params: RmPluginParamMeta[];
  commands: RmPluginCommandMeta[];
}

/** Pull the DEFAULT-locale annotation block out of a plugin source: the first
 *  `/*:` block with no locale suffix (RM marks translations `/*:ja` etc.),
 *  falling back to the first annotation block of any locale. Text only. */
function annotationBlock(source: string): string | null {
  const re = /\/\*:([a-z-]*)\s([\s\S]*?)\*\//gi;
  let fallback: string | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    if (!m[1]) return m[2];
    if (fallback == null) fallback = m[2];
  }
  return fallback;
}

/** Parse an RM plugin source's annotation block into `RmPluginMeta`. Never
 *  executes anything — it's a line scanner over a comment. Missing block →
 *  empty meta (old MV plugins without annotations still convert). */
export function parseRmPluginMeta(source: string | null | undefined): RmPluginMeta {
  const meta: RmPluginMeta = { params: [], commands: [] };
  const block = source ? annotationBlock(String(source)) : null;
  if (!block) return meta;

  // Strip leading comment decoration (` * `) some authors use inside the block.
  const lines = block.split(/\r?\n/).map((l) => l.replace(/^\s*\*? ?/, ""));

  let curParam: RmPluginParamMeta | null = null;
  let curCommand: RmPluginCommandMeta | null = null;
  let curArg = false;
  let helpLines: string[] | null = null;

  const attach = (key: "text" | "desc" | "type" | "default", val: string): void => {
    // `@text/@desc/…` describe whichever @param / @command / @arg came last.
    if (curArg && curCommand && key === "text") return; // arg labels: name is enough
    if (curParam && !curCommand) curParam[key] = val;
    else if (curCommand && !curArg && key !== "type" && key !== "default") curCommand[key] = val;
  };

  for (const line of lines) {
    const tag = /^@(\w+)\s*(.*)$/.exec(line.trim());
    if (!tag) {
      if (helpLines) helpLines.push(line);
      continue;
    }
    const [, name, rest] = tag;
    if (helpLines && name !== "help") {
      meta.help = helpLines.join("\n").trim();
      helpLines = null;
    }
    switch (name.toLowerCase()) {
      case "plugindesc": meta.desc = rest.trim(); break;
      case "author": meta.author = rest.trim(); break;
      case "url": meta.url = rest.trim(); break;
      case "target": meta.target = rest.trim(); break;
      case "help": helpLines = rest.trim() ? [rest.trim()] : []; break;
      case "param":
        curParam = { name: rest.trim() };
        curCommand = null; curArg = false;
        if (curParam.name) meta.params.push(curParam);
        break;
      case "command":
        curCommand = { name: rest.trim(), args: [] };
        curParam = null; curArg = false;
        if (curCommand.name) meta.commands.push(curCommand);
        break;
      case "arg":
        curArg = true;
        if (curCommand && rest.trim()) curCommand.args.push(rest.trim());
        break;
      case "text": attach("text", rest.trim()); break;
      case "desc": attach("desc", rest.trim()); break;
      case "type": attach("type", rest.trim()); break;
      case "default": attach("default", rest.trim()); break;
      default: break; // @base/@orderAfter/@min/… — not needed for the shell
    }
  }
  if (helpLines) meta.help = helpLines.join("\n").trim();

  // Version: authors put it in the desc or help ("v1.02", "Version 1.2.3").
  const vsrc = (meta.desc || "") + "\n" + (meta.help || "").slice(0, 400);
  const v = /\b[vV](?:er(?:sion)?)?\.?\s*(\d+\.\d+(?:\.\d+)?)/.exec(vsrc);
  if (v) meta.version = v[1];
  return meta;
}

// ---------------------------------------------------------------------------
// Source analysis (what RM internals does the code touch?)
// ---------------------------------------------------------------------------

/** Scan a plugin's code for the RPG Maker runtime pieces it talks to — the
 *  honest list of what an Atlas rewrite would have to replace. Text-only. */
export function analyzeRmPluginSource(source: string | null | undefined): string[] {
  if (!source) return [];
  const found = new Set<string>();
  // No leading \b on the $-globals — a word boundary never sits before "$".
  const re = /(?:\b(?:(?:Game|Scene|Window|Sprite|Spriteset)_[A-Za-z]\w*|(?:Scene|Data|Battle|Image|Audio|Plugin|Config|Storage|Input|Touch)Manager)|\$(?:game|data)\w+)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) && found.size < 24) found.add(m[0]);
  return [...found].sort();
}

// ---------------------------------------------------------------------------
// The converter
// ---------------------------------------------------------------------------

/** Original sources bigger than this aren't embedded in the project (they'd
 *  bloat saves) — the shell says so and points back at the RM folder. */
export const MAX_EMBED_SOURCE = 60_000;

/** A converted plugin, plus the report-facing facts about the conversion. */
export interface ConvertedRmPlugin {
  /** Atlas Plugin Manager entry (id 0 — `assembleProject` assigns real ids). */
  entry: PluginEntry & { rmImport: true };
  /** Author credit as parsed (empty string when the plugin never said). */
  author: string;
  /** Whether the original source was found and carried along. */
  hadSource: boolean;
}

const FALLBACK_AUTHOR = "an unnamed RPG Maker plugin author";

/** Kebab a plugin name into a stable Atlas plugin id ("YEP_QuestJournal" →
 *  "rm.yep-quest-journal"). */
function rmPluginId(name: string): string {
  const slug = String(name || "plugin")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return "rm." + (slug || "plugin");
}

/** Comment-safe text (a star-slash inside an author's prose would end our
 *  generated header comment early). */
function commentSafe(s: string): string {
  return String(s || "").replace(/\*\//g, "*\\/");
}

/** Build the generated Atlas plugin code: a credits header + one inert data
 *  publish at `atlas.rm.plugins[name]`. No RM code path ever executes. */
function generateShellCode(name: string, meta: RmPluginMeta, manifest: RmPlugin | undefined, source: string | null, touches: string[]): string {
  const author = meta.author || FALLBACK_AUTHOR;
  const embed = source != null && source.length <= MAX_EMBED_SOURCE;
  const head: string[] = [
    "/* ================================================================",
    " * " + commentSafe(name) + " — converted from RPG Maker by RPGAtlas.",
    " * Original author: " + commentSafe(author) + " — all credit belongs to them.",
  ];
  if (meta.desc || manifest?.description) head.push(" * What it did: " + commentSafe(meta.desc || manifest?.description || ""));
  if (meta.url) head.push(" * Original home: " + commentSafe(meta.url));
  head.push(" * ----------------------------------------------------------------");
  head.push(" * This converted add-on keeps the original settings, credits, and");
  head.push(" * source readable at atlas.rm.plugins[" + JSON.stringify(name) + "].");
  if (touches.length) {
    head.push(" * The original code talks to RPG Maker's insides (" + commentSafe(touches.slice(0, 6).join(", ")) + (touches.length > 6 ? ", …" : "") + "),");
    head.push(" * which Atlas doesn't have — so its behavior needs an Atlas-style");
    head.push(" * rewrite here to come alive. The cheatsheet in Tools ▸ Plugin");
    head.push(" * Manager ▸ + New shows everything the atlas API offers.");
  }
  if (source != null && !embed) {
    head.push(" * (The original file is too big to carry inside the project —");
    head.push(" *  it's still in your RPG Maker folder under js/plugins.)");
  }
  head.push(" * ================================================================ */");

  const record: string[] = [
    "const RM_ORIGINAL_SOURCE = " + (embed ? JSON.stringify(source) : "null") + ";",
    "const rm = (atlas.rm = atlas.rm || { plugins: {} });",
    "rm.plugins[" + JSON.stringify(name) + "] = {",
    "  name: " + JSON.stringify(name) + ",",
    "  author: " + JSON.stringify(author) + ",",
    "  description: " + JSON.stringify(meta.desc || manifest?.description || "") + ",",
    "  url: " + JSON.stringify(meta.url || "") + ",",
    "  // Your settings from js/plugins.js, exactly as they were:",
    "  parameters: " + JSON.stringify(manifest?.parameters || {}) + ",",
    "  commands: " + JSON.stringify(meta.commands.map((c) => c.name)) + ",",
    "  // Reference only — Atlas never runs RPG Maker code:",
    "  original: RM_ORIGINAL_SOURCE,",
    "};",
  ];
  return head.join("\n") + "\n" + record.join("\n") + "\n";
}

/** Convert ONE RM plugin (manifest entry + optional source text) into an Atlas
 *  Plugin Manager entry. Credits, settings, and (size permitting) the original
 *  source all come along; the generated code is inert data publishing only. */
export function convertRmPlugin(manifest: RmPlugin, source?: string | null): ConvertedRmPlugin {
  const name = String(manifest.name || "").trim() || "(unnamed add-on)";
  const meta = parseRmPluginMeta(source);
  const touches = analyzeRmPluginSource(source);
  const author = meta.author || "";
  const desc = meta.desc || manifest.description || "";
  const entry: PluginEntry & { rmImport: true } = {
    id: 0,
    rmImport: true,
    name,
    pluginId: rmPluginId(name),
    version: meta.version || "",
    author: author || FALLBACK_AUTHOR,
    description:
      (desc ? desc + " — " : "") +
      "Converted from RPG Maker. Original work by " + (author || FALLBACK_AUTHOR) + "; the credit stays theirs.",
    dependencies: [],
    // Mirror the RM ON/OFF switch — the shell only publishes data, so running
    // it is always safe, but a turned-off add-on stays turned off.
    on: !!manifest.status,
    params: {
      rm: {
        parameters: manifest.parameters || {},
        commands: meta.commands,
        params: meta.params,
        target: meta.target || "",
        url: meta.url || "",
        touches,
        ...(meta.help && meta.help.length <= 8_000 ? { help: meta.help } : {}),
      },
    },
    code: generateShellCode(name, meta, manifest, source ?? null, touches),
  } as ConvertedRmPlugin["entry"];
  return { entry, author, hadSource: source != null };
}

/** Convert a whole manifest. `sources` maps plugin name → js/plugins/<name>.js
 *  text (absent entries convert from the manifest alone). Order is preserved —
 *  RM load order becomes Atlas run order. */
export function convertRmPlugins(
  plugins: RmPlugin[] | undefined,
  sources?: Record<string, string>,
): ConvertedRmPlugin[] {
  if (!plugins || !plugins.length) return [];
  return plugins.map((pl) => convertRmPlugin(pl, sources ? sources[pl.name] : undefined));
}
