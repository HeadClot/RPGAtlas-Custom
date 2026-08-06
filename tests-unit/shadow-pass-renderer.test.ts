/* eslint-disable @typescript-eslint/no-explicit-any */
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { ShadowPassRenderer } from "../src/renderer/three/shadow-pass-renderer";

function makeShadowPass(config: { pointShadows: number }): ShadowPassRenderer {
  const uniforms = {
    uSunMVP: { value: new THREE.Matrix4() },
    uShadowMap: { value: null },
    uShadowStrength: { value: 0 },
    uShadowTexel: { value: new Float32Array(2) },
    uPLMap: { value: null },
    uPLCount: { value: 0 },
    uPLStrength: { value: 0 },
    uLightPos: { value: new Float32Array([0, 8, 0, 64]) },
    uLightCol: { value: new Float32Array([1, 1, 1]) },
  };
  return new ShadowPassRenderer({
    shaders: { DEPTH_VS: "", DEPTH_FS: "" } as any,
    uniforms,
    lightPos: uniforms.uLightPos.value,
    lightCol: uniforms.uLightCol.value,
    depthMVP: { value: new THREE.Matrix4() },
    scene: new THREE.Scene(),
    camera: new THREE.Camera(),
    terrainGroup: new THREE.Group(),
    spriteGroup: new THREE.Group(),
    overheadGroup: new THREE.Group(),
    waterGroup: new THREE.Group(),
    dropGroup: new THREE.Group(),
    weatherGroup: new THREE.Group(),
    tile: 48,
    maxPointLights: 4,
    pointFace: 16,
    pointNear: 6,
    pointWidth: 48,
    pointHeight: 128,
    perspective: () => new THREE.Matrix4().toArray(),
    lookAt: () => new THREE.Matrix4().toArray(),
    multiply: () => new THREE.Matrix4().toArray(),
    ortho: () => new THREE.Matrix4().toArray(),
    getConfig: () => config,
  });
}

function fakeRenderer(rendered: { count: number }): THREE.WebGLRenderer {
  return {
    compile: () => undefined,
    setRenderTarget: () => undefined,
    clear: () => undefined,
    render: () => { rendered.count++; },
  } as any;
}

describe("ShadowPassRenderer readiness", () => {
  it("publishes disabled point shadows as ready without an atlas frame", () => {
    const pass = makeShadowPass({ pointShadows: 0 });
    pass.reset(0);
    expect(pass.revision).toBe(1);
    expect(pass.ready).toBe(true);
    expect(pass.frameId).toBe(0);
  });

  it("requires an atlas frame and then a consumed scene frame", () => {
    const pass = makeShadowPass({ pointShadows: 1 });
    const rendered = { count: 0 };
    const renderer = fakeRenderer(rendered);
    pass.reset(1);

    pass.renderPointPass(renderer, 1, false);
    expect(pass.frameId).toBe(1);
    expect(pass.sceneFrameId).toBe(0);
    expect(pass.ready).toBe(false);
    expect(pass.programsReady).toBe(true);
    expect(rendered.count).toBe(6);

    pass.markSceneFrame(1);
    expect(pass.sceneFrameId).toBe(1);
    expect(pass.ready).toBe(true);
    pass.renderPointPass(renderer, 1, false);
    expect(pass.frameId).toBe(2);
    expect(pass.ready).toBe(true);
    expect(rendered.count).toBe(6);

    pass.invalidateCasters();
    pass.renderPointPass(renderer, 1, false);
    expect(pass.frameId).toBe(3);
    expect(pass.ready).toBe(false);
    expect(rendered.count).toBe(12);

    pass.markSceneFrame(1);
    expect(pass.sceneFrameId).toBe(3);
    expect(pass.ready).toBe(true);
  });
});
