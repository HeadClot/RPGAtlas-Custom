/* RPGAtlas — tests-unit/mz-plugin-converter.test.ts
   The RPG Maker → Atlas plugin converter. An RM add-on becomes an Atlas plugin
   SHELL: author credit, description, url, every js/plugins.js setting, and the
   original source carried as an inert string — never executed (locked decision
   5 still holds). This spec covers the annotation-block parser, the source
   analyzer, credit retention (the whole point — converting must never strip a
   name off someone's work), the generated shell's safety, and the end-to-end
   proof that an import lands converted add-ons in the Plugin Manager with the
   report crediting their authors. GPL-3.0-or-later. */

import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  analyzeRmPluginSource,
  convertRmPlugin,
  convertRmPlugins,
  fsSource,
  MAX_EMBED_SOURCE,
  parseRmPluginMeta,
  reportDocToText,
  runRmImport,
  type FsReadFns,
} from "../src/editor/importers/mz";
import type { PluginEntry, Project } from "../src/shared/schema";

const root = (name: string): string =>
  fileURLToPath(new URL("../tests/fixtures/" + name, import.meta.url));

function walk(dir: string, base: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(abs, base));
    else out.push(relative(base, abs).replace(/\\/g, "/"));
  }
  return out;
}

const nodeFns: FsReadFns = {
  async listFiles(r) { return walk(r, r); },
  async readText(abs) { return readFileSync(abs, "utf8"); },
  async readBytes(abs) { return new Uint8Array(readFileSync(abs)); },
  join: (r, rel) => join(r, rel),
};

const freshBase = (): Project =>
  JSON.parse(readFileSync(fileURLToPath(new URL("../Atlas_Quest.json", import.meta.url)), "utf8")) as Project;

/** A tiny self-made RM-style plugin source (never third-party code). */
const SAMPLE = [
  "/*:",
  " * @target MZ",
  " * @plugindesc v2.3.1 Paints a compass on the map.",
  " * @author Rosa Mapwright",
  " * @url https://example.invalid/compass",
  " *",
  " * @param Needle Color",
  " * @text Needle Color",
  " * @desc System color of the needle.",
  " * @type number",
  " * @default 2",
  " *",
  " * @command spin",
  " * @text Spin the Needle",
  " * @desc Spins the compass needle once.",
  " *",
  " * @arg turns",
  " *",
  " * @help Use the spin command to celebrate.",
  " * Two lines of help.",
  " */",
  "(() => {",
  "  const p = PluginManager.parameters('Compass');",
  "  const _u = Scene_Map.prototype.update;",
  "  Scene_Map.prototype.update = function () { _u.call(this); if ($gameSwitches.value(2)) this._spin = p['Needle Color']; };",
  "})();",
].join("\n");

/** What a generated shell publishes at `atlas.rm.plugins[name]`. */
interface ShellRecord {
  name: string;
  author: string;
  description: string;
  url: string;
  parameters: Record<string, string>;
  commands: string[];
  original: string | null;
}
interface ShellAtlas {
  rm: { plugins: Record<string, ShellRecord> };
}

/** Run a generated shell exactly the way the engine does (new Function with
 *  the atlas surface) and hand back the atlas stub it published onto. */
function runShell(code: string): ShellAtlas {
  const atlas = {} as ShellAtlas;
  new Function("atlas", "game", "dw", code)(atlas, {}, atlas);
  return atlas;
}

/** The converted entry's `params.rm` bundle, typed for assertions. */
const rmParams = (entry: { params?: Record<string, unknown> }): { parameters: Record<string, string> } =>
  (entry.params as { rm: { parameters: Record<string, string> } }).rm;

describe("parseRmPluginMeta — the annotation block", () => {
  const meta = parseRmPluginMeta(SAMPLE);
  it("reads desc, author, url, target", () => {
    expect(meta.desc).toBe("v2.3.1 Paints a compass on the map.");
    expect(meta.author).toBe("Rosa Mapwright");
    expect(meta.url).toBe("https://example.invalid/compass");
    expect(meta.target).toBe("MZ");
  });
  it("sniffs the version from the plugindesc", () => {
    expect(meta.version).toBe("2.3.1");
  });
  it("collects params with text/desc/type/default", () => {
    expect(meta.params).toHaveLength(1);
    expect(meta.params[0]).toEqual({
      name: "Needle Color", text: "Needle Color", desc: "System color of the needle.",
      type: "number", default: "2",
    });
  });
  it("collects MZ commands with their args", () => {
    expect(meta.commands).toHaveLength(1);
    expect(meta.commands[0].name).toBe("spin");
    expect(meta.commands[0].text).toBe("Spin the Needle");
    expect(meta.commands[0].args).toEqual(["turns"]);
  });
  it("keeps the multi-line help text", () => {
    expect(meta.help).toContain("spin command");
    expect(meta.help).toContain("Two lines of help.");
  });
  it("prefers the default-locale block over a translation", () => {
    const two = "/*:ja\n * @plugindesc 翻訳\n * @author 别名\n */\n/*:\n * @plugindesc Real one.\n * @author Real Name\n */";
    const m = parseRmPluginMeta(two);
    expect(m.desc).toBe("Real one.");
    expect(m.author).toBe("Real Name");
  });
  it("falls back to a locale block when no default exists", () => {
    const m = parseRmPluginMeta("/*:ja\n * @author 翻訳者\n */");
    expect(m.author).toBe("翻訳者");
  });
  it("no annotation block → empty meta (old MV plugins still convert)", () => {
    const m = parseRmPluginMeta("// just code\nvar x = 1;");
    expect(m.author).toBeUndefined();
    expect(m.params).toEqual([]);
    expect(m.commands).toEqual([]);
  });
});

describe("analyzeRmPluginSource — what RM insides does it touch?", () => {
  it("finds classes, managers, and $game globals", () => {
    const t = analyzeRmPluginSource(SAMPLE);
    expect(t).toContain("Scene_Map");
    expect(t).toContain("PluginManager");
    expect(t).toContain("$gameSwitches");
  });
  it("empty / missing source → nothing", () => {
    expect(analyzeRmPluginSource("")).toEqual([]);
    expect(analyzeRmPluginSource(undefined)).toEqual([]);
  });
});

describe("convertRmPlugin — credits, settings, and an inert shell", () => {
  const manifest = { name: "Compass", status: true, description: "Compass.", parameters: { "Needle Color": "5" } };
  const conv = convertRmPlugin(manifest, SAMPLE);
  it("keeps the author's credit everywhere", () => {
    expect(conv.author).toBe("Rosa Mapwright");
    expect(conv.entry.author).toBe("Rosa Mapwright");
    expect(conv.entry.description).toContain("Rosa Mapwright");
    expect(conv.entry.code).toContain("Original author: Rosa Mapwright");
  });
  it("builds a stable rm.* plugin id and mirrors the ON/OFF switch", () => {
    expect(conv.entry.pluginId).toBe("rm.compass");
    expect(conv.entry.on).toBe(true);
    expect(conv.entry.rmImport).toBe(true);
    expect(conv.entry.version).toBe("2.3.1");
    expect(convertRmPlugin({ name: "Compass", status: false }, SAMPLE).entry.on).toBe(false);
  });
  it("carries the js/plugins.js settings (not the annotation defaults)", () => {
    expect(rmParams(conv.entry).parameters).toEqual({ "Needle Color": "5" });
  });
  it("the generated shell runs safely and publishes at atlas.rm", () => {
    const atlas = runShell(conv.entry.code!);
    const rec = atlas.rm.plugins.Compass;
    expect(rec.author).toBe("Rosa Mapwright");
    expect(rec.parameters).toEqual({ "Needle Color": "5" });
    expect(rec.commands).toEqual(["spin"]);
    expect(rec.original).toBe(SAMPLE); // reference only — nothing ran it
  });
  it("a manifest-only add-on (no source file) still converts with honest credit", () => {
    const c = convertRmPlugin({ name: "YEP_QuestJournal", status: true, parameters: { "Show Tracker": "true" } });
    expect(c.hadSource).toBe(false);
    expect(c.author).toBe(""); // nothing claimed — report shows no name
    expect(c.entry.author).toMatch(/unnamed RPG Maker plugin author/);
    expect(c.entry.pluginId).toBe("rm.yep-quest-journal");
    const atlas = runShell(c.entry.code!);
    expect(atlas.rm.plugins.YEP_QuestJournal.parameters["Show Tracker"]).toBe("true");
    expect(atlas.rm.plugins.YEP_QuestJournal.original).toBeNull();
  });
  it("a manifest description with a sneaky star-slash can't break the header", () => {
    // An annotation block can never contain */ (it would end the comment for
    // RM too), but the plugins.js manifest description is JSON — anything goes.
    const c = convertRmPlugin({ name: "Evil", status: true, description: "Ends */ comments." });
    const atlas = runShell(c.entry.code!); // would throw on a syntax error
    expect(atlas.rm.plugins.Evil.description).toBe("Ends */ comments."); // intact in DATA
  });
  it("a giant source isn't embedded (saves stay small) but still credits", () => {
    const big = SAMPLE + "\n// pad\n" + "x".repeat(MAX_EMBED_SOURCE);
    const c = convertRmPlugin({ name: "Big", status: true }, big);
    const atlas = runShell(c.entry.code!);
    expect(atlas.rm.plugins.Big.original).toBeNull();
    expect(atlas.rm.plugins.Big.author).toBe("Rosa Mapwright");
    expect(c.entry.code).toContain("too big to carry");
  });
});

describe("convertRmPlugins — a whole manifest, in RM load order", () => {
  it("keeps order and matches sources by name", () => {
    const out = convertRmPlugins(
      [{ name: "B", status: true }, { name: "A", status: false }],
      { A: SAMPLE },
    );
    expect(out.map((c) => c.entry.name)).toEqual(["B", "A"]);
    expect(out[0].hadSource).toBe(false);
    expect(out[1].hadSource).toBe(true);
    expect(out[1].author).toBe("Rosa Mapwright");
  });
  it("empty / missing manifest → nothing", () => {
    expect(convertRmPlugins([])).toEqual([]);
    expect(convertRmPlugins(undefined)).toEqual([]);
  });
});

describe("end-to-end — an import lands converted add-ons in the Plugin Manager", () => {
  it("appends all four fixture add-ons with credits, unique ids, and report cards", async () => {
    const base = freshBase();
    const baseCount = base.plugins.length;
    const outcome = await runRmImport(fsSource(root("mz-project"), nodeFns), base);
    const added = outcome.project.plugins.slice(baseCount) as (PluginEntry & { rmImport?: boolean })[];
    expect(added.map((p) => p.name)).toEqual([
      "CoveText", "YEP_QuestJournal", "CommunityBasic", "OrangeMovementEx",
    ]);
    expect(added.every((p) => p.rmImport)).toBe(true);
    const ids = outcome.project.plugins.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);

    // CoveText has a source file — its author credit came from @author.
    const cove = added[0];
    expect(cove.author).toBe("Cove Harbor");
    expect(cove.code).toContain("Original author: Cove Harbor");
    expect(rmParams(cove).parameters).toEqual({ BannerColor: "3", Speed: "4" });
    expect(cove.on).toBe(true);
    // The shell boots exactly like the engine would boot it — and stays inert.
    const atlas = runShell(cove.code!);
    expect(atlas.rm.plugins.CoveText.commands).toEqual(["showBanner"]);

    // OrangeMovementEx was OFF in RM and stays off.
    expect(added[3].on).toBe(false);

    // The report credits authors and flags the conversion.
    const byName = Object.fromEntries((outcome.report.plugins || []).map((p) => [p.name, p]));
    expect(byName.CoveText.converted).toBe(true);
    expect(byName.CoveText.author).toBe("Cove Harbor");
    expect(byName.OrangeMovementEx.converted).toBe(true);
    expect(byName.OrangeMovementEx.author).toBeUndefined();

    // …and the text export says so, in words.
    const text = reportDocToText(outcome.report);
    expect(text).toContain("(by Cove Harbor)");
    expect(text).toContain("converted into your Plugin Manager");
  });
});
