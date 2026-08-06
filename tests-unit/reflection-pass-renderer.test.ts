/* eslint-disable @typescript-eslint/no-explicit-any */
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { ReflectionPassRenderer } from "../src/renderer/three/reflection-pass-renderer";

function makeReflectionPass(): ReflectionPassRenderer {
  const uniforms: Record<string, { value: any }> = {
    uMVP: { value: new THREE.Matrix4() },
    uClipY: { value: new Float32Array(2) },
    uReflect: { value: null },
    uEye: { value: new Float32Array(3) },
    uFog: { value: new Float32Array(4) },
    uFogRange: { value: new Float32Array(2) },
    uAmbTint: { value: new Float32Array(3) },
    uSunDir: { value: new Float32Array(3) },
    uSunMVP: { value: new THREE.Matrix4() },
    uShadowTexel: { value: new Float32Array(2) },
    uLightPos: { value: new Float32Array(16) },
    uLightCol: { value: new Float32Array(12) },
    uShadowMap: { value: null },
    uPLMap: { value: null },
    uAmbient: { value: 0.45 },
    uLightCount: { value: 0 },
    uShadowStrength: { value: 0 },
    uPLCount: { value: 0 },
    uPLStrength: { value: 0 },
    uGlow: { value: 0 },
  };
  return new ReflectionPassRenderer({
    waterGroup: new THREE.Group(),
    dropGroup: new THREE.Group(),
    weatherGroup: new THREE.Group(),
    uniforms,
    scene: new THREE.Scene(),
    camera: new THREE.Camera(),
    clearColor: new THREE.Color(),
    multiply: (a, b) => { void b; return a; },
    multiplyInto: (out, a) => { for (let i = 0; i < 16; i++) out[i] = a[i]; },
    waterY: 3,
  });
}

describe("ReflectionPassRenderer cache", () => {
  it("reuses an unchanged reflection target and invalidates on revision or camera changes", () => {
    const rendered = { count: 0 };
    const pass = makeReflectionPass();
    const renderer = {
      setRenderTarget: () => undefined,
      setClearColor: () => undefined,
      clear: () => undefined,
      render: () => { rendered.count++; },
    } as unknown as THREE.WebGLRenderer;
    const mvp = new Float32Array(16);
    mvp[0] = 1;

    pass.render(renderer, mvp, new Float32Array([0.1, 0.1, 0.1]), 320, 180, 1);
    pass.render(renderer, mvp, new Float32Array([0.1, 0.1, 0.1]), 320, 180, 1);
    expect(rendered.count).toBe(1);

    mvp[12] = 4;
    pass.render(renderer, mvp, new Float32Array([0.1, 0.1, 0.1]), 320, 180, 1);
    pass.render(renderer, mvp, new Float32Array([0.1, 0.1, 0.1]), 320, 180, 2);
    expect(rendered.count).toBe(3);
  });
});
