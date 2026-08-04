/* RPGAtlas — tests-unit/editor-db-bulk.test.ts
   Pure helpers behind the Database list upgrades (src/editor/database/bulk.ts,
   Phase 3 Stage E): dotted-path get/set, shared-field discovery across a
   selection, bulk numeric ops, and clone-with-fresh-ids for paste.
   GPL-3.0-or-later. */

import { describe, expect, it } from "vitest";
import {
  getPath, setPath, sharedNumericFields, applyBulk, cloneEntries,
} from "../src/editor/database/bulk";

describe("getPath / setPath", () => {
  it("reads and writes nested dotted paths, creating intermediates", () => {
    const o = {
      price: 10,
      params: { atk: 5 } as Record<string, number>,
      base: {} as Record<string, number>,
    };
    expect(getPath(o, "price")).toBe(10);
    expect(getPath(o, "params.atk")).toBe(5);
    expect(getPath(o, "params.def")).toBeUndefined();
    expect(getPath(o, "missing.deep")).toBeUndefined();
    setPath(o, "params.def", 7);
    expect(o.params.def).toBe(7);
    setPath(o, "base.mhp", 40);
    expect(o.base.mhp).toBe(40);
  });
});

describe("sharedNumericFields", () => {
  it("returns numeric paths present on every entry, excluding id", () => {
    const a = { id: 1, name: "x", price: 10, params: { atk: 5, def: 2 } };
    const b = { id: 2, name: "y", price: 20, params: { atk: 3 } };
    const shared = sharedNumericFields([a, b]);
    expect(shared).toContain("price");
    expect(shared).toContain("params.atk");
    expect(shared).not.toContain("params.def"); // only on `a`
    expect(shared).not.toContain("id");
    expect(shared).not.toContain("name");
  });
  it("is empty for no selection", () => {
    expect(sharedNumericFields([])).toEqual([]);
  });
});

describe("applyBulk", () => {
  it("sets / adds / multiplies across the selection", () => {
    const rows = () => [{ id: 1, price: 10 }, { id: 2, price: 20 }];
    let r = rows();
    expect(applyBulk(r, "price", "set", 5)).toBe(2);
    expect(r.map((e) => e.price)).toEqual([5, 5]);
    r = rows();
    applyBulk(r, "price", "add", 100);
    expect(r.map((e) => e.price)).toEqual([110, 120]);
    r = rows();
    applyBulk(r, "price", "mul", 2);
    expect(r.map((e) => e.price)).toEqual([20, 40]);
  });
  it("keeps integers integral but preserves fractional growth when value is fractional", () => {
    const ints = [{ id: 1, hp: 10 }];
    applyBulk(ints, "hp", "mul", 3);
    expect(ints[0].hp).toBe(30);
    const growth = [{ id: 1, g: 2 }];
    applyBulk(growth, "g", "mul", 1.5);
    expect(growth[0].g).toBe(3); // 2*1.5, both look integral after round
    const frac = [{ id: 1, g: 2.5 }];
    applyBulk(frac, "g", "add", 0.5);
    expect(frac[0].g).toBe(3); // fractional current → no forced rounding path
  });
  it("skips entries missing the path", () => {
    const r: Array<{ id: number; price?: number }> = [{ id: 1, price: 10 }, { id: 2 }];
    expect(applyBulk(r, "price", "add", 1)).toBe(1);
  });
});

describe("cloneEntries", () => {
  it("deep-clones and assigns fresh sequential ids after the existing max", () => {
    const existing = [{ id: 3 }, { id: 7 }];
    const src = [{ id: 1, name: "a", params: { atk: 5 } }, { id: 2, name: "b" }];
    const cloned = cloneEntries(src, existing);
    expect(cloned.map((e) => e.id)).toEqual([8, 9]);
    expect(cloned[0].name).toBe("a");
    // deep clone: mutating the clone doesn't touch the source
    cloned[0].params.atk = 99;
    expect(src[0].params.atk).toBe(5);
  });
  it("starts at 1 when the target list is empty", () => {
    expect(cloneEntries([{ id: 5 }], []).map((e) => e.id)).toEqual([1]);
  });
});
