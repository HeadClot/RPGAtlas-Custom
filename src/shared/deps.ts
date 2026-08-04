/* RPGAtlas — src/shared/deps.ts
   The single sanctioned bridge to the classic-script globals that the engine
   modules read. play.html (and the inlined standalone export) load the classic
   scripts — assets, renderer, runtime/messages, runtime/input, sfx, plugins,
   data, quests, journal-view — before src/engine/main.ts, populating
   window.RPGAtlasDeps and a handful of factory globals. NO other module under
   src/engine touches window.RPGAtlasDeps directly; they import from here.

   Phase 1 keeps these views `any`-heavy: the typed project schema and typed
   service surfaces land in Stage D. GPL-3.0-or-later (see LICENSE). */

/* eslint-disable @typescript-eslint/no-explicit-any */

// The classic scripts run before this module is evaluated, so the globals are
// present at import time. Cast through `any` — the window shape is untyped this
// phase.
const w = window as any;

const RPGAtlasDeps: any = w.RPGAtlasDeps;

/** Sprite/tile/asset helpers (js/assets.js). */
export const Assets: any = RPGAtlasDeps.Assets;
/** Project defaults + newProject() (js/data.js). */
export const DataDefaults: any = RPGAtlasDeps.DataDefaults;
/** Music playback (js/sfx.js). */
export const Music: any = RPGAtlasDeps.Music;
/** RPGAtlas data helpers — byId, traits, input bindings, migration (js/data.js). */
export const RA: any = RPGAtlasDeps.RA;
/** Sound effects (js/sfx.js). */
export const Sfx: any = RPGAtlasDeps.Sfx;

/** Message-window/typewriter factory (js/runtime/messages.js). */
export const createMessageSystem: any = w.createMessageSystem;
/** Unified keyboard+gamepad input factory (js/runtime/input.js). */
export const createInputSystem: any = w.createInputSystem;

/** Quest runtime factory (js/quests.js). */
export const RPGAtlasQuests: any = w.RPGAtlasQuests;
/** In-game journal view factory (js/journal-view.js). */
export const RPGAtlasJournalView: any = w.RPGAtlasJournalView;
