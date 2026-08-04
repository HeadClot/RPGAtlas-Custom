# Phase M1 Spec — Importer core: an MZ/MV project becomes an Atlas project

**Status:** ✅ COMPLETE — M1·A + M1·B + M1·C + M1·D landed. Phase exit tags `mig-1`.
**Authored:** 2026-07-04 by Claude Opus 4.8 (Extra High), from the M1 section of
`docs/MZ_MV_MIGRATION_ROADMAP.md`, the signed parity matrix
`docs/mz-mv-parity-matrix.md`, and the decision log in `docs/mig-0-spec.md`.
**Branch (per step):** `mig-1a`, `mig-1b`, `mig-1c`, `mig-1d` — each merges to
`main` (locked decision 2). Phase exit (M1·D) tags `mig-1`.
**Model:** Opus 4.8 (Extra High) for all four steps. Sonnet is banned from RPGAtlas.

## Objective (phase M1)

The end of this phase: **both fixtures import, boot, and playtest** — with `mzTodo`
markers standing in for future engine features. M1 turns an RPG Maker MV/MZ project
folder into an RPGAtlas `Project` document, built against the signed M0 contract.

- **M1·A** — project reader (intake / sniff / decrypt) + **database conversion**
  (System, Actors, Classes, Skills, Items, Weapons, Armors, Enemies, Troops+pages,
  States, CommonEvents → Atlas DB records per the matrix).
- **M1·B** — tilesets + maps (autotiles A1–A5, flag bits, layers→`layersAdv`,
  MapInfos tree→folders, encounters, notes).
- **M1·C** — events + the command **translation table** (`translate-commands.ts`):
  every MZ command code → Atlas command or `mzTodo`.
- **M1·D** — import wizard UX + plain-language report + end-to-end proof. Tag `mig-1`.

## Locked decisions inherited (roadmap + mig-0)

1. Opus 4.8 does the work; **Sonnet banned**; Fable gates only M0·C / M6·C.
2. Git ritual after every step: branch `mig-<phase><step>` → tests green → commit →
   push → merge to `main` → push `main` → delete branch. Phase exit tags `mig-N`.
3. Hand-off: each step ends by printing the next step's kick-off prompt verbatim.
4. Format: importer writes FORMAT_VERSION 2; new engine features are **optional
   schema fields only** (D2). No FORMAT_VERSION 3.
5. Legal: no RTP/DLC assets ever; fixtures self-made; decryption uses the user's own
   `System.json` key (D9 — detection by **extension**).
6. Audience: reports/wizard/errors are for kids / first-time devs (D11 copy style).

## The translation table is the spine

`src/editor/importers/mz/translate-commands.ts` is **built in M1·C**, not here. M1·A
therefore converts the two command-bearing DB record kinds — `CommonEvents` and
`Troops` battle-event pages — as **structural shells** (id / name / trigger / switchId;
troop `enemies[]`, page `cond` + `span`) and takes the command-list body through an
**injected translator seam**: `convertCommonEvents` / `convertTroops` accept an optional
`translate: CommandTranslator` argument that defaults to a no-op (`() => []`). M1·C
implements the real translator and injects it; nothing else about these converters
changes. This keeps M1·A from pre-empting M1·C's design of the command vocabulary while
still shipping the full record structure now.

---

## Module map — `src/editor/importers/mz/`

| File | Role |
|---|---|
| `raw-types.ts` | TypeScript shapes for the **input** RM data (`RmSystem`, `RmActor`, `RmClass`, `RmSkill`, `RmItem`, `RmWeapon`, `RmArmor`, `RmEnemy`, `RmTroop`, `RmState`, `RmCommonEvent`, `RmTrait`, `RmEffect`, `RmDamage`, `RmCommand`, …). Loosely typed — MV/MZ deltas are optional fields. |
| `slug.ts` | Stable string-key synthesis (elements/skillTypes) + the param-index → Atlas-param-key table (`luk` → dropped). |
| `report.ts` | `ImportReport` — a structured line collector (`area`/`kind`/`what`/`detail`/`count`/`code`). Copy is engineering shorthand; **M1·D** turns lines into kid-friendly text (D11). Aggregated counters (`count(key, make)`) power the single-line `luk` / SV-battler / face aggregates. |
| `decrypt.ts` | Pure asset (de)cryption: `parseEncryptionKey` (hex → 16 bytes), `isEncryptedAssetPath` / `restoredPath` (extension-based, D9), `decryptAsset` / `encryptAsset` (skip 16-byte fake header, XOR next 16 bytes). Uint8Array in/out — works in browser + Tauri + node/vitest. |
| `sniff.ts` | `sniffFormat(files)` → `{ format: "mv"\|"mz", reasons }` by marker file (`Game.rpgproject` vs `Game.rmmzproject`), falling back to data cues (Animations `effectName` vs `frames`, System `advanced`/`tileSize`). |
| `intake.ts` | `MzFileSource` interface + adapters: `objectSource(map)` (in-memory), `fileListSource(files)` (browser directory-picker / drag-drop via `webkitRelativePath`), `fsSource(root, fns)` (injected read fns — Tauri/node). `readRawProject(source, report)` loads + parses the 15 `data/*.json`, the `Game.*` marker, `js/plugins.js`, and discovers `img/`+`audio/` asset paths. **Tauri FS dialog + zip inflate are wired in M1·D** (the wizard); the interface + object/fileList/fs adapters are the testable core. |
| `traits.ts` | MZ trait-code (11/13/21/43/51/52) → Atlas `Trait` rows (value **× 100** — Atlas trait values are percentages, confirmed against the starter DB + `RA.traitRate`). Everything else → report. Shared by class/actor conversion. |
| `convert-system.ts` | `RmSystem` → `Partial<SystemData>` patch (types fully built). Downstream (M1·D) overlays it on `DataDefaults.newProject().system`. |
| `convert-battlers.ts` | Classes (curve fit + traits + learnings), Actors (equip reduction + actor-trait merge onto class), Enemies (stats + actions + condition mapping), States (restrict / turns / `hpTurn` from hrg trait). |
| `convert-items.ts` | Skills (type / element / scope / effects / **`formula` verbatim**), Items (hp/mp/revive + formula), Weapons/Armors (params, `luk` dropped). |
| `convert-events.ts` | CommonEvents + Troops(+pages) **shells** through the injected `CommandTranslator` seam (M1·C). |
| `index.ts` | Public API: `convertDatabase(raw, format, report)` → `MzDatabase`; `importMzDatabase(source)` (intake → sniff → convert); re-exports. |

## M1·A design decisions (extending the signed contract where the schema forces a call)

These refine — never contradict — the matrix/decision-log. Each is a call M1·B–M1·D
and later phases build on.

- **A1 · Trait value scale = percent.** Atlas trait `value` is a percentage
  (`RA.traitRate` divides by 100; starter DB uses `param 110` for ×1.1, `element 80`
  for ×0.8). So MZ multipliers/probabilities convert as `round(mz × 100)`: element
  rate `0.5` → `50`, param rate `1.1` → `110`, state rate `0` → `0`.
- **A2 · Which trait codes M1·A emits (D6 "directly-representable" set).** Only the six
  D6 codes are emitted as real Atlas trait rows, and only the three the engine actually
  reads change gameplay: **11 Element Rate** (`element`), **13 State Rate** (`state`),
  **21 Parameter** (`param`, `luk`/index 7 dropped). The other three are **preserved but
  inert** by design (Atlas semantics differ, so they can't wrongly change combat):
  **43 Add Skill** → `{skill, key:<id>, value:100}` (Atlas `skill` traits are damage-rate
  amps keyed by skill-**type**, so an id-keyed row is a harmless no-op + report);
  **51/52 Equip Type** → `{equip, key:"weaponType"\|"armorType", value:<typeId>}` (Atlas
  `canEquip` keys on `"weapon"`/`"armor"` with item-**id** values, so a `*Type` key never
  matches → equipment stays unrestricted + report). All other codes → report (`mzTodo`
  for M3·B).
- **A3 · Equip / enemy / state trait carriers (refines D6).** D6 says merge non-class
  traits "onto the effective class." M1·A applies that **only for actor-level traits**
  (merged onto the actor's `ClassDef`, one report line per source — Mara's Fire resist →
  Wanderer class). **Weapon / Armor / Enemy / State traits are report-only in M1·A**:
  Atlas has no per-equip trait carrier and `Enemy`/`StateDef` have no `traits` field, so
  anchoring an equip trait to a class would make it *permanent* (a real behavior change)
  and enemy/state resistances have literally nowhere to live. The mechanical stat blocks
  still convert (`Weapon.params`/`Armor.params`/`Enemy.stats`); only the trait **rows**
  are reported, honestly, for M3·B to carry. This is the safe reading of D6's "Atlas has
  no per-equip trait carrier yet."
- **A4 · Class curve linearization (matrix §Classes `≈`).** MZ `params[8][100]` →
  Atlas `base` (= level-1 value, index 1) + linear `growth`
  (= `(params[p][99] − params[p][1]) / 98`, rounded to 0.01). The engine reads
  `floor(base + growth·(level−1))`. Reported once as "stat curves were simplified."
- **A5 · `formula` schema fields (D1/D2).** New **optional** `Skill.formula?: string` and
  `Item.formula?: string` — the only schema additions in M1·A. The MZ damage formula
  string is stored **verbatim**; the M3·A evaluator consumes it later. Structured
  `power`/`hp`/`mp` still carry from recover-effect codes as the M1 fallback. Both fields
  are inert today (nothing reads them), so old projects are unaffected (FORMAT_VERSION
  stays 2).
- **A6 · System is a `Partial<SystemData>` patch.** `convert-system.ts` returns only the
  fields it derives (plus a fully-built `types`); M1·D overlays it on
  `newProject().system` so input bindings / screenScale / logical sound + music maps keep
  their engine defaults. Title/currency/switches/variables/party/start/opts convert;
  `windowTone` RGB → `windowColor` hex (gray dropped, report); MZ `advanced{}` →
  screen/ui/font sizes; vehicles → `VehicleDef`. Imported BGM (`titleBgm`/`battleBgm`) →
  `asset:audio/<name>` keys; the 24-slot SE array + ME channels stay on Atlas defaults +
  one report line (audio files convert in M1·B/M4·B).
- **A7 · Charset key placeholder.** `characterName`+`characterIndex` → a synthesized
  `charset` key (`slug(name)` + index suffix when > 0). Real sheet slicing rides the
  existing asset pipeline in a later step; the key is stable now so events/actors resolve.
- **A8 · Command bodies deferred to M1·C** via the injected translator seam (above).
  M1·A `commonEvents[*].commands` and `troops[*].pages[*].commands` are `[]` until M1·C.

## Matrix rows realized in M1·A (the `= M1·A` / `≈ M1·A` set)

System §1 (title/currency/switches/variables/party/types/window-tone/vehicles/BGM/
start/opts/advanced) · Actors §2 (id/name/class/level/charset/equip-reduction/actor-trait
merge; nickname/profile/maxLevel/SV-battler → report) · Classes §2 (curve fit / learnings
/ traits 11·13·21·43·51·52) · Skills §2+§6+§7 (type/element/scope/mp/icon/hits/anim/state
+ commonEvent effects / **formula** verbatim) · Items §2 (hp/mp/revive/desc + formula;
key-item/non-consumable/state-cure → report) · Weapons/Armors §2 (params `luk`-dropped;
traits → report) · Enemies §2 (stats/exp/gold/actions+condition kinds; drops/traits →
report) · Troops §2 (enemies/pages cond+span; members x·y/hidden → report/M3·C) · States
§2 (restrict/turns/`hpTurn`/removeAtEnd; SV motion/removeByX → report) · CommonEvents §2
(trigger/switchId) · `luk` §5/§7 (single aggregated report) · decryption §15 (D9).

Deferred by design: maps/tilesets/autotiles (M1·B), command bodies + `translate-commands`
+ `mzTodo` command schema (M1·C), wizard + report UI + e2e boot (M1·D).

---

## Module map — M1·B additions (`src/editor/importers/mz/`)

| File | Role |
|---|---|
| `tile-ids.ts` | Pure RM tile-id + flag-bit decoding. `decodeRmTileId` (family/kind/shape/index), `isRmAutotile`/`autotileKind`/`familyOfKind`, and `decodeFlags` → the real rmmv/rmmz `Game_Map` bit values (D10): passage `0x0F`, ★ `0x10`, ladder `0x20`, bush `0x40`, counter `0x80`, damage `0x100`, terrain-tag `flag>>12`. `atlasFlagByte`/`atlasPassByte` translate to Atlas's Database ▸ Tilesets `tileProps` model. |
| `convert-tilesets.ts` | RM tilesets → `Autotile[]` groups + `Tileset` (`tileProps`) + the RM-tile-id → Atlas-tile-id **resolver** + the `project.assets.tiles` seed. Materializes only the autotile kinds / plain tiles a map actually paints (from the map scan). |
| `convert-maps.ts` | `collectTilesetUsage` (scan planes), `convertMapData` (6-plane rebucket + remap + shadows/regions/passOv + ★-reroute + region clamp), `convertMap` (geometry + encounters/music/notes), `convertMaps` (MapInfos → ordered maps + `MapFolder` synthesis, D8). |
| `assemble.ts` | `assembleProject(base, conv)` — overlay a converted project onto an injected `DataDefaults.newProject()` base. DOM-free (base passed in) so it is node/vitest-testable; M1·D calls it in the browser. |

`index.ts` gains `convertProject` / `importMzProject` (database + tilesets + maps in one
pass) alongside the M1·A `convertDatabase` / `importMzDatabase`; `intake.ts` additionally
reads `Tilesets.json`, `MapInfos.json`, and every `Map###.json` (id from the filename).

## M1·B design decisions (extending the signed contract)

- **B1 · Tile-id decode is pure + real-RM.** `tile-ids.ts` is a pure function of a number;
  it uses the verified `Tilemap` bases (A5 1536 · A1 2048 · A2 2816 · A3 4352 · A4 5888) and
  the D10-corrected flag bits. Every A1–A4 shape of the same "kind" collapses to one Atlas
  group (Atlas re-derives the shape from 8-neighbour connectivity — the §12b risk item is
  handled by *not* pre-baking shapes).
- **B2 · One Atlas autotile group per *used* RM kind.** A map scan (`collectTilesetUsage`)
  drives materialization, so the imported palette stays tight. Kind mapping (matrix §12b):
  A1→`a1` (+ `anim{frames:3,fps:8}` for RM water/waterfall), A2→`blob47`, A3→`a3`, A4→`a4`.
  `group.pass` comes from the kind base-shape passage (deep water `0x0F` → `pass:false`); a
  terrain tag rides `group.props.terrainTag` for M4·A.
- **B3 · The plain-tile id ↔ M1·D slice contract.** Referenced A5/B–E tiles get stable Atlas
  ids from `IMPORT_TILE_BASE` (100) pre-seeded into `project.assets.tiles` under
  `asset:tilesets/<slug>_<fam>-t<index>` keys (via the shared `assetKeyOf`/`slugName`). The
  map layers this step paints use those ids; **M1·D slices the project's real tileset images
  into the SAME keys**, and `js/assets.js bindExternalAssets` reuses the pre-assigned ids
  (its `nextTileId` maxes over the map) — so no re-numbering, and the fixtures' 1×1
  placeholder art is a non-issue for the conversion math. Autotile groups ship a decodable
  1×1 placeholder `sheet` for the same reason.
- **B4 · Flags stored now, behaviors M4·A.** Per-tile passage/★/ladder/bush/counter/damage/
  terrain-tag decode into Atlas's existing `tileProps {pass,flag,terrain}` (Database ▸
  Tilesets) + the map `passOv` (whole-tile block; partial passage simplified + reported).
  The ladder/bush/counter/damage *gameplay* is M4·A — stored + reported here (one friendly
  aggregated line each), never silently dropped (locked decision 6). ★ tiles carry no
  `tileProps` bit — they route to the `over` layer instead.
- **B5 · Layer rebucket.** RM's `w·h·6` → ground(z0)/decor(z1)/decor2(z2)/over(z3) +
  `shadows`(z4, 4-bit quad mask) + `regions`(z5, clamp to Atlas 1–63 + report on >63).
  ★-flagged tiles from a lower plane float up to `over` when its cell is free.
- **B6 · Map metadata.** `encounterList`→`encounters{troops(unique),rate=encounterStep}`;
  `regionSet`→ report (region-scoped encounters are M4·A); non-default weights → report.
  autoplay BGM/BGS → `music`/`ambience[]` `asset:audio/…` keys; `note` verbatim into
  `GameMap.notes`; parallax / looping / per-map battleback / map-name banner → one report
  line each (M4·A / matrix 281). **Events stay `[]`** — the same M1·C seam M1·A used for
  command bodies.
- **B7 · MapInfos → folders (D8).** One `MapFolder` per parent map that has children, named
  after the parent; the parent and its children all get that `folderId`; maps are ordered by
  MapInfos `order`. Root maps (parentId 0, no children) sit at the tree root.
- **B8 · Assembly is an injected-base seam.** `assembleProject(base, conv)` overlays the
  converted System patch (music merged, keeping engine channel defaults) + collections +
  maps/tilesets/autotiles/folders + the `assets.tiles` id-map onto a fresh
  `newProject()`; plugins, base battle animations and stamps stay engine defaults (imported
  plugins are M5·A, MV/MZ animations M4·B); sample quests cleared. Passed a base rather than
  importing `newProject()` (which lives on `window`) so it stays DOM-free + testable.
- **B9 · Zero new schema.** `GameMap` / `MapLayers` / `Autotile` / `Tileset` / `MapFolder` /
  `MapEncounters` all pre-exist (Phases 3/5/8). M1·B adds **no** schema field;
  FORMAT_VERSION stays 2; old projects unaffected.

---

## Module map — M1·C additions (`src/editor/importers/mz/`)

| File | Role |
|---|---|
| `translate-commands.ts` | **THE TRANSLATION TABLE — the spine.** A cursor-based recursive parser that rebuilds Atlas's nested command tree (branches/loops/choices/battle-result blocks) from RM's flat `indent` + continuation codes (401/402/411/412/413/601–604/605/655), and a per-code dispatch for matrix §8 (101–657): each code → real `AnyCommand`(s), an `mzTodo` placeholder, or a `−` drop. Move routes (§9) via `routeSteps`. `makeTranslator(report)` builds the `CommandTranslator` seam M1·A/M1·B left injected; `translateCommands(list, report)` is the direct entry. Pure. |
| `convert-map-events.ts` | RM map `events[]` → Atlas `MapEvent[]` (matrix §2 pages): conditions (switch/var/self-switch; item/actor → report), image → `charset`+`dir`, moveType/trigger/priority/through, and the page command list through `translate`. |

`schema.ts` gains one additive optional command — `CmdMzTodo { t:"mzTodo", code, params, label }` (D3) — in the `AnyCommand` union. `command-defs.ts` renders it (📌 summary + a hidden, non-crashing read-only edit form, excluded from the Add-Command picker). `convert-maps.ts` (`convertMap`/`convertMaps`) + `index.ts` (`convertDatabase`/`convertProject`) thread the translator: it now builds the real spine by default (pass a custom `translate` only to override, e.g. tests).

## M1·C design decisions (extending the signed contract)

- **C1 · The engine no-op is free.** `mzTodo` needs **zero engine change**: the interpreter
  registry already silent-skips unmapped command types (`interp.ts` `if (handler)…`, no
  `console.warn`), so an `mzTodo` node is a no-op with no console noise — the import-boot
  e2e's "no console errors" bar holds. The union doc-comment in `schema.ts` records that
  `mzTodo` is the one command deliberately without a handler.
- **C2 · Preserve-vs-drop rule.** `+ Mn` codes → `mzTodo` (raw code+params kept, one
  aggregated report line, upgraded on re-import when the phase ships). The `−` skip set
  (Play Movie 261, map-name-display 281, Open Menu 351, Gather Followers 217) → dropped with
  a friendly line, never a placeholder (they will never "come back"). Comments (108/408) →
  dropped silently (matrix: not report-worthy).
- **C3 · Move routes convert steps, not inline commands.** A route → a `CmdMove` whose
  `steps[]` are the Atlas-representable movement/turn/jump/wait tokens (§9 `=` + decomposed
  diagonals). Non-movement/dynamic steps (speed/freq/anim/dirfix/through/opacity/blend/random/
  toward-away/backward/switch/SE/script) are omitted and **aggregated into one report line**
  per route — `CmdMove.steps` is a `string[]` and cannot hold inline commands, so the matrix's
  "emit CmdSe/CmdSwitch inline" ideal is refined to omit-and-report (a valid `≈`). Page-level
  autonomous custom routes (moveType 3) have no Atlas home at all → report + the event stays
  put.
- **C4 · Battle-result branches are placeholders (M3·C).** `301` → `CmdBattle` (troop +
  `escape` from canEscape + `lose` from canLose). The `601/602/603` result-branch openers
  each become an `mzTodo` and their bodies are consumed-and-dropped (Atlas has no
  win/escape/lose branch until M3·C); `604` is structural. Honest + safe: the battle runs,
  the branches no-op, one report line each.
- **C5 · Only the safe, exact cases of the lossy `≈` commands map now.** Control Variables
  (122) maps const set/add/sub + random-set; game-data/var operands + ×/÷/% → `mzTodo`.
  Change Gold/Items (125–128) map the constant-operand case; variable operand → `mzTodo`.
  Transfer (201) and Battle (301) map the direct case; variable/random designation →
  `mzTodo`. Change HP/MP (311/312) map **only** the whole-party + constant + increase case to
  `CmdHeal` (guarded on the exact param shape); anything targeted/decreasing → `mzTodo`.
  Conditional Branch (111) maps switch/var(const)/self-switch/actor(inParty/weapon/armor)/
  gold/item/weapon/armor; timer/enemy/character/button/script/vehicle → `mzTodo` (branch
  bodies dropped). This keeps every emitted Atlas command *correct*, never a plausible-looking
  wrong one.
- **C6 · Escape codes pass through verbatim (§13).** M1·C stores message text unchanged;
  unknown MZ escapes render literally until M2·B flips them. No mangling, no report spam.
- **C7 · Command ids are 1:1.** Atlas keeps RM numeric ids for switches/variables/items/
  weapons/armors/troops/maps/common-events/actors (verified against the M1·A/M1·B
  converters), so command operands need no remapping — only the *shape* changes.

## Fixture correction (faithful RM data)

`scripts/build-migration-fixtures.mjs` — the harbor Chest's **Change Gold (125)** command was
written with a 4-param `[0,0,0,100]` layout (126's shape); real RM `command125` is
`[operation, operandType, value]` (3 params — `Game_Interpreter.prototype.command125` calls
`operateValue(params[0..2])`). Corrected to `[0,0,100]` so the fixture is faithful RM data and
imports as **+100 gold**; regenerated (deterministic — only the two `Map001.json` bytes change,
one line each; every other fixture file is byte-identical). No M1·A/M1·B test asserted event
content, so baselines are otherwise untouched.

---

## Stage log

### M1·A — Project reader & database conversion — ✅ 2026-07-04 (branch `mig-1a`)

**Delivered — `src/editor/importers/mz/` (11 modules):** the project-reader + DB-conversion
core listed in the module map above. Pure, dependency-light, node/vitest-testable; the
DB converters take parsed RM JSON and emit Atlas records + an `ImportReport`. Intake ships
the `MzFileSource` abstraction with object / fileList / injected-fs adapters and
`readRawProject`; the Tauri dialog + zip inflate land with the wizard in M1·D.

**Schema:** two optional additive fields — `Skill.formula?`, `Item.formula?` (A5/D1/D2).
Nothing reads them yet; FORMAT_VERSION stays 2; old projects unaffected.

**Vitest (new specs under `tests-unit/`):**
- `mz-decrypt.test.ts` — key parse, extension-based detection + restored paths (D9),
  encrypt/decrypt symmetry, and decrypting the committed fixture `Sign.{rpgmvp,png_}`
  to a valid PNG magic.
- `mz-sniff.test.ts` — MV vs MZ by marker file and by data cues (Animations model,
  System `advanced`/`tileSize`).
- `mz-import-db.test.ts` — **fixture DB round-trips** against
  `tests/fixtures/{mv,mz}-project/`: system types/switches/variables/party/window-color/
  vehicles/advanced; actor equip-reduction + actor-trait merge + report lines; class
  curve fit + trait rows + `luk` aggregation; skill type/element/scope/`formula`/effects;
  item hp/revive/reports; weapon/armor params (`luk` dropped); enemy stats/actions;
  state restrict/`hpTurn`/turns; troop enemies + page cond/span; common-event
  trigger/switch; the MV/MZ delta (both fixtures convert to the same DB modulo format).

**Baselines:** vitest 451 → **490** (+39 across `mz-decrypt`/`mz-sniff`/`mz-import-db`);
typecheck green; legacy `node --test` 16/16; **Playwright 59/59** (baseline intact — the
importer is editor-side pure logic, not wired to a scene yet). Lint: the new `mz/` modules
+ specs are clean; the one pre-existing `eslint .` error (`scripts/build-migration-fixtures
.mjs:561` — an unused `mz` param on the map generator, byte-identical to `main`) is M1·B
scaffolding, untouched here. No `js/patch-notes.js` / `help.ts` / `shims.d.ts` bump —
nothing user-visible ships until the M1·D wizard (working agreement step 2: user-visible ⇒
patch notes; M1·A has no user surface).

**Next:** M1·B — tilesets & maps.

### M1·B — Tilesets & maps — ✅ 2026-07-04 (branch `mig-1b`)

**Delivered — `src/editor/importers/mz/` (4 new modules + wiring):** `tile-ids.ts`,
`convert-tilesets.ts`, `convert-maps.ts`, `assemble.ts` per the module map + design
decisions B1–B9 above. `intake.ts` now reads `Tilesets.json` / `MapInfos.json` / every
`Map###.json`; `index.ts` gains `convertProject` / `importMzProject` (database + tilesets +
maps in one pass) + `assembleProject`. Pure, node/vitest-testable; both fixtures convert to
byte-identical maps/autotiles/tile-ids (the MV↔MZ delta is DB/animations, not maps).

**Schema:** **none.** Every target type (`GameMap`/`MapLayers`/`Autotile`/`Tileset`/
`MapFolder`/`MapEncounters`) already exists; FORMAT_VERSION stays 2 (B9/D2).

**What converts (matrix §2 Map###/MapInfos, §11, §12b):** A1–A4 autotiles → one Atlas
group per used kind (`a1`/`blob47`/`a3`/`a4`, water animated, terrain tags kept); A5/B–E
plain tiles → stable pre-assigned `project.assets.tiles` ids (the M1·D slice contract, B3);
the six RM planes → Atlas role layers + `shadows` + `regions` (1–63 clamp) + `passOv`, with
★ tiles floating to `over`; tileset flags → `tileProps` (ladder/bush/counter/damage/terrain
stored + reported for M4·A); encounters (troop list + step→rate), autoplay BGM/BGS →
music/ambience, and the map note. MapInfos → ordered maps + synthesized `MapFolder`s (D8).
Everything Atlas can't honor yet emits one kid-friendly report line (region-scoped
encounters, parallax, looping maps, per-map battlebacks, the map-name banner) — no silent
drops. Events stay `[]` (the M1·C command-translation seam).

**Boot proof (M1·B "Playwright boot of an imported fixture map"):** the real
intake → `convertProject` → `assembleProject` pipeline is bundled (esbuild, DOM-free) and
run over the MZ fixture in `tests-e2e/fixtures/import-fixture.mjs`; the new
`tests-e2e/import-boot.spec.mjs` seeds the assembled project into the app the same way the
Atlas-Quest specs do and asserts `play.html` reaches the **Cove Test** title screen and
starts a map with **no console errors** — the converted maps/tilesets/autotiles load in the
shipping engine (placeholder art renders blank but never throws; real slicing is M1·D).

**Vitest (new spec `tests-unit/mz-import-maps.test.ts`, +16):** autotile kind→group mapping
(A1 water `pass:false` + anim, A2 grass terrain tag, A4 wall); the `assets.tiles` key/id
contract; flag→`tileProps` (bush/counter/damage bits; ★ carries none); every behavior
report line; the 6-plane rebucket (grass/water/island ground ids, ★→over, decor/shadow/
region planes); region-64 clamp; encounters + music + note; the deferred-feature reports;
MapInfos folder synthesis (D8); MV≡MZ map equality; synthetic edge paths (blocked-passage
`passOv`, ★-reroute from a lower plane); and `assembleProject` → `validateProject`-clean
bootable project.

**Baselines:** vitest 490 → **506** (+16); typecheck green; `eslint .` **fully clean** (the
pre-existing unused-`mz`-param error in `build-migration-fixtures.mjs` was removed — an
output-neutral fix, fixtures regenerate byte-identical); legacy `node --test` 16/16;
**Playwright 59 → 60/60** (+ the import-boot smoke; 0 regressions to the frozen-map
goldens). No `js/patch-notes.js` / `help.ts` / `shims.d.ts` bump — the importer still has no
user-facing surface until the M1·D wizard (working agreement step 2).

**Next:** M1·C — events & the command translation table (`translate-commands.ts`).

### M1·C — Events & the translation table — ✅ 2026-07-05 (branch `mig-1c`)

**Delivered — the spine.** `src/editor/importers/mz/translate-commands.ts` owns the
MZ/MV-command-code → Atlas-`AnyCommand` mapping for **every** matrix §8 code (101–657), §9
move routes, and §13 escape passthrough; plus `convert-map-events.ts` (RM map `events[]` →
`MapEvent[]` with page conditions/graphic/trigger/priority/through/moveType). The translator
is now wired as the **default** through the M1·A/M1·B injected seam: `convertDatabase` /
`convertProject` build it from `report` and thread it into common events, troop pages, and
map event pages — so a fixture now imports with **fully translated events**, not shells.
Design decisions C1–C7 + the module map above. Per-code table follows the matrix exactly
(the `+ Mn` rows import as `mzTodo` and the named phase flips them; the `−` rows drop with a
report line).

**Schema:** one additive optional command — `CmdMzTodo { t:"mzTodo", code, params, label }`
(D3) — in the `AnyCommand` union. No engine handler by design (C1); FORMAT_VERSION stays 2;
old projects unaffected. Editor renders it (📌 summary + hidden, non-crashing read-only form).

**Vitest — the table IS the spec (`tests-unit/mz-translate-commands.test.ts`, +142):** a `SPEC`
table with **one row per §8 code** asserting real-command-type / `mzTodo`-preserving-code /
intentional-drop; field-fidelity tests for the `=` rows (text 401-fold + MZ speaker name,
choices branches, if-then-else nesting + unmappable-condition placeholder, loop body, switch
range expand, variable/gold/item operand guards, transfer facing, flash/shake/weather/SE/BGM
values, battle + 601/602/603 placeholders, shop 605-fold, party-heal guard, script 655-fold);
move-route §9 (direct vocab, diagonal decompose, dropped-step report, other-event → `mzTodo`);
escape-code passthrough (§13); `mzTodo` shape + D11 aggregation; event-page conversion
(trigger/priority/through/charset/dir, conditions, two-switch + item/actor reports); and the
full **MZ + MV fixture round-trip** through `convertProject` (Finn dialog, Chest two-page
self-switch, ToCave transfer, Sign pictures→`mzTodo`, Cave Ambush battle+branches+script, the
356↔357 plugin delta) + an `assembleProject` → `validateProject`-clean bootable project with
populated events.

**Baselines:** vitest 506 → **648** (+142); typecheck green; `eslint .` clean; legacy
`node --test` 16/16; **Playwright 60/60** (the import-boot e2e now boots a project with fully
translated events + `mzTodo` no-ops — still **0 console errors**, goldens untouched). Updated
two M1·A/M1·B specs that asserted the now-obsolete "empty command bodies / empty map events"
deferral (`mz-import-db` troop+common-event bodies now translate; `mz-import-maps` compares map
geometry with events excluded, since the §0 speaker-name + plugin-code deltas now live in the
translated event lists). **No `js/patch-notes.js` / `help.ts` / `shims.d.ts` bump** — the
importer still has no user-reachable surface until the M1·D wizard (`mzTodo` is hidden from the
command picker and only an import can create one), consistent with M1·A/M1·B (working
agreement step 2).

**Next:** M1·D — import wizard UX + plain-language report + end-to-end proof (tag `mig-1`).

---

## Module map — M1·D additions

| File | Role |
|---|---|
| `src/editor/importers/mz/zip-read.ts` | `readZip(bytes)` — a dependency-free ZIP reader (mirror of the STORE writer in `export-web.ts`) + DEFLATE via the platform's `DecompressionStream("deflate-raw")`. Walks the central directory → `{ path: bytes }` map for `objectSource`. Pure (no DOM). |
| `src/editor/importers/mz/import-run.ts` | The **DOM-free wizard core**. `runRmImport(source, base)` runs `importMzProject` → `assembleProject(base, …)` → attaches the report; `buildImportReportDoc(conv, project)` turns the converters' structured `ReportLine[]` + the assembled project's counts into the reopenable `ImportReportDoc`. Base is INJECTED (not `DataDefaults.newProject()`, which lives on `window`) so it stays node/vitest-testable. |
| `src/editor/importers/rm-import-wizard.ts` | The **UI**: `openRmImportWizard()` (folder/zip launcher), `initRmImport()` (wires the hidden `#rm-import-folder` / `#rm-import-zip` inputs — the seam Playwright drives), the progress + report modals, `renderReportDoc()` (kid-friendly grouping, D11), `openSavedImportReport()`, and `commit()` (loads the imported project the same live-refresh way `persistence.importProject` does). |

`index.ts` re-exports `runRmImport` / `buildImportReportDoc` / `readZip`. `index.html` gains the two hidden pickers. `boot.ts` calls `initRmImport()`. `workspace.ts` adds the `import-rm` + `import-report` actions to the **File** menu. `help.ts` gains a "Coming from RPG Maker MZ / MV?" quick-help section; `js/patch-notes.js` gains the release entry and `help.ts` + `shims.d.ts` bump the cache-bust to `?v=45`. `schema.ts` adds the additive optional `Project.importReport?: ImportReportDoc` (+ `ImportReportLine` / `ImportReportSummary`) — FORMAT_VERSION stays 2 (D2).

## M1·D design decisions (extending the signed contract)

- **D1 · The report leads with good news, then honest caveats (D11 / locked decision 6).**
  The converters already write each line in the "what it was → what happened" voice; the
  wizard adds a summary (counts of maps/heroes/skills/items/… computed from the assembled
  project) up front, then groups the lines by kind — ✏️ "came in a little differently"
  (`partial`), ⏳ "saved for a later update" (`todo`), 📦 "left out on purpose" (`skipped`) —
  and closes with next steps. No stack traces ever reach the user (errors show a plain
  "couldn't bring that in" note); a vitest guard asserts no `detail` line contains
  `undefined`/`NaN`/`Error`/`.ts:`.
- **D2 · The report is saved on the project + reopenable.** `Project.importReport` is a new
  additive optional field (FORMAT_VERSION stays 2); `migrateProject` mutates in place so it
  survives save/load, and **File ▸ Import Report** reopens it (the action disables itself when
  no report is present). Old projects simply have none.
- **D3 · Import replaces the project the same way `Open` does.** `commit()` mirrors
  `persistence.importProject`: migrate + `validateProject`, `consumeEmbeddedAssets`,
  `registerCustomChars`, `registerExternalAssets`, reset selection/undo, `rebuildAll`,
  `touch`. So an import behaves exactly like opening a `.json` (autosave, live pickers), plus
  the report. The launcher warns the user to Export first.
- **D4 · Folder AND zip intake, one convert path.** A picked directory rides the existing
  `fileListSource` (lazy `File` reads); a `.zip` is inflated by `readZip` into an
  `objectSource`, with a `data/System.json`-anchored prefix strip so a zip whose entries sit
  under a top-level game folder still resolves. Both feed the same `runRmImport`. The hidden
  inputs' change handlers do the work, so Playwright drives the real path by setting files on
  `#rm-import-folder` (no native dialog).
- **D5 · Tile/terrain *art* pixel-slicing is a conscious, honest re-scope (refines B3).**
  M1·B pre-seeded `project.assets.tiles` keys and shipped placeholder autotile sheets, noting
  M1·D "slices the project's real images into the same keys." M1·D **keeps** those placeholders
  and instead tells the user — in the report and quick-help — to bring their tileset artwork in
  with the existing, battle-tested Asset Browser slicer + Import Autotile Sheet. Rationale: the
  hand-authored fixtures are 1×1 placeholder art (locked decision 5), so an auto-slicer for RM's
  five different sheet layouts (A1/A2/A3/A4 + A5/B–E) could not be *validated* end-to-end here,
  and shipping an unverifiable cutter risks wrong art — worse than an honest placeholder and a
  one-click path to the real thing. The B3 key seam is untouched, so a future art pass drops in
  cleanly. Consistent with the migration's "honest about the rest, never a silent drop" ethos
  and the M6·C "re-scoped with a report line" allowance. **The maps' shapes, layout, passability,
  events, and encounters all import for real** — only the tile *pixels* wait.
- **D6 · Fixed an M1·C latent crash the weak boot assertion hid.** `convert-map-events.ts` set
  a page's `cond` only when conditions existed, but the engine's `pageActive` (map-runtime.ts)
  reads `page.cond.*` unguarded — editor-authored pages always carry a `cond` (data.js
  `newPage()`), so a condition-less imported page crashed map load (`reading 'switchId' of
  undefined`). The M1·B/M1·C `import-boot` e2e only asserted `#stage` visible (always true), so
  it slipped through. Fix: `convertPage` (and the empty-page fallback) now always emit a `cond`
  object, and the boot e2e now polls `scene === "map"` (real proof that `loadMap` resolved).

## Stage log

### M1·D — Import wizard UX + report + end-to-end proof — ✅ 2026-07-05 (branch `mig-1d`)

**Delivered — the user face of the migration.** A **File ▸ Import from RPG Maker…** wizard:
pick the game's project **folder** or a **.zip** → detect MV/MZ → progress note → convert →
the imported project becomes the live project → a kid-friendly **Import Report** modal (D1).
The report is **saved on the project** (`Project.importReport`) and reopens from **File ▸ Import
Report** (D2). Both hand-authored fixtures import, boot, playtest, battle, and save/load. Module
map + decisions D1–D6 above.

**Schema:** one additive optional field — `Project.importReport?: ImportReportDoc` (+
`ImportReportLine` / `ImportReportSummary`). FORMAT_VERSION stays 2; old projects unaffected.

**User-facing (working-agreement step 2 — the first M1 step with a user surface):**
`js/patch-notes.js` gains the "Import from RPG Maker MZ / MV" entry; `help.ts` gains a "Coming
from RPG Maker" quick-help section; `help.ts` + `shims.d.ts` bump the patch-notes cache-bust to
`?v=45`. Ten locale packs (`js/editor/i18n.js`) gain the two new command labels so the i18n
parity gate stays green.

**Bug fixed (D6):** the M1·C map-event converter omitted `cond` on condition-less pages, which
crashed the engine's `pageActive` on map load — invisible to the old `#stage`-only boot check.
`convertPage` now always emits `cond`; the boot e2e now asserts `scene === "map"`.

**Vitest (new `tests-unit/mz-import-wizard.test.ts`, +9):** `runRmImport` over both fixtures
(bootable-clean project; MV/MZ sniff; report summary counts; every honest caveat kept + no
stack-trace copy; the page-`cond` engine invariant; MV≡MZ shape) + the `readZip` reader
(STORE round-trip, DEFLATE inflate, objectSource intake). **Baselines: vitest 648 → 657 (+9);**
typecheck green; `eslint .` clean; legacy `node --test` 16/16.

**Playwright (new `tests-e2e/import-wizard.spec.mjs` +3; `import-boot.spec.mjs` +5, net):**
the wizard driven through the **real editor UI** (folder set on the hidden picker → report
renders → project loaded → reopen from the File menu; MZ + MV; freshly imported MZ boots in the
player), plus the imported MZ project running a **battle to a result** and a **save/load
round-trip** — the phase-exit "playtest, battle, save/load" proof. Boot specs now poll
`scene === "map"`. **Playwright 60 → 66 (+6); 0 golden regressions.**

**Phase exit:** M1 complete — an MZ/MV project imports, boots, and plays with `mzTodo`
placeholders standing in for future engine features. Tag `mig-1`.
