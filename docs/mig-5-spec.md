# Phase M5 Spec — Plugins, scripts & the honest no-list ("Project Compass")

**Status:** M5·A ✅ COMPLETE (branch `mig-5a`) · M5·B ✅ COMPLETE (branch
`mig-5b`) — **phase M5 exit, tag `mig-5`**. Phase M5 owns the two things a JS-plugin
game brings that **cannot auto-convert**: the `js/plugins.js` add-on list (M5·A)
and the most common Script-command snippets (M5·B). The promise is **clarity, not
magic** (phase M5 intro): every add-on is named, its settings are kept, and the
report says — in plain words a ten-year-old can read — whether Atlas already does
that, does something close, or doesn't do it at all. Nothing is silently dropped
(locked decision 6); no plugin `.js` is ever executed (locked decision 5, matrix
§14).

**Authored:** 2026-07-05 by Claude Opus 4.8 (High), from the M5 section of
`docs/MZ_MV_MIGRATION_ROADMAP.md`, the mig-0 decision log (D5/D11), matrix §14,
and the M1·D report UI (`rm-import-wizard.ts renderReportDoc`).
**Branch (per step):** `mig-5a`, `mig-5b` — each merges to `main` (locked
decision 2). Phase exit (M5·B) tags `mig-5`.
**Model:** Opus 4.8 (High). Sonnet is banned from RPGAtlas.

## Locked decisions inherited from the roadmap / mig-0

1. Opus 4.8 does the work; Fable gates M0·C and M6·C; **Sonnet banned**.
2. Git ritual after every step: branch `mig-<phase><step>` → tests green → commit
   → push → merge to `main` → push `main` → delete branch. Phase exit tags `mig-N`.
3. Hand-off: each step ends by printing the next step's kick-off prompt verbatim.
4. Format: importer writes FORMAT_VERSION 2; new report fields are **optional
   additive** schema only. No FORMAT_VERSION bump.
5. Legal: plugin `.js` is **never executed** — the manifest is *read as text*
   (`parsePluginsJs` already extracts the `$plugins = [...]` literal via regex,
   never `eval`). matrix §14 + locked decision 5.
6. Audience: the plugin report is for kids / first-time devs — "here's your add-on,
   here's whether Atlas does that, here's the closest thing", never a stack trace,
   never a scary "UNSUPPORTED". Celebrate the built-ins first (D11 copy style).

## M5·A objective (this step)

Parse `js/plugins.js` into a **plugin report section** and attach it to the saved
`ImportReportDoc` so the wizard renders a small **guidance table**: each add-on,
whether it was ON/OFF, how many settings it carried, and a verdict —
**Atlas has this built in** / **Atlas does something close** / **Atlas doesn't do
this** / **we don't recognize this add-on**. The guidance data for the top ~20
community plugins lives in a **maintainable TS table, not prose in code**
(roadmap M5·A) so it can grow without touching the renderer.

### What M5·A does NOT do (guardrails)
- **Never runs plugin code** (D5, §14). The manifest is read; the `.js` body is not.
- **No plugin-command execution.** Event codes 356/357 stay `mzTodo` + a report
  line (already shipped in M1·C via `translate-commands.ts`); M5·A only makes the
  *manifest* legible. The runnable Script subset is **M5·B**, not here.
- **No new engine behavior** — this is import-report + editor-render only.
- Scope creep guard (risk register): the guidance table is **data**, not code;
  anything a plugin did that Atlas lacks is a report line, never a shim.

## Deliverables (M5·A)

1. **`src/editor/importers/mz/plugin-guidance.ts`** — the maintainable guidance
   table (`GUIDANCE: PluginGuide[]`) of the top ~20 community add-on families
   (quest journals, message cores, engine cores, battle systems, pixel/diagonal
   movement, item/equip cores, states/skills, HUDs, lighting, encounter tweaks…),
   each with tolerant name matchers (regex over a normalized name that strips
   `YEP_`/`VisuMZ_n_`/`MOG_`/`Galv_`/`Orange`… prefixes), a verdict, a
   kid-friendly `advice` line, and an optional in-Atlas `pointer`. Plus
   `guidePlugin(name)` (first match wins → `unknown` fallback) and
   `buildPluginReport(plugins)` → `ImportReportPlugin[]`.
2. **`src/shared/schema.ts`** — additive optional `ImportReportPlugin` interface
   + `ImportReportDoc.plugins?: ImportReportPlugin[]`. FORMAT_VERSION stays 2.
3. **`src/editor/importers/mz/import-run.ts`** — `buildImportReportDoc` fills
   `plugins` from `conv.raw.plugins` (already parsed in intake).
4. **`src/editor/importers/rm-import-wizard.ts`** — `renderReportDoc` grows a
   "🔌 Add-ons (plugins)" section rendering the guidance table with verdict
   badges; reused by the post-import modal AND File ▸ Import Report.
5. **Tests** — `tests-unit/mz-plugins.test.ts`: matcher verdicts (quest→builtin,
   pixel-movement→none, unknown→unknown, prefix stripping), `buildPluginReport`
   over the fixtures' four-plugin list, ON/OFF + param counts; extend the wizard
   test to assert the doc carries `plugins`.
6. **Patch notes** (`js/patch-notes.js`) + help.ts "Coming from RPG Maker" bullet
   + `?v=` bumps (patch-notes 53→54, help.ts + shims.d.ts).

## Report shape (M5·A)

`ImportReportPlugin`:
- `name` — the add-on's name as listed in `plugins.js`.
- `on` — was it switched ON in RPG Maker?
- `paramCount` — how many settings it carried (report says "kept its N settings").
- `verdict` — `"builtin" | "partial" | "none" | "unknown"`.
- `advice` — one kid-friendly sentence (what it did → what Atlas offers).
- `pointer?` — where to look in Atlas ("Quests panel", "Database ▸ Types").

Verdict → badge in the renderer: builtin ✅ "Atlas already does this", partial 🔷
"Atlas has something close", none ▫️ "Atlas doesn't do this (your game still
plays)", unknown ❔ "kept your settings, but it won't run".

---

## Stage log

### M5·A — Plugin manifest & guidance — ✅ 2026-07-05 (branch `mig-5a`)

**Delivered:**
1. **`src/editor/importers/mz/plugin-guidance.ts`** — the maintainable guidance
   table (data, not prose): `GUIDANCE: PluginGuide[]` of ~21 community add-on
   families (quest journals → builtin/Quests panel; message cores, battle
   systems, item/equip, skills/states, params/class, save, menu, encounter,
   weather, core/basic → partial; pixel/diagonal movement, self-switches,
   lighting, HUD/gauges, day-night, fast-travel, achievements, gab/notification
   → none). `normalizePluginName` strips author prefixes (`YEP_`, `VisuMZ_<n>_`,
   `MOG_`, `Galv_`, `Orange…`) and splits CamelCase; `guidePlugin` (first-match,
   `unknown` fallback) tests the normalized AND raw name; `buildPluginReport`
   maps an `RmPlugin[]` → `ImportReportPlugin[]` (name, on/off, paramCount,
   verdict, advice, pointer). No plugin code executed — the manifest was already
   read as text in intake (`parsePluginsJs`).
2. **`src/shared/schema.ts`** — additive optional `ImportReportPlugin` +
   `ImportReportDoc.plugins?`. FORMAT_VERSION stays 2 (D2).
3. **`import-run.ts`** — `buildImportReportDoc` fills `plugins` from
   `conv.raw.plugins` (omitted when empty; M1–M4 reports are unaffected).
4. **`rm-import-wizard.ts`** — `renderReportDoc` grows a "🔌 Add-ons (plugins)"
   section: one tinted card per add-on with a verdict badge (✅ builtin /
   🔷 partial / ▫️ none — "your game still plays" / ❔ unknown — "settings kept,
   won't run"), the on/off + settings note, the advice, and the pointer. Reused
   by the post-import modal and File ▸ Import Report.
5. **`tests-unit/mz-plugins.test.ts`** — 16 tests: name normalization,
   verdict matching over real community names (YEP/VisuMZ/MOG/Orange), kid-safe
   copy, `buildPluginReport` (name/on/paramCount/verdict, empty + unnamed
   safety), and the end-to-end proof that the MZ fixture's four-plugin list
   attaches to the saved report with the right verdicts (CoveText→unknown,
   YEP_QuestJournal→builtin, CommunityBasic→partial, OrangeMovementEx→none/off).
6. **Patch notes** entry + help.ts "Coming from RPG Maker" add-ons bullet;
   `?v=` bump 53→54 (help.ts import + shims.d.ts).

**Guardrails held:** plugin `.js` never executed (D5/§14); no new engine
behavior; 356/357 event codes stay `mzTodo` + report (M1·C), untouched; the
guidance is data, not shims (risk register — scope-creep guard). The runnable
Script subset is **M5·B**, not here.

**Gates green:** `tsc --noEmit` clean · vitest **831** (was 815, +16) · node
`--test tests/` **18** · Playwright **70/70** · eslint clean on all changed
files (main's 3 pre-existing errors untouched — lint is not a phase gate).
patch-notes `?v=54`.

**Next:** M5·B — the minimal read-only Script-command adapter
(`$gameSwitches`/`$gameVariables`/`$gameParty`), then tag `mig-5`.

### M5·B — Script-command adapter — ✅ 2026-07-05 (branch `mig-5b`, phase exit)

**Objective:** make the *most common* imported Script snippets actually run —
exactly the read-only subset locked in mig-0 **D5**: `$gameSwitches.value(n)`,
`$gameVariables.value(n)`, and the `$gameParty` basics
`size()/gold()/members()/hasItem(item)`. Everything else stays `mzTodo` + one
honest report line (nothing dropped — D6/D11). No write surface exists (D5:
read-only *by design*; no writes without a new gate decision).

**Delivered:**
1. **`src/shared/mz-script.ts`** — the one pure module (no engine/DOM imports,
   so the vitest node env and the engine share a single definition of "the
   supported subset" — the src/shared pure-core trap):
   - **`analyzeMzScript(code)`** — the import-time gate. A snippet is `ok` only
     when (a) every identifier token is one of the three globals, their allowed
     members (`value/size/gold/members/hasItem`), or a JS literal
     (`true/false/null/undefined`) — this alone rejects bare vars, control-flow
     keywords (`if`/`for`), `Math`, `require`, and any other `$game*`/`$data*`;
     (b) at least one supported global is read; and (c) each global is reached
     through an allowed member — which is what rejects **writes** (`setValue`,
     `gainGold`) and bare assignment (`$gameSwitches = …`). String/line/block
     comments are stripped first so a comment can't trip the gate.
   - **`mzGlobalsFromState(state)`** — builds the three read-only `$game*` shim
     objects from a plain game-state shape (never the state object itself, so
     no setter is reachable). `hasItem` reads item/weapon/armor bags by id.
   - **`runMzScript` / `evalMzScript`** — run a gated snippet under the SAME
     `new Function` sandbox as the Atlas `script` command
     (`flow.ts`): command → statements (read-only, so no observable effect);
     condition → `return (expr)` → boolean, any error ⇒ `false`.
2. **`src/shared/schema.ts`** — additive `CmdMzScript { t:"mzScript"; code }` in
   the `AnyCommand` union, and `Condition.kind` gains `"mzScript"` + a `code?`
   field. FORMAT_VERSION stays 2 (D4).
3. **`translate-commands.ts`** — `script()` (355/655) now gates the folded
   snippet: read-only ⇒ `{t:"mzScript"}` + a `converted` report line; else the
   prior `mzTodo` + honest `todo` line (copy updated — no more "runs in a later
   update" promise). `convertCond` case **12** (Conditional-Branch Script): a
   read-only expression ⇒ `{kind:"mzScript",code}`; else `null` (mzTodo + bodies
   drop, like any unmappable check).
4. **Engine** — `flow.ts` registers the `mzScript` command (builds the shim from
   the passed `state`, runs it — no `audio-deck`/singleton import, so the node
   interpreter bundle still stubs cleanly); `interp.ts` `testCond` gains
   `case "mzScript"` → `evalMzScript(cond.code, mzGlobalsFromState(G))`.
5. **Editor** — `command-defs.ts` renders the `mzScript` command ("Script (from
   RPG Maker): …") and the `mzScript` branch condition ("Script: …").
6. **Tests** — `tests-unit/mz-script.test.ts` (12: gate verdicts incl. the
   fixtures' `setValue` write → out of scope, other `$game*` rejected, comment
   safety; shim reads; `evalMzScript` boolean + never-throws; read-only
   no-mutation proof). `mz-translate-commands.test.ts`: 355 SPEC row flips to
   `mzScript`, + a M5·B block (read→`mzScript`, 655 fold, write→`mzTodo`,
   `$gameActors`→`mzTodo`, 111/12 read→real branch, 111/12 write→`mzTodo`+drop).
   `tests/interpreter.test.js`: `mzScript` registered + a runtime read/no-mutate
   + swallowed-write check.
7. **Patch notes** entry + help.ts "Coming from RPG Maker" Script bullet; `?v=`
   bump 54→55 (help.ts import + shims.d.ts).

**Guardrails held:** read-only by design (the shim has no setter — a write can't
be spelled, D5); the fixtures' deliberate writes (`CommonEvents[2]`,
`Map002 Ambush`) still land as `mzTodo` + report, proving the "beyond scope"
path (D5 note); same sandbox as the Atlas `script` command; nothing silently
dropped (D6). No FORMAT_VERSION bump (D4).

**Gates green:** `tsc --noEmit` clean · vitest **849** (was 831, +18) · node
`--test tests/` **18** · Playwright **70/70** · eslint clean on all changed
files (main's 3 pre-existing errors untouched — lint is not a phase gate).
patch-notes `?v=55`.

**Phase M5 COMPLETE — tag `mig-5`. Next:** M6·A — wizard UX polish + the
"Coming from RPG Maker MZ/MV" documentation.
