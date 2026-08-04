# Project Compass — Phase M4 spec: Engine parity III (map features & audio-visual)

**Phase:** M4 · **Model:** Opus 4.8 (Extra High) · **Tags:** `mig-4` at phase exit (M4·B)
**Roadmap:** `docs/MZ_MV_MIGRATION_ROADMAP.md` (phase M4) · **Contract:** `docs/mz-mv-parity-matrix.md`
**Governing decisions:** D2 (FORMAT_VERSION stays 2 — every schema addition optional-only),
D10 (real RM flag-bit values), D11 (aggregated, kid-friendly report lines), locked decision 6
(honest no-silent-drop).

Draw-conservation stays THE contract: every new behavior is presence-gated (a map without
the feature takes the exact pre-M4 code path — byte-identical rendering, movement, and RNG
draws; the frozen Driftwood Shore goldens gate it).

---

## M4·A — Remaining map-feature gaps

**Scope (matrix "M4·A — map features" bill):** tile flags Ladder/Bush/Counter/Damage-Floor
(§11 bits 5–8), Terrain Tag (bits 12–14), region-scoped encounters (§2 `encounterList`
`regionSet`), looping maps (`scrollType`), parallax (284 + map parallax fields), per-map
battlebacks (283 + map/System), Change Tileset (282), vehicle commands (202/206/323),
floor-death opts (`optFloorDeath`/`optSlipDeath`).

### What M1 already stored (this step makes the engine consume it)

- `Tileset.tileProps[assetKey] = { pass, flag, terrain }` — flag byte bit0 bush · bit1
  ladder · bit2 counter · bit3 damage (matches the Database ▸ Tilesets tab exactly);
  terrain 0–7. Written by `convert-tilesets.ts` since M1·B.
- Autotile groups: `Autotile.props.terrainTag` (base-shape tag). **Gap found:** groups never
  stored the behavior flag byte — an MZ bush/ladder A-sheet autotile (tall grass!) lost its
  behavior. M4·A adds `Autotile.props.flag` (same byte convention, optional).
- `MapEncounters.byRegion` already exists in schema + engine roll (Phase 5) — region
  encounters are an importer flip plus one engine gate fix (below).
- The fixtures already exercise everything: World tileset flags (terrain 3 on grass, damage
  A5 lava, ladder A4 wall, bush B t16, counter B t32), harbor `parallaxName:"Sea"` +
  `regionSet:[1,5]`, cave `scrollType:2` + `specifyBattleback:"Cave"`, System
  `optFloorDeath`/`optSlipDeath` fields present. `img/parallaxes/Sea.png` ships.

### Design decisions (locked at step start)

**D-M4A-1 — Tile-behavior cache** (new `src/engine/scenes/tile-behavior.ts`): rebuilt per
`loadMap` from `proj.tilesets` (byId `map.tilesetId`, tileProps keyed by `Assets.tiles[i].key`)
+ `proj.autotiles` `props.flag`/`props.terrainTag` (reserved id via `tileIdOf`). Exposes
`bushAt/ladderAt/counterAt/damageFloorAt/terrainTagAt(x,y)` reading all four role layers
(flags = union, terrain = topmost non-zero — MZ `layeredTiles`/`terrainTag` order), plus
per-map presence booleans so maps without a behavior pay zero per-step cost.

**D-M4A-2 — Ladder:** on step arrival (and transfer landing) onto a ladder tile, facing
snaps up (dir 3) — player and events. Presence-gated visual; no RNG.

**D-M4A-3 — Bush:** characters standing on a bush tile draw their bottom 12px at 50%
alpha (MZ bush depth). Canvas-2D path: two-pass clipped `Assets.drawChar`. HD path: a
processed sprite canvas copy with the faded band (imported maps default to classic
rendering, so HD is best-effort). Presence-gated.

**D-M4A-4 — Counter:** `checkActionTrigger` gains a third probe: if the facing tile is a
counter tile, also check the tile one beyond it (MZ talk-over-counter). Presence-gated.

**D-M4A-5 — Damage floors + floor-death opts:** stepping onto a damage tile (on foot)
deals `floor(10 × traitRate("special","floorDamage"))` to each party member (MZ basic 10 ×
fdr sp-param, already imported), red screen flash, HP floored at 1 unless
`system.optFloorDeath`; all-dead → game over. **Map slip tick:** under
`system.mzBattleFlow` only, every 20 party steps applies hp/mp regen traits on the map
(MZ `turnEndOnMap`), slip damage floored at 1 HP unless `system.optSlipDeath`. Both opts
are optional System fields set by the importer; native projects (absent fields, no
mzBattleFlow) take the exact pre-M4 path.

**D-M4A-6 — Terrain tags:** `locationInfo(x,y,"terrain")` returns the real tag (was an
honest 0); translator 285 keeps its shape, its "no terrain" caveat comment/report goes.

**D-M4A-7 — Region encounters (importer flip + one engine gate):** `convertEncounters`
builds `byRegion[r]` = global troops ∪ troops whose `regionSet` ∋ r (MZ validity =
regionSet empty or containing the region); `troops` = global-only list. The engine roll
gate `enc.troops.length` widens to `(enc.troops.length || byRegion non-empty)`; an empty
resolved pool resets the counter and skips battle. Native maps (no byRegion) keep the
identical gate and draw stream. The "enc-region" todo report line flips to nothing;
weighted encounters keep their honest "equal chance" partial line.

**D-M4A-8 — Looping maps:** `GameMap.loop?: { h?: boolean; v?: boolean }` (importer:
scrollType 1 V / 2 H / 3 both). Wrap-aware tile reads (`tilePassable`, behaviors, regions,
ledges) via `wrapX/wrapY`; movement normalizes coordinates on arrival (render coords shift
by ±width so interpolation never sweeps); the Canvas-2D camera unclamps on the looping
axis and the map buffers draw wrapped (repeat ±map px); entities near the seam draw at the
camera-nearest alias. HD-2D path does not loop (imported maps are classic; documented).
Pathfinding/minimap stay bounded (honest limitation, spec-logged). Fully presence-gated on
`map.loop`.

**D-M4A-9 — Parallax:** `GameMap.parallax?: { key, loopX?, loopY?, sx?, sy? }` (key =
`asset:pictures/<slug>`, same "add the art and it appears" report pattern as M2 pictures).
Runtime: loaded at `loadMap` (missing art ⇒ draws nothing, never a crash); when present,
the prerender skips the opaque base fill and the 2D render paints the parallax under the
lower buffer — MZ origin semantics: `!`-prefixed name = locked to the map (1:1 camera),
loop axis = half-speed camera + `s×/2` px-per-tick drift, non-loop = screen-fixed.
Command 284 swaps it at runtime (until the next map load). HD path: skipped (classic maps
only), documented.

**D-M4A-10 — Battlebacks:** `GameMap.battleback?: { back1?, back2? }` +
`system.battleback` default (asset:pictures keys; importer applies map fields only under
`specifyBattleback`). `Battle.run` resolves override (283 command, cleared on map load) →
map → System default and sets the `.battlewin` background (back2 over back1); missing art
⇒ the classic battle backdrop. RM's overworld terrain-based auto-battlebacks stay a report.

**D-M4A-11 — Vehicle commands:** new Atlas commands (schema + CMD_DEFS + interpreter):
`setVehiclePos` (202, direct or by-variables designation), `vehicle` (206 board/exit
toggle through the existing `tryVehicleAction`/disembark path), `vehicleImage` (323 →
`G.vehicleImages[type]` charset-key override read by `refreshPlayerCharset` +
`vehicleDrawables`, persisted with the save like `G.vehicles`).

**D-M4A-12 — Change Tileset (282) = locked skip.** Atlas maps bake resolved tile ids +
art at import; a runtime whole-tileset swap has nothing honest to swap. Matrix row flips
to `−` ("M4·A decision"); 282 moves from the TODO table to the SKIP table with a friendly
line. Re-import keeps working (SKIP lines never round-trip as placeholders by design).

**Editor affordances:** Map Properties gains Loop checkboxes + parallax key/scroll fields
+ battleback keys (existing tabbed dialog); the Tilesets tab already edits every behavior
this step ships (its tooltips promised them). Patch-notes entry + version bumps per
AGENTS.md.

### Test plan

- vitest: tile-behavior cache (layer union, topmost terrain, autotile flag byte, presence
  gates), wrap math, encounter-pool selection incl. byRegion gate, floor-damage/slip
  clamps, importer flips (byRegion shape, loop/parallax/battleback fields, group
  `props.flag`, 202/206/323 translations, 282 skip line, dropped todo lines), report-line
  diffs in `mz-import-maps.test.ts`/`mz-translate-commands.test.ts`.
- node + Playwright suites stay at 0 failures (frozen map 1 untouched; imported-fixture
  e2e re-runs).
- Fixture generator: amendments (if any) go into `scripts/build-migration-fixtures.mjs`
  FIRST, then regenerate — the generator is the source of truth (f2ba661 lesson).

### Stage log

- **2026-07-05 — M4·A started (branch `mig-4a`).** Read roadmap phase M4, the matrix
  "M4·A — map features" bill (§1 opts/battlebacks, §2 map fields, §8.5/§8.7 commands
  202/206/282/283/284/323, §11 flag bits, §12a vehicles), `map-runtime.ts`/`map.ts`/
  `render-glue.ts`/`battle.ts` (DOM battle win), `presentation-runtime.ts` (picture asset
  pattern), `convert-tilesets.ts`/`convert-maps.ts`/`tile-ids.ts`/`convert-system.ts`/
  `translate-commands.ts`, `tilesets-tab.ts`, the fixture generator, and the existing
  importer tests. Wrote this spec. Found: fixtures already exercise the whole bill;
  `byRegion` engine roll exists (Phase 5) but its gate skips byRegion-only maps; autotile
  groups never stored behavior flags (new `props.flag`). Design locked above (D-M4A-1…12);
  282 decided as a locked skip. Implementation next.

---

## M4·B — Animations & audio conversion

**Scope (matrix "M4·B — audio-visual" roll-up):** MV sheet `Animations.json` →
`BattleAnimation` converter; MZ Effekseer entries → auto-fallback to the nearest Atlas
animation (D4) + report line; ME channel (249 Play ME / 243 Save BGM / 244 Resume BGM,
victory/defeat/gameover ME); BGS (245/246, map `autoplayBgs` semantics); BGM options
(241 volume/pitch/pan, 242 timed fade — fade shipped in M1·C, row flips now); SE options
(250 volume/pitch/pan, 251 Stop SE); 133/139 Change Victory/Defeat ME.
**Out of scope (stays TODO):** 132 Change Battle BGM, 140 Change Vehicle BGM (matrix
assigned them M2·C-or-report; their TODO rows stay).

### What already exists (found in survey)

- `BattleAnimation`/`AnimItem` (schema, Phase 5) already model everything MV sheets need:
  `flipbook` (sheet/cols/rows/from/to/fps/scale), `flash`, `sound`, `shake`; the player
  (`src/shared/anim-player.ts`) resolves non-"icons" sheets through `env.resolveSheet` →
  the asset library, and `onSound` routes through `Sfx.play` → asset keys reach the deck.
- `Animations.json` is read at intake for SNIFFING only — `MzRawData` never stored it;
  `assembleProject` keeps the 3 engine-default animations (1 Slash · 2 Fire Burst ·
  3 Healing Light). `animationId` refs are already preserved on skills/weapons (M1·A).
- The audio deck (`src/shared/audio-deck.ts`) has BGM crossfade slots, BGS ambience
  layers (`setAmbience` + pure `ambienceDiff`), an ME bus (duck-BGM-to-20%), and a
  buffered SE path with pan/vol (`playSound`). `js/sfx.js` `Music.play(name, fadeMs)` and
  `Sfx.playAt(name, pan, vol)` route "asset:" refs to the deck.
- 241/242/250 already translate (key-only); 242's timed fade already works end-to-end.
  Fixture System already carries `victoryMe`/`defeatMe`/`gameoverMe`, but convert-system
  never stored them (matrix §1 said M1 did — it didn't; they land now).
- The interpreter node test bundles `commands/*.ts` with a stub `window.RPGAtlasDeps`;
  new audio handlers must NOT import `audio-deck.ts` (deps.js/asset-library) — they reach
  the deck via a `services.AudioDeck` surface assembled in `boot.ts` (browser-only), and
  guard its absence.

### Design decisions (locked at step start)

**D-M4B-1 — `raw.animations` + `convert-animations.ts` (pure).** Intake stores the parsed
`Animations.json` on `MzRawData`; a new pure converter turns it into
`conv.animations: BattleAnimation[]` + `conv.animationFallbacks` (MZ). `assembleProject`
replaces `p.animations` when the converted list is non-empty (imported ids can collide
with the 3 defaults, and `animationId` refs must resolve to the imported content).

**D-M4B-2 — MV sheet conversion.** Per animation: `target` from `position` (3 → "screen",
else "target"); per frame i (MV runs 15 fps → 4 ticks/frame) track the FIRST cell's
pattern; consecutive-ascending runs (holds break runs — a k-frame hold emits k one-cell
flipbooks of 4 ticks each, so total duration stays exact) → `flipbook` items
`{ at: 4·frame, sheet, cols: 5, rows: ceil((maxPattern+1)/5), from, to, fps: 15,
scale: 4·cellScale/100 }`. Patterns ≥ 100 index `animation2Name` (sheet 2, pattern−100).
Sheets become `asset:pictures/<slug(animationName)>` keys — the M2 picture pattern: one
aggregated "add the art and it appears" report line; a missing sheet draws nothing, never
crashes. `timings[]` → `flash` items (flashScope 1 target / 2 screen; color [r,g,b,a] →
hex + a/255 opacity; duration frames × 66.7 ms) and `sound` items (`asset:audio/<name>`).
Multi-cell frames, cell x/y/rotation/mirror/opacity, hue ≠ 0, and flashScope 3
(hide-target) are simplified away behind ONE aggregated "came in a little differently"
line (D11). Honest limitation (spec-logged): `rows` is derived from the highest USED
pattern — a sheet PNG with extra unused rows will show mis-scaled cells (the Animations
tab can correct cols/rows by hand).

**D-M4B-3 — MZ Effekseer fallback (D4).** The `.efkefc` file stays a locked skip. Each MZ
animation converts to `{ id, name, target: "target" }` whose items are the REAL
`flashTimings`/`soundTimings`/`quakePower` (same timing math, frame = 4 ticks; quake →
one `shake` item, power clamped 1–9), plus the particle/projectile items CLONED from the
best-matching engine-default animation — matched at `assembleProject` time (the only
place the base is in hand) by a name/element-bucket heuristic: normalized-token/synonym
buckets (fire/heal/hit vocab tables), an element hint scanned from the skills that
reference the animation, default → Slash. Base sound/flash items are dropped from the
clone when the MZ animation brings its own timings (no doubles). One report line per MZ
animation, D4 house style: `the "Fire" animation — Effekseer effects can't come across;
it now plays Atlas's "Fire Burst" animation plus your flashes and sounds`.

**D-M4B-4 — BGM options + retune.** `CmdMusic` gains optional `vol` (0–1), `pitch`
(1 = normal), `pan` (−1…1). `Music.play(name, fadeMs, opts)` passes them to
`deck.playBgm`; the deck's same-key early-return becomes a RETUNE when opts are present
(MZ replays same-BGM as a parameter update, no restart). Slots gain optional
StereoPanner + `playbackRate` (`preservesPitch = false` where supported — RM pitch shifts
speed AND pitch). Importer 241: `vol = volume/100` always (RM default 90 ⇒ 0.9 — the
honest mix), `pitch`/`pan` only when ≠ default. 242 unchanged (already real); its matrix
row just flips.

**D-M4B-5 — Save/Resume BGM (243/244).** New commands `saveBgm`/`resumeBgm`.
`G.savedBgm = { theme: Music.current, pos }` (`pos` from a new `deck.bgmPosition()`;
procedural themes save name-only and resume from the top — generative music has no
meaningful seek; spec-logged). Resume: `Music.play(theme, undefined, { seek: pos })` —
the deck seeks after metadata loads. Persisted in saves (M4·A `vehicleImages` pattern).

**D-M4B-6 — BGS channel (245/246).** New command `bgs` (`key` "" = stop, optional
`vol`/`pitch`/`pan`/`fadeMs`): sets `G.bgs`, one command-owned ambience layer merged onto
the map's list by a pure `mergeCommandBgs` helper (audio-math, vitest) at the two
`setAmbience` call sites (map load + zone reconcile). MZ replace-on-autoplay rule: a map
whose own `ambience` is non-empty clears `G.bgs` on load; native maps never have a
command BGS, so the native path is untouched. Importer: map `autoplayBgs` ambience gains
`vol = volume/100`; 245 → `bgs`, 246 → `bgs { key: "", fadeMs }`. `setAmbience` gains an
optional fade override for the stop path; layer pitch/pan apply at start only (no
retune-on-pitch — spec-logged).

**D-M4B-7 — ME channel (249, victory/defeat/gameover).** New command `me`:
`deck.playMe(key, { interrupt: true })` — interrupt PAUSES a streamed BGM element and
resumes it when the jingle ends (MZ semantics); the native duck-to-20% path is byte-
identical when `interrupt` is absent (kind-"me" assets via `playSound` keep ducking; a
procedural chiptune BGM can't pause/seek, so it ducks — spec-logged).
`convert-system` now stores `music.victory/defeat/gameover` (asset keys). Engine:
battle win plays the victory jingle (override → system) as an interrupt-ME instead of
`sysSe("levelup")`; lose plays the defeat jingle before "The party has fallen…";
`gameover.ts` plays `music.gameover` instead of `sysSe("gameover")` — every one
presence-gated (absent keys ⇒ the exact pre-M4·B calls). 133/139 → new command
`jingle { channel: "victory"|"defeat", key }` writing `G.jingles` (saved; `""` = silent,
absent = fall through to System).

**D-M4B-8 — SE options + Stop SE (250/251).** `CmdSe` gains optional `vol`/`pitch`/`pan`;
`Sfx.playAt` grows a 4th `rate` arg → `deck.playSound` sets `playbackRate`; the deck
tracks live SE sources so the new `stopSe` command (251) can stop them. Importer 250:
`vol = volume/100` always, `pitch`/`pan` when ≠ default. The positional `at:"event"`
branch and the bare `Sfx.play` path stay byte-identical when the new fields are absent.

**D-M4B-9 — services surface.** `boot.ts` adds `AudioDeck` (playMe, bgmPosition, stopSe,
applyAmbience — the merge-aware `setAmbience` wrapper) to `EngineServices`; the new
handlers live in `commands/presentation.ts` beside `music`/`se` and no-op safely when
`services.AudioDeck` is absent (keeps the node interpreter test's stub-window bundle
evaluating).

**Editor affordances:** CMD_DEFS labels + forms for `bgs`/`me`/`saveBgm`/`resumeBgm`/
`stopSe`/`jingle`, and vol/pitch/pan fields on the `music`/`se` forms. The Database ▸
Animations tab already edits imported animations (flipbook items included) — no change.

### Test plan

- vitest: new `mz-convert-animations.test.ts` (MV runs/holds/two-sheet/flash/sound/
  position/rows math; MZ fallback items + report lines; assemble replacement + bucket
  matching), `audio-math` mergeCommandBgs, SPEC-table flips in
  `mz-translate-commands.test.ts` (133/139/243/244/245/246/249/251 todo→real, 241/250
  option fields), `mz-import-db.test.ts` victory/defeat/gameover music keys +
  ambience vol.
- Fixture generator FIRST (f2ba661 lesson): add a Busker event exercising the full audio
  bill (241 opts/243/249/244/245/246/242/251/133/139), give the cave map
  `autoplayBgs` + a Drips BGS; regenerate both fixtures.
- node + Playwright suites stay at 0 failures (frozen map 1 untouched; audio/animation
  changes are all presence-gated).

### Stage log

- **2026-07-05 — M4·B started (branch `mig-4b`).** Read roadmap M4·B, matrix §10 +
  §8.9 audio rows + §1 ME rows + §2 bgm/bgs rows + the M4·B roll-up, decision D4
  (mig-0), `anim-player.ts`, `audio-deck.ts` (+ `audio-math`), `js/sfx.js` Music/playAt,
  `translate-commands.ts` TODO table, intake/assemble/convert-system/convert-maps,
  `commands/presentation.ts` + boot services + save.ts persistence patterns, the
  interpreter node test's stub-window constraint, both fixture `Animations.json`s and
  the generator. Key finds: `raw.animations` was never stored (sniff-only read);
  convert-system never stored victory/defeat/gameover ME despite the matrix's "M1
  stores" note; 242 timed fade already shipped in M1·C (row flip only); new interpreter
  handlers must reach the deck via services, not imports. Design locked above
  (D-M4B-1…9). Implementation next.

- **2026-07-05 — M4·B complete (branch `mig-4b`) — phase M4 exit, tag `mig-4`.**
  Shipped per the locked design: **animations** — `raw.animations` stored at intake; pure
  `convert-animations.ts` (MV: first-cell pattern runs → flipbook items at 15 fps over
  `asset:pictures/…` sheet keys, holds exact via one-cell runs, sheet-2 patterns ≥ 100,
  rows from top pattern, timings → flash/sound items, ONE aggregated sheet line + ONE
  simplification line; MZ: real flash/sound/quake timings + fallback markers);
  `resolveAnimationFallbacks` in `assembleProject` (exact-name → bucket → element-hint →
  hit default; borrowed base visuals skip doubled sound/flash; per-animation D4 report
  line); converted list replaces the base animations only when non-empty. **Audio** —
  deck slots grew pitch (`preservesPitch=false` playbackRate) + StereoPanner + vol;
  `playBgm` retunes same-key replays (MZ parameter-update) and seeks for Resume BGM;
  `playMe({interrupt})` pauses/resumes a streamed BGM (native duck path byte-identical;
  procedural chiptunes still duck — no seekable position); `setAmbience` fade override +
  start-time pitch/pan; SE sources tracked for `stopSe`; `bgmPosition()`;
  `Music.play(name, fadeMs, opts)` + `Sfx.playAt(…, rate)` pass-throughs (sfx.js ?v=11).
  Six new commands (`bgs`/`me`/`saveBgm`/`resumeBgm`/`stopSe`/`jingle`) via
  `services.AudioDeck` (assembled in boot.ts; handlers guard its absence for the node
  interpreter bundle); `music`/`se` handlers take vol/pitch/pan presence-gated;
  `G.bgs`/`G.savedBgm`/`G.jingles` persist in saves, reset on New Game (drive-by:
  `G.vehicleImages` now resets too); command-BGS merges onto map/zone ambience via pure
  `mergeCommandBgs`, cleared by a map's own autoplay ambience (MZ replace rule); battle
  win/lose + gameover play the victory/defeat/gameover jingles (override → System →
  classic sting). **Importer** — 241/250 carry vol/pitch/pan (defaults absent; RM 90 ⇒
  0.9), 243/244/245/246/249/251 flipped to real commands, 133/139 → `jingle`
  (keyless = silence); TODO rows dropped (132/140 stay); convert-system stores
  victory/defeat/gameover ME keys; map `autoplayBgs` ambience keeps its RM mix.
  **Editor** — CMD_DEFS labels/forms for the six commands + vol/pitch/pan knobs on
  music/se; `ME_OPTS` picker. **Fixtures** — generator adds the harbor Busker event
  (the full audio bill) + cave autoplay-BGS "Drips"; regenerated. **Tests** — new
  `mz-convert-animations.test.ts` (9) + mergeCommandBgs/ambienceDiff-pitch tests +
  SPEC-table flips + wizard animation assertions + interpreter-registry additions:
  815 vitest · 18 node · 70/70 e2e (deckState grew `meKey`; frozen map 1 untouched).
  Patch notes ?v=53. Honest limitations logged: flipbook `rows` derives from the highest
  USED pattern (sheets with extra unused rows mis-scale — fixable in the Animations tab);
  MV per-cell offsets/rotation/mirror/fades/hue and multi-cell frames simplify to one
  aggregated line; anim-SE volume/pitch/pan not carried (AnimItem.se is a bare key);
  procedural-BGM MEs duck instead of pause; BGS pitch/pan apply at layer start only;
  map autoplay BGM plays at full volume (map.music is a bare key). Pre-existing lint
  errors on main (tile-behavior-core `any`s) left untouched.

- **2026-07-05 — M4·A complete (branch `mig-4a`).** Shipped, per the locked design:
  **engine** — pure `src/shared/tile-behavior-core.ts` + glue
  `src/engine/scenes/tile-behavior.ts` (flag/terrain cache, painted-presence gate, wrap
  math); ladder facing on arrival/jump-land; bush 12px feet-fade in both render paths;
  counter third-probe in `checkActionTrigger`; damage floors (10 × floorDamage sp-param,
  optFloorDeath cap) + the mzBattleFlow-gated 20-step map regen tick (optSlipDeath cap) in
  `onPlayerStep`; terrain tags feed `locationInfo`; looping maps (wrapped tile reads,
  arrival normalization with interp-coherent coord shifts, unclamped loop-axis camera +
  wrapped buffer/sprite draws, Canvas-2D only); parallax underlay (transparent-base
  prerender, MZ origin semantics: lock 1:1 / loop half-camera + s×/2·tick drift /
  screen-fixed); battlebacks in `Battle.run` (override → map → System, back2 over back1,
  `.battlewin.hasbb`); byRegion-only encounter gate widening + empty-pool return; five new
  commands (setVehiclePos/vehicle/vehicleImage/battleback/parallax) through the registry,
  `G.vehicleImages` in saves. **Importer** — 202/206/283/284/323 flipped to real commands,
  282 → locked-skip line (matrix row amended to `−`); regionSet → `byRegion` (MZ validity:
  region pool = global ∪ region troops); scrollType → `loop`; map/System battlebacks +
  parallax (incl. `!`-lock) as `asset:pictures/…` keys with one "add the art" line each;
  autotile groups store `props.flag`; behavior/terrain report lines dropped (live now),
  partial-passage line kept; optFloorDeath/optSlipDeath onto System. **Editor** — Map
  Properties: loop checkboxes, parallax key/loop/drift/lock, battleback keys; five CMD_DEFS
  with forms. **Tests** — new `tests-unit/tile-behavior.test.ts` (8), SPEC-table flips + an
  M4·A command describe block, map-import expectations flipped (byRegion shape, group flag,
  parallax/loop/battleback fields, dropped report lines): 794 vitest · 18 node · 70/70 e2e,
  frozen map 1 untouched. Patch notes ?v=52, play.css v26. Honest limitations logged:
  HD-2D path neither loops nor draws parallax (imported maps are classic); 284 on a map
  imported without its own parallax stays invisible (opaque prerender base); pathfinding/
  minimap stay bounded on looping maps; battleback/parallax command overrides reset on map
  load (MZ-faithful for battlebacks). Fixtures already exercised the whole bill — no
  generator amendment needed.
