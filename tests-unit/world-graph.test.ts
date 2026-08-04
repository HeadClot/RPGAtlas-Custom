/* RPGAtlas — tests-unit/world-graph.test.ts
   The pure World-View graph core (src/shared/world-graph.ts, Phase 3 Stage E):
   transfer collection through nested branches, directed-edge aggregation,
   deterministic layout, and drag-to-relink retargeting. GPL-3.0-or-later. */

import { describe, expect, it } from "vitest";
import {
  collectTransfers, buildWorldGraph, autoLayout, retargetEdge,
} from "../src/shared/world-graph";

// A tiny fixture: three maps. Map 1 → 2 (twice, one nested in an if), 1 → 3,
// 2 → 1, plus a self-transfer on 2 and a dangling transfer to a missing map 9.
function fixture() {
  return [
    {
      id: 1, name: "Village", width: 24, height: 17,
      events: [
        { id: 1, name: "Door", pages: [{ commands: [{ t: "transfer", mapId: 2, x: 3, y: 4 }] }] },
        { id: 2, name: "Gate", pages: [{ commands: [
          { t: "if", cond: {}, then: [{ t: "transfer", mapId: 2, x: 1, y: 1 }], else: [{ t: "transfer", mapId: 3, x: 5, y: 5 }] },
        ] }] },
      ],
    },
    {
      id: 2, name: "Cave", width: 16, height: 12,
      events: [
        { id: 1, name: "Exit", pages: [{ commands: [
          { t: "choices", options: ["a", "b"], branches: [
            [{ t: "transfer", mapId: 1, x: 12, y: 12 }],
            [{ t: "transfer", mapId: 2, x: 2, y: 2 }],   // self-loop
          ] },
          { t: "transfer", mapId: 9, x: 0, y: 0 },        // dangling
        ] }] },
      ],
    },
    { id: 3, name: "Cottage", width: 10, height: 8, events: [] },
  ];
}

describe("collectTransfers", () => {
  it("finds transfers nested inside if/choices branches", () => {
    const maps = fixture();
    const t1 = collectTransfers(maps[0]);
    expect(t1.map((t) => t.toMapId).sort()).toEqual([2, 2, 3]);
    expect(t1.every((t) => t.fromMapId === 1)).toBe(true);
    const t2 = collectTransfers(maps[1]);
    expect(t2.map((t) => t.toMapId).sort()).toEqual([1, 2, 9]);
    expect(t2.find((t) => t.toMapId === 1)!.eventName).toBe("Exit");
  });
  it("tolerates a map with no events", () => {
    expect(collectTransfers({ id: 3, events: [] })).toEqual([]);
    expect(collectTransfers({ id: 3 })).toEqual([]);
  });
});

describe("buildWorldGraph", () => {
  it("aggregates directed edges with counts, skips self-loops, flags danglers", () => {
    const g = buildWorldGraph(fixture());
    expect(g.nodes.map((n) => n.id)).toEqual([1, 2, 3]);
    const edge = (from: number, to: number) => g.edges.find((e) => e.from === from && e.to === to);
    expect(edge(1, 2)!.count).toBe(2);
    expect(edge(1, 3)!.count).toBe(1);
    expect(edge(2, 1)!.count).toBe(1);
    expect(edge(2, 2)).toBeUndefined();         // self-loop excluded
    expect(g.dangling.map((d) => d.toMapId)).toEqual([9]);
  });
  it("returns an empty graph for no maps", () => {
    expect(buildWorldGraph([])).toEqual({ nodes: [], edges: [], dangling: [] });
  });
});

describe("autoLayout", () => {
  it("is deterministic and lays connected maps out in BFS columns", () => {
    const g = buildWorldGraph(fixture());
    const a = autoLayout(g);
    const b = autoLayout(g);
    expect(a).toEqual(b);                        // deterministic
    expect(a[1]).toEqual({ x: 0, y: 0 });        // root (lowest id) at origin
    expect(a[2].x).toBe(1);                      // one hop from the root
    expect(a[3].x).toBe(1);
    // siblings in the same column get distinct rows
    expect(a[2].y).not.toBe(a[3].y);
  });
  it("stacks disconnected components on separate rows", () => {
    const maps = [
      { id: 1, name: "A", events: [] },
      { id: 2, name: "B", events: [] },
    ];
    const pos = autoLayout(buildWorldGraph(maps));
    expect(pos[1]).toEqual({ x: 0, y: 0 });
    expect(pos[2]).toEqual({ x: 0, y: 1 });
  });
});

describe("retargetEdge", () => {
  it("rewrites only the transfers of the given source→target pair", () => {
    const maps = fixture();
    const changed = retargetEdge(maps[0], 2, 3); // Village: all →2 become →3
    expect(changed).toBe(2);
    const g = buildWorldGraph(maps);
    expect(g.edges.find((e) => e.from === 1 && e.to === 2)).toBeUndefined();
    expect(g.edges.find((e) => e.from === 1 && e.to === 3)!.count).toBe(3);
    // map 2's transfers are untouched
    expect(collectTransfers(maps[1]).map((t) => t.toMapId).sort()).toEqual([1, 2, 9]);
  });
});
