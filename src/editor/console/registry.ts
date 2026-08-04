/* RPGAtlas — src/editor/console/registry.ts
   The Console command core: a registry of named commands with machine-readable
   metadata, a quote-aware tokenizer, and an executor that returns structured
   results (blocks for the Console panel to render, plus a JSON-safe `data`
   payload).

   Deliberately DOM-free: console-panel.ts renders results, the command
   modules (commands-*.ts) reach into the editor, and this file only routes
   between them — so the parser/registry is unit-testable (vitest, no browser)
   and the same surface can be driven programmatically. That programmatic
   surface (installConsoleApi → window.AtlasConsole) is the scaffolding for
   future AI integration: an agent can list commands with their arg specs and
   run any line, getting serializable results back.
   Copyright (C) 2026 RPGAtlas contributors — GPL-3.0-or-later (see LICENSE). */
/* eslint-disable @typescript-eslint/no-explicit-any */

export type ConsoleTone = "info" | "ok" | "warn" | "error" | "dim";

/** One renderable chunk of command output. `link` blocks carry a click action
 *  (jump to a map, open a database tab); everything else is plain data. */
export type ConsoleBlock =
  | { kind: "text"; text: string; tone?: ConsoleTone }
  | { kind: "table"; head: string[]; rows: string[][] }
  | { kind: "link"; text: string; run: () => void }
  | { kind: "json"; data: unknown };

export interface ConsoleResult {
  ok: boolean;
  blocks: ConsoleBlock[];
  /** JSON-safe payload for `--json` output and programmatic callers. */
  data?: unknown;
}

export interface ConsoleArgSpec {
  name: string;
  hint: string;
  required?: boolean;
  /** Greedy: swallows every remaining token (search terms, file names). */
  rest?: boolean;
}

export type ConsoleFlags = Record<string, string | true>;

export interface ConsoleCommandDef {
  /** Space-separated names form subcommands ("build web"). */
  name: string;
  group: string;
  summary: string;
  usage: string;
  args?: ConsoleArgSpec[];
  run: (args: string[], flags: ConsoleFlags) => ConsoleResult | Promise<ConsoleResult>;
}

// ---- result helpers (used by every command module) ----
export function text(t: string, tone?: ConsoleTone): ConsoleBlock {
  return tone ? { kind: "text", text: t, tone } : { kind: "text", text: t };
}
export function table(head: string[], rows: string[][]): ConsoleBlock {
  return { kind: "table", head, rows };
}
export function link(t: string, run: () => void): ConsoleBlock {
  return { kind: "link", text: t, run };
}
export function done(blocks: ConsoleBlock[], data?: unknown): ConsoleResult {
  return { ok: true, blocks, data };
}
export function fail(message: string, data?: unknown): ConsoleResult {
  return { ok: false, blocks: [text(message, "error")], data };
}

// ---- registry ----
const commands = new Map<string, ConsoleCommandDef>();

export function registerConsoleCommand(def: ConsoleCommandDef) {
  commands.set(def.name, def);
}

/** Machine-readable command list (the AI/programmatic surface). */
export function listConsoleCommands(): Array<{
  name: string; group: string; summary: string; usage: string; args: ConsoleArgSpec[];
}> {
  return [...commands.values()]
    .map((c) => ({ name: c.name, group: c.group, summary: c.summary, usage: c.usage, args: c.args || [] }))
    .sort((a, b) => (a.group === b.group ? (a.name < b.name ? -1 : 1) : a.group < b.group ? -1 : 1));
}

export function getConsoleCommand(name: string): ConsoleCommandDef | undefined {
  return commands.get(name);
}

// ---- tokenizer ----
/** Split a line into tokens, honoring "double" and 'single' quotes. */
export function tokenize(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quote: string | null = null;
  let has = false;
  for (const ch of line) {
    if (quote) {
      if (ch === quote) quote = null;
      else cur += ch;
      has = true;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      has = true;
    } else if (/\s/.test(ch)) {
      if (has) { out.push(cur); cur = ""; has = false; }
    } else {
      cur += ch;
      has = true;
    }
  }
  if (has) out.push(cur);
  return out;
}

/** Pull `--flag` / `--flag=value` tokens out; returns the rest in order. */
export function extractFlags(tokens: string[]): { rest: string[]; flags: ConsoleFlags } {
  const rest: string[] = [];
  const flags: ConsoleFlags = {};
  for (const tok of tokens) {
    if (tok.startsWith("--") && tok.length > 2) {
      const eq = tok.indexOf("=");
      if (eq > 2) flags[tok.slice(2, eq)] = tok.slice(eq + 1);
      else flags[tok.slice(2)] = true;
    } else rest.push(tok);
  }
  return { rest, flags };
}

/** Longest-prefix command match: "build web foo" resolves the two-word
 *  command "build web" with args ["foo"] before trying one-word "build". */
export function resolveCommand(tokens: string[]): { def: ConsoleCommandDef; args: string[] } | null {
  const maxWords = Math.min(tokens.length, 3);
  for (let n = maxWords; n >= 1; n--) {
    const name = tokens.slice(0, n).join(" ").toLowerCase();
    const def = commands.get(name);
    if (def) return { def, args: tokens.slice(n) };
  }
  return null;
}

// ---- friendly "did you mean" ----
function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
  return dp[a.length][b.length];
}

export function suggestCommand(word: string): string | null {
  const w = word.toLowerCase();
  let best: string | null = null;
  let bd = 3; // only suggest close matches
  for (const name of commands.keys()) {
    const head = name.split(" ")[0];
    if (head.startsWith(w)) return name.split(" ")[0];
    const d = editDistance(w, head);
    if (d < bd) { bd = d; best = head; }
  }
  return best;
}

/** Command-name completions for a partial input line (Tab in the panel). */
export function completeLine(line: string): string[] {
  const lower = line.replace(/^\s+/, "").toLowerCase();
  const out = new Set<string>();
  for (const name of commands.keys()) {
    if (name.startsWith(lower)) out.add(name);
    else if (lower.startsWith(name + " ")) {
      // completed command; nothing further to suggest at the name level
    }
  }
  return [...out].sort();
}

// ---- executor ----
export async function executeConsoleLine(line: string): Promise<ConsoleResult> {
  const { rest, flags } = extractFlags(tokenize(line));
  if (!rest.length) return done([]);
  const hit = resolveCommand(rest);
  if (!hit) {
    const near = suggestCommand(rest[0]);
    return fail(
      "Unknown command: " + rest[0] +
      (near ? ". Did you mean “" + near + "”?" : ". Type “help” to see every command."),
    );
  }
  const required = (hit.def.args || []).filter((a) => a.required);
  if (hit.args.length < required.length) {
    return fail("Missing " + required[hit.args.length].name + ". Usage: " + hit.def.usage);
  }
  let result: ConsoleResult;
  try {
    result = await hit.def.run(hit.args, flags);
  } catch (e: any) {
    return fail("Something went wrong: " + ((e && e.message) || String(e)));
  }
  if (flags.json) {
    return { ok: result.ok, blocks: [{ kind: "json", data: result.data ?? resultText(result) }], data: result.data };
  }
  return result;
}

/** Flatten a result to plain text (programmatic callers, copy-to-clipboard). */
export function resultText(result: ConsoleResult): string {
  const lines: string[] = [];
  for (const b of result.blocks) {
    if (b.kind === "text" || b.kind === "link") lines.push(b.text);
    else if (b.kind === "table") {
      lines.push(b.head.join(" | "));
      for (const r of b.rows) lines.push(r.join(" | "));
    } else if (b.kind === "json") lines.push(JSON.stringify(b.data, null, 2));
  }
  return lines.join("\n");
}

// ---- programmatic / AI surface ----
/** Install window.AtlasConsole — the stable hook a future AI assistant (or a
 *  plugin, or a Playwright test) drives the console through. Results are
 *  serialized: link actions become plain text, blocks stay JSON-safe. */
export function installConsoleApi(target: any) {
  target.AtlasConsole = {
    version: 1,
    list: listConsoleCommands,
    async run(line: string) {
      const r = await executeConsoleLine(String(line));
      return { ok: r.ok, text: resultText(r), data: r.data ?? null };
    },
  };
}
