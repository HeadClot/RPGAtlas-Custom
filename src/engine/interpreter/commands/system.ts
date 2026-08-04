/* RPGAtlas — src/engine/interpreter/commands/system.ts
   Map-system interpreter commands (Project Compass M2·C): the access toggles
   RM offers (Change Menu/Save/Encounter/Formation Access — 134/135/136/137),
   Change Player Followers (216), Change Window Color (138), and Get Location
   Info (285). The access flags + window-tone override live on the live game
   state so they round-trip through saves; the map-reading (region/event/tile)
   is delegated to the map runtime through the service surface so this module
   stays DOM-free. GPL-3.0-or-later (see LICENSE). */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { registerCommand, type InterpContext } from "../registry.js";

const num = (v: any): number => (typeof v === "number" ? v : Number(v) || 0);

export function registerSystemCommands(): void {
  // ---- 134/135/136/137 Change Menu/Save/Encounter/Formation Access ----
  registerCommand("access", (c: any, { state }: InterpContext) => {
    const disabled = c.enabled === false;
    if (c.kind === "menu") state.menuDisabled = disabled;
    else if (c.kind === "save") state.saveDisabled = disabled;
    else if (c.kind === "encounter") state.encounterDisabled = disabled;
    else if (c.kind === "formation") state.formationDisabled = disabled;
  });

  // ---- 216 Change Player Followers (show / hide) ----
  registerCommand("followers", (c: any, { state }: InterpContext) => {
    // Visibility is a render-time check (render-glue); the trail keeps gathering.
    state.followersHidden = c.show === false;
  });

  // ---- 138 Change Window Color ----
  registerCommand("windowTone", (c: any, { state, services }: InterpContext) => {
    const tone = Array.isArray(c.tone) ? [num(c.tone[0]), num(c.tone[1]), num(c.tone[2])] : null;
    state.windowTone = tone;
    if (services.applyWindowTone) services.applyWindowTone(tone);
  });

  // ---- 285 Get Location Info ----
  registerCommand("getLocationInfo", (c: any, { state, services }: InterpContext) => {
    if (c.varId == null) return;
    const value = services.locationInfo
      ? services.locationInfo(num(c.x), num(c.y), c.infoType)
      : 0;
    state.vars[c.varId] = value;
    if (services.refreshAllPages) services.refreshAllPages();
  });
}
