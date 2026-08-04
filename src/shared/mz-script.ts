/* RPGAtlas — src/shared/mz-script.ts
   Project Compass M5·B: the minimal, READ-ONLY RPG Maker Script-command
   compatibility adapter (mig-0 decision D5, matrix §14). Two jobs, kept in one
   pure module (no engine/DOM imports) so the importer (editor) and the engine
   share exactly one definition of "the supported subset":

     1. analyzeMzScript(code) — the IMPORT-TIME GATE. Answers: is this snippet
        inside the read-only subset Atlas can honestly run? The subset is
        exactly `$gameSwitches.value(n)`, `$gameVariables.value(n)`, and the
        `$gameParty` basics `size()/gold()/members()/hasItem(item)` (D5), read
        only — never a write, never another `$game*`/global. Anything else →
        `{ ok:false }` and the caller emits an `mzTodo` + one honest report line
        (nothing is silently dropped — locked decision 6).

     2. the RUNTIME SHIM — `mzGlobalsFromState(state)` builds the three `$game*`
        objects from a plain game-state shape, and `runMzScript`/`evalMzScript`
        execute a gated snippet under the SAME `new Function` sandbox the Atlas
        `script` command uses (src/engine/interpreter/commands/flow.ts). The
        shim is read-only BY DESIGN — it exposes no setters, so a write can't
        even be spelled (D5: no write surface without a new gate decision).

   Copyright (C) 2026 RPGAtlas contributors — GPL-3.0-or-later. */

/* eslint-disable @typescript-eslint/no-explicit-any */

/** The exact members each supported global may be read through. First-class
 *  read-only surface (D5) — a member not listed here (e.g. `setValue`,
 *  `gainGold`, `gainItem`) is out of scope and sends the whole snippet to the
 *  import report instead of running. */
const ALLOWED_MEMBERS: Record<string, ReadonlySet<string>> = {
  $gameSwitches: new Set(["value"]),
  $gameVariables: new Set(["value"]),
  $gameParty: new Set(["size", "gold", "members", "hasItem"]),
};

/** The full set of identifier tokens a supported snippet may contain: the three
 *  globals, their allowed members, and the handful of JS literals a read
 *  expression needs. A snippet touching anything else (another `$game*`, a bare
 *  variable, a control-flow keyword like `if`/`for`, `Math`, a write method…)
 *  is out of scope — we run only what we can fully vouch for, and list the rest
 *  in the report. */
const ALLOWED_TOKENS: ReadonlySet<string> = new Set([
  "$gameSwitches",
  "$gameVariables",
  "$gameParty",
  "value",
  "size",
  "gold",
  "members",
  "hasItem",
  "true",
  "false",
  "null",
  "undefined",
]);

/** Snippets longer than this are treated as out-of-scope on sight — the
 *  supported subset is short read expressions, not whole programs. */
const MAX_LEN = 1000;

export interface MzScriptVerdict {
  ok: boolean;
  /** Kid-friendly reason a snippet is out of scope (why it lands in the report,
   *  not why it runs). Absent when `ok`. */
  reason?: string;
}

/** Strip string/template literals and comments so their contents never look
 *  like code tokens to the gate (a comment mentioning `$gameActors` shouldn't
 *  reject an otherwise-clean read). */
function stripLiterals(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, " ") // block comments
    .replace(/\/\/[^\n]*/g, " ") // line comments
    .replace(/"(?:[^"\\]|\\.)*"/g, " ") // double-quoted strings
    .replace(/'(?:[^'\\]|\\.)*'/g, " ") // single-quoted strings
    .replace(/`(?:[^`\\]|\\.)*`/g, " "); // template literals
}

/**
 * The import-time gate. Returns `{ ok:true }` only for snippets built entirely
 * from the read-only `$gameSwitches`/`$gameVariables`/`$gameParty` subset (D5);
 * every other snippet returns `{ ok:false, reason }` so the caller can preserve
 * it as an `mzTodo` and add one honest report line.
 */
export function analyzeMzScript(code: string): MzScriptVerdict {
  const raw = String(code == null ? "" : code).trim();
  if (!raw) return { ok: false, reason: "the script is empty" };
  if (raw.length > MAX_LEN) return { ok: false, reason: "the script is too long to read safely" };
  // Template literals are rejected on sight: stripLiterals would blank their
  // contents for the token scan below, but a `${…}` interpolation still
  // EXECUTES at runtime — code we never vouched for. The supported subset is
  // tiny read expressions; backticks have no legitimate place in it.
  if (raw.includes("`")) {
    return { ok: false, reason: "it uses text in backticks, which Atlas can't check safely" };
  }

  const src = stripLiterals(raw);

  // 1. Every identifier token must be one we vouch for.
  const tokens = src.match(/[A-Za-z_$][\w$]*/g) || [];
  let sawGlobal = false;
  for (const tok of tokens) {
    if (ALLOWED_MEMBERS[tok]) sawGlobal = true;
    if (ALLOWED_TOKENS.has(tok)) continue;
    if (tok.startsWith("$")) {
      return { ok: false, reason: "it reads " + tok + ", which Atlas doesn't have yet" };
    }
    return { ok: false, reason: "it uses " + tok + ", which Atlas can't run safely" };
  }
  if (!sawGlobal) return { ok: false, reason: "it isn't a simple game-data read" };

  // 2. Each supported global must be read through an allowed member — this is
  //    what rejects writes (`$gameVariables.setValue(…)`) and bare references
  //    (`$gameSwitches = …`) even though their tokens passed step 1.
  const uses = /(\$game(?:Switches|Variables|Party))\s*\.?\s*([A-Za-z_$][\w$]*)?/g;
  let m: RegExpExecArray | null;
  while ((m = uses.exec(src))) {
    const global = m[1];
    const member = m[2];
    if (!member) return { ok: false, reason: "it changes " + global + " instead of reading it" };
    if (!ALLOWED_MEMBERS[global].has(member)) {
      return { ok: false, reason: "it calls " + global + "." + member + ", which Atlas can't run" };
    }
  }

  return { ok: true };
}

/** The read-only accessors the shim needs, over a plain game-state object
 *  (`G` at runtime, a stub in tests) — never the state object itself, so no
 *  writer is ever reachable. */
export interface MzReadState {
  switches?: Record<string | number, any>;
  vars?: Record<string | number, any>;
  party?: any[];
  gold?: number;
  inv?: { item?: Record<string | number, number>; weapon?: Record<string | number, number>; armor?: Record<string | number, number> };
}

/** The `$game*` globals a gated snippet sees. Read-only: `value`/`size`/`gold`/
 *  `members`/`hasItem` only — the mirror image of what `analyzeMzScript`
 *  admits, so anything the gate let through resolves, and anything it didn't
 *  never got here. */
export interface MzGlobals {
  $gameSwitches: { value(id: any): boolean };
  $gameVariables: { value(id: any): any };
  $gameParty: { size(): number; gold(): number; members(): any[]; hasItem(item: any): boolean };
}

/** Build the three read-only `$game*` objects from a game-state shape. Pure —
 *  it captures the passed accessors, exposes no setters, and mutates nothing. */
export function mzGlobalsFromState(state: MzReadState): MzGlobals {
  const st = state || {};
  const bag = st.inv || {};
  // hasItem takes an item id (number) or an object with an `.id` — MZ's own
  // `$dataItems[n]` form can't reach here (the gate rejects `$dataItems`), so a
  // numeric id is what a gated snippet can actually pass.
  const itemId = (item: any): number => (item && typeof item === "object" ? Number(item.id) : Number(item));
  const owns = (id: number): boolean =>
    ((bag.item && bag.item[id]) || 0) > 0 ||
    ((bag.weapon && bag.weapon[id]) || 0) > 0 ||
    ((bag.armor && bag.armor[id]) || 0) > 0;
  return {
    $gameSwitches: { value: (id: any) => !!(st.switches && st.switches[id]) },
    $gameVariables: { value: (id: any) => (st.vars && st.vars[id]) || 0 },
    $gameParty: {
      size: () => (st.party ? st.party.length : 0),
      gold: () => Number(st.gold) || 0,
      members: () => (st.party ? st.party.map((a: any) => a && a.actorId) : []),
      hasItem: (item: any) => owns(itemId(item)),
    },
  };
}

/** Run a gated Script COMMAND under the same sandbox as the Atlas `script`
 *  command. Read-only snippets have no observable effect (that's the point —
 *  the meaningful case is `evalMzScript` for a Conditional-Branch condition),
 *  but running them keeps a re-imported project from carrying a dead
 *  placeholder. Errors are swallowed like the Atlas `script` command's. */
export function runMzScript(code: string, globals: MzGlobals): void {
  try {
    new Function("$gameSwitches", "$gameVariables", "$gameParty", String(code || ""))(
      globals.$gameSwitches,
      globals.$gameVariables,
      globals.$gameParty,
    );
  } catch (e) {
    console.error("MZ script command error:", e);
  }
}

/** Evaluate a gated Script EXPRESSION (a Conditional-Branch "Script" condition)
 *  to a boolean under the same sandbox. Any error → `false` (a broken condition
 *  reads as "not met", never a crash). */
export function evalMzScript(code: string, globals: MzGlobals): boolean {
  try {
    const fn = new Function(
      "$gameSwitches",
      "$gameVariables",
      "$gameParty",
      "return (" + String(code || "") + ");",
    );
    return !!fn(globals.$gameSwitches, globals.$gameVariables, globals.$gameParty);
  } catch (e) {
    console.error("MZ script condition error:", e);
    return false;
  }
}
