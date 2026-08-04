/* RPGAtlas — src/engine/state/window-tone.ts
   Live window-colour override for the Change Window Color command (Project
   Compass M2·C, RM 138). Writes the same four CSS variables play.css reads as
   boot's applyScreenSettings, so a recolour takes effect immediately and a
   reset (tone null) restores the project's System-tab window colour. The
   override lives on the save (G.windowTone) so a loaded game looks right.
   GPL-3.0-or-later (see LICENSE). */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { RA } from "../../shared/deps.js";
import { ctx } from "./engine-context.js";

const hex2 = (n: any): string =>
  ("0" + Math.max(0, Math.min(255, Math.round(Number(n) || 0))).toString(16)).slice(-2);

/** Apply a live `[r,g,b]` window-colour, or restore the project default when
 *  `tone` is null/absent. No-op before the stage exists (e.g. Node tests). */
export function applyWindowTone(tone: any): void {
  const stage = ctx.stage;
  if (!stage || !stage.style || !RA || typeof RA.windowColorPalette !== "function") return;
  const hex = Array.isArray(tone)
    ? "#" + hex2(tone[0]) + hex2(tone[1]) + hex2(tone[2])
    : (ctx.proj && ctx.proj.system.windowColor);
  const pal = RA.windowColorPalette(hex);
  stage.style.setProperty("--win-top-rgb", pal.top);
  stage.style.setProperty("--win-bottom-rgb", pal.bottom);
  stage.style.setProperty("--win-name-top-rgb", pal.nameTop);
  stage.style.setProperty("--win-name-bottom-rgb", pal.nameBottom);
}
