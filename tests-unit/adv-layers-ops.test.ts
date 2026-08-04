/* RPGAtlas — tests-unit/adv-layers-ops.test.ts
   The pure Advanced-editor stack operations (src/editor/advanced/adv-state.ts,
   Phase 8 Stage B): promote-on-first-edit, add tile layer / group, group /
   ungroup, reorder, delete (cores protected), patch, nested lookup. These back
   the Layers panel and must keep the one-core-per-role invariant intact.
   GPL-3.0-or-later. */

import { describe, expect, it } from "vitest";
import type { AdvLayer } from "../src/shared/schema";
import { CORE_ROLES } from "../src/shared/layer-view";
import {
  ensureLayersAdv, findLayer, addTileLayer, addGroup, groupLayer,
  ungroupLayer, deleteLayer, moveLayer, patchLayer,
} from "../src/editor/advanced/adv-state";

const mkMap = (w = 2, h = 2) => ({
  width: w, height: h,
  layers: { ground: [], decor: [], decor2: [], over: [] } as Record<string, number[]>,
  layersAdv: undefined as AdvLayer[] | undefined,
});
const roles = (m: { layersAdv?: AdvLayer[] }) =>
  (m.layersAdv ?? []).flatMap((l) => (l.type === "core" ? [l.role] : []));

describe("ensureLayersAdv", () => {
  it("promotes a classic map to the four cores in order, idempotently", () => {
    const m = mkMap();
    expect(m.layersAdv).toBeUndefined();
    const stack = ensureLayersAdv(m);
    expect(roles(m)).toEqual(CORE_ROLES);
    expect(ensureLayersAdv(m)).toBe(stack); // no re-promotion
  });

  it("repairs a damaged stored stack (missing core reinserted)", () => {
    const m = mkMap();
    m.layersAdv = [{ id: 1, name: "decor", type: "core", role: "decor" }] as AdvLayer[];
    ensureLayersAdv(m);
    expect(roles(m).slice().sort()).toEqual([...CORE_ROLES].sort());
  });
});

describe("addTileLayer / addGroup", () => {
  it("adds a tile layer at the top with a full-size data array and unique id", () => {
    const m = mkMap(3, 2);
    const id = addTileLayer(m, "Mist");
    const hit = findLayer(m.layersAdv!, id)!;
    const l = hit.list[hit.index];
    expect(l.type).toBe("tile");
    if (l.type === "tile") {
      expect(l.data).toHaveLength(6);
      expect(l.slot).toBe("below");
    }
    // top of the stack = end of the array (render order bottom → top)
    expect(m.layersAdv![m.layersAdv!.length - 1].id).toBe(id);
    const idsAreUnique = new Set(m.layersAdv!.map((x) => x.id)).size === m.layersAdv!.length;
    expect(idsAreUnique).toBe(true);
  });

  it("adds an empty group", () => {
    const m = mkMap();
    const id = addGroup(m, "Town");
    const l = findLayer(m.layersAdv!, id)!.list.at(-1)!;
    expect(l.type).toBe("group");
    if (l.type === "group") expect(l.children).toEqual([]);
  });
});

describe("group / ungroup", () => {
  it("wraps a layer in a group in place, then dissolves it back", () => {
    const m = mkMap();
    const tid = addTileLayer(m, "Fog");
    const gid = groupLayer(m, tid, "Grp")!;
    // the tile now lives inside the group at its old slot
    const g = findLayer(m.layersAdv!, gid)!;
    const grp = g.list[g.index];
    expect(grp.type).toBe("group");
    if (grp.type === "group") expect(grp.children[0].id).toBe(tid);
    ungroupLayer(m, gid);
    expect(findLayer(m.layersAdv!, gid)).toBeNull();
    expect(findLayer(m.layersAdv!, tid)).not.toBeNull();
  });
});

describe("deleteLayer", () => {
  it("removes a tile layer but never a core", () => {
    const m = mkMap();
    const tid = addTileLayer(m, "X");
    expect(deleteLayer(m, tid)).toBe(true);
    expect(findLayer(m.layersAdv!, tid)).toBeNull();
    const groundId = m.layersAdv!.find((l) => l.type === "core" && l.role === "ground")!.id;
    expect(deleteLayer(m, groundId)).toBe(false);
    expect(findLayer(m.layersAdv!, groundId)).not.toBeNull();
  });
});

describe("moveLayer", () => {
  it("reorders within the sibling list and clamps at the ends", () => {
    const m = mkMap();
    const a = addTileLayer(m, "A"); // now on top
    const before = m.layersAdv!.map((l) => l.id);
    expect(moveLayer(m, a, 1)).toBe(false); // already top-most
    expect(moveLayer(m, a, -1)).toBe(true); // down one
    expect(m.layersAdv!.map((l) => l.id)).not.toEqual(before);
    expect(m.layersAdv!.at(-1)!.type).toBe("core"); // the over core rose back to top
  });
});

describe("patchLayer", () => {
  it("assigns editable props in place", () => {
    const m = mkMap();
    const id = addTileLayer(m, "Y");
    patchLayer(m, id, { opacity: 0.4, blend: "add", visible: false });
    const l = findLayer(m.layersAdv!, id)!.list.at(-1)!;
    expect(l).toMatchObject({ opacity: 0.4, blend: "add", visible: false });
  });
});
