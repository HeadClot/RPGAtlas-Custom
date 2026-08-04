/* RPGAtlas — src/editor/importers/mz/assemble.ts
   Project Compass M1·B: fold a converted MZ/MV project onto an Atlas project
   base. The base is an injected `DataDefaults.newProject()` (js/data.js) — passed
   in rather than imported so this module stays DOM-free and node/vitest-testable
   (newProject lives on `window`). M1·D calls it in the browser with a real fresh
   project; the boot e2e and unit tests pass one in too.

   The converted System patch (A6) overlays the base's engine defaults (input
   bindings, screenScale, sound/music channels) so nothing plumbing-critical is
   lost; converted collections replace the sample content; the engine's default
   plugin list stays first, with the plugin converter's RM add-on shells
   (credits + settings kept, original code inert) appended after it. Battle
   animations replace the defaults when the source had any (M4·B) — MZ
   Effekseer entries resolve their visual fallback HERE, against the base's
   animations, before the swap (D4). `project.assets.tiles` gains
   this import's pre-assigned tile ids, so the map layers resolve to the real
   art once M1·D slices the tileset images into those keys.
   Copyright (C) 2026 RPGAtlas contributors — GPL-3.0-or-later (see LICENSE). */

import type { Project } from "../../../shared/schema";
import type { MzProjectConversion } from "./index";
import { resolveAnimationFallbacks } from "./convert-animations";

/** Overlay a converted MZ/MV project onto a fresh Atlas project `base`
 *  (`DataDefaults.newProject()`). Mutates and returns `base`. */
export function assembleProject(base: Project, conv: MzProjectConversion): Project {
  const p = base as Project & { assets: { tiles?: Record<string, number> } };

  // FORMAT_VERSION stays 2 (decision D2); the importer writes v2 projects.
  p.meta = { ...p.meta, formatVersion: 2 };

  // System: overlay the converted patch on the base's engine defaults. Music is
  // MERGED (keep default channels, add imported title/battle asset keys); every
  // other converted field replaces its default.
  const sys = conv.db.system;
  p.system = {
    ...p.system,
    ...sys,
    music: { ...(p.system as { music?: Record<string, string> }).music, ...(sys.music || {}) },
  };

  // Converted database records replace the sample content.
  p.actors = conv.db.actors;
  p.classes = conv.db.classes;
  p.skills = conv.db.skills;
  p.states = conv.db.states;
  p.items = conv.db.items;
  p.weapons = conv.db.weapons;
  p.armors = conv.db.armors;
  p.enemies = conv.db.enemies;
  p.troops = conv.db.troops;
  p.commonEvents = conv.db.commonEvents;

  // Battle animations (M4·B): MZ Effekseer entries borrow the nearest base
  // animation's visuals (D4) before the converted list replaces the defaults.
  // A source with no Animations.json keeps the engine defaults.
  if (conv.db.animations && conv.db.animations.length) {
    resolveAnimationFallbacks(p.animations || [], conv.db.animations, conv.animationFallbacks || [], conv.report);
    p.animations = conv.db.animations;
  }

  // Maps, tilesets, autotiles, folders (M1·B). A source with no readable map
  // files keeps the base's starter map — an empty `maps[]` can't boot, and the
  // wizard commits `maps[0]` as the current map.
  if (conv.maps.length) {
    p.maps = conv.maps;
  } else {
    conv.report.bump("no-maps", () => ({
      area: "Maps", kind: "partial", what: "your game's maps",
      detail: "no map files were found in the project's data folder, so Atlas gave you a starter map — check that the folder you picked has Map001.json and friends inside data",
    }));
  }
  if (conv.tilesets.length) p.tilesets = conv.tilesets;
  if (conv.autotiles.length) p.autotiles = conv.autotiles;
  if (conv.mapFolders.length) p.mapFolders = conv.mapFolders;

  // Pre-assigned plain-tile ids → project.assets.tiles (M1·D reuses them).
  p.assets = p.assets || ({ tiles: {} } as Project["assets"]);
  p.assets.tiles = { ...(p.assets.tiles || {}), ...conv.assetTiles };

  // An imported project starts with no Atlas sample quests.
  p.quests = [];

  // The plugin converter's shells join the Plugin Manager AFTER the engine's
  // bundled plugins (built-ins keep running first). Fresh ids continue from
  // whatever the base already holds; RM load order is preserved.
  if (conv.convertedPlugins && conv.convertedPlugins.length) {
    p.plugins = p.plugins || [];
    let nextId = p.plugins.reduce((m, pl) => Math.max(m, Number(pl.id) || 0), 0) + 1;
    for (const cp of conv.convertedPlugins) p.plugins.push({ ...cp.entry, id: nextId++ });
  }

  return p;
}
