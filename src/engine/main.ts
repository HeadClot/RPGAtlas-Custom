/* RPGAtlas — src/engine/main.ts
   Player runtime entry point. Vite serves this natively in dev (with HMR) and
   bundles it through the HTML pipeline for `vite build`; the same source is
   bundled to a single-file IIFE (player-bundle.js) for the standalone export.

   Phase 1 Stage B dissolved the engine.js monolith into typed modules under
   src/engine/; boot.ts is the composition root (it wires the services and
   runs the DOM-ready boot on evaluation). The classic scripts loaded before
   this module in play.html / the standalone export (assets, renderer,
   runtime/messages, runtime/input, sfx, plugins, data, quests, journal-view)
   still populate window.RPGAtlasDeps and the factory globals, read through
   src/shared/deps.ts. GPL-3.0-or-later (see LICENSE). */

// Side-effect import: boot.ts wires the engine and boots on evaluation.
import "./boot.js";
