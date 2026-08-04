/* RPGAtlas — src/editor/main.ts
   Editor entry point. Vite serves this natively in dev (with HMR) and bundles
   it through the HTML pipeline for `vite build`.

   Phase 1 Stage C dissolved the editor.js monolith into typed ES modules under
   src/editor/**. boot.ts is the composition root: importing it evaluates the
   whole module graph and boots the editor on DOMContentLoaded. It reads
   window.RPGAtlasDeps (populated by the classic <script> tags in index.html)
   through editor-state.ts, and still uses the classic js/editor/*.js and
   js/patch-notes.js helpers, which stay in place this phase.
   GPL-3.0-or-later (see LICENSE). */

// Side-effect import: boot.ts wires the editor and boots it on evaluation.
import "./boot";
