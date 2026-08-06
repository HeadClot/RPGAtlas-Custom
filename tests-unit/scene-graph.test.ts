import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { ThreeSceneGraph } from "../src/renderer/three/scene-graph";

describe("ThreeSceneGraph incremental culling", () => {
  it("restores only meshes hidden by the active visual cull", () => {
    const graph = new ThreeSceneGraph(4);
    const inside = new THREE.Mesh();
    inside.userData.rect = { x0: 0, z0: 0, x1: 48, z1: 48 };
    const outside = new THREE.Mesh();
    outside.userData.rect = { x0: 5000, z0: 5000, x1: 5048, z1: 5048 };
    graph.terrainGroup.add(inside, outside);

    graph.setViewCull(0, 0, 96, 96, 48, true);
    expect(inside.visible).toBe(true);
    expect(outside.visible).toBe(false);

    graph.setViewCull(0, 0, 0, 0, 48, false);
    expect(inside.visible).toBe(true);
    expect(outside.visible).toBe(true);
  });
});
