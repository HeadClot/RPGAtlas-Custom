/* RPGAtlas — tests-unit/sample-maps.test.ts
   Anti-rot gate for the sample-map library (Maps panel 🗺 button). Pulls the
   real tile-key set out of js/assets.js (same source-regex approach as
   i18n-parity.test.ts) and asserts every sample layout builds cleanly: rows
   are rectangular, every character has a legend entry, every legend entry
   names a real tile, and the built map has the exact newMap shape the editor
   and engine expect. GPL-3.0-or-later. */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  SAMPLE_MAPS, SHARED_LEGEND, buildSampleMap,
} from "../src/editor/map-editor/sample-map-data";

// Real tile keys, in definition order (index = tile id, so "empty" is 0 —
// exactly how Assets.T is built from the tiles array).
const assetsSrc = readFileSync(join(__dirname, "..", "js", "assets.js"), "utf8");
const tileKeys = [...assetsSrc.matchAll(/defTile\("([a-z0-9_]+)"/g)].map((m) => m[1]);
const T: Record<string, number> = {};
tileKeys.forEach((k, i) => { T[k] = i; });

const MUSIC_THEMES = new Set(["title", "town", "field", "cave", "battle", "gameover"]);

describe("sample-map library", () => {
  it("found the real tile table in js/assets.js", () => {
    expect(tileKeys.length).toBeGreaterThan(40);
    expect(tileKeys[0]).toBe("empty");
  });

  it("shared legend only references real tiles", () => {
    for (const [ch, ref] of Object.entries(SHARED_LEGEND)) {
      if (ref.g) expect(T[ref.g], `legend "${ch}" ground "${ref.g}"`).toBeGreaterThan(0);
      if (ref.d) expect(T[ref.d], `legend "${ch}" decor "${ref.d}"`).toBeGreaterThan(0);
    }
  });

  it("sample keys and names are unique", () => {
    const keys = SAMPLE_MAPS.map((s) => s.key);
    const names = SAMPLE_MAPS.map((s) => s.name);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(names).size).toBe(names.length);
  });

  it("offers a plethora of samples", () => {
    expect(SAMPLE_MAPS.length).toBeGreaterThanOrEqual(10);
  });

  for (const def of SAMPLE_MAPS) {
    describe(`"${def.name}" (${def.key})`, () => {
      it("has a description and a built-in music theme", () => {
        expect(def.desc.length).toBeGreaterThan(10);
        expect(MUSIC_THEMES.has(def.music), `music "${def.music}"`).toBe(true);
      });

      it("is rectangular with every character in the legend", () => {
        const width = def.rows[0].length;
        const legend = { ...SHARED_LEGEND, ...(def.legend || {}) };
        def.rows.forEach((row, y) => {
          expect(row.length, `row ${y}`).toBe(width);
          for (const ch of row) {
            if (ch === ".") continue;
            expect(legend[ch], `row ${y} char "${ch}"`).toBeDefined();
          }
        });
        for (const [ch, ref] of Object.entries(def.legend || {})) {
          if (ref.g) expect(T[ref.g], `legend "${ch}" ground "${ref.g}"`).toBeGreaterThan(0);
          if (ref.d) expect(T[ref.d], `legend "${ch}" decor "${ref.d}"`).toBeGreaterThan(0);
        }
      });

      it("builds a map with the full newMap shape", () => {
        const m = buildSampleMap(def, 42, T, 1);
        const n = m.width * m.height;
        expect(m.id).toBe(42);
        expect(m.name).toBe(def.name);
        expect(m.width).toBe(def.rows[0].length);
        expect(m.height).toBe(def.rows.length);
        for (const layer of ["ground", "decor", "decor2", "over"] as const) {
          expect(m.layers[layer].length, layer).toBe(n);
        }
        for (const arr of ["shadows", "passOv", "heights", "regions"] as const) {
          expect(m[arr].length, arr).toBe(n);
        }
        expect(m.events).toEqual([]);
        expect(m.encounters).toEqual({ troops: [], rate: 0 });
        // no tile of the ground layer may be empty (id 0) — every cell painted
        expect(m.layers.ground.every((tid: number) => tid > 0)).toBe(true);
      });
    });
  }
});
