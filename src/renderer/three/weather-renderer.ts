/* RPGAtlas — internal deterministic GPU weather particle renderer. */
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as THREE from "three";
import type { ShaderLibrary } from "./shader-library.js";

export const WEATHER_COUNTS: Record<string, [number, number]> = {
  rain: [0, 700],
  snow: [1, 420],
  motes: [2, 140],
};

export interface WeatherRendererOptions {
  shaders: ShaderLibrary;
  uniforms: Record<string, { value: any }>;
  group: THREE.Group;
}

export class WeatherRenderer {
  private readonly uniforms;
  private mesh: THREE.Mesh | null = null;
  private readonly maxParticles = 800;

  constructor(private readonly options: WeatherRendererOptions) {
    this.uniforms = {
      uMVP: options.uniforms.uMVP,
      uTime: options.uniforms.uTime,
      uArea: { value: new Float32Array(4) },
      uWCount: { value: 0 },
      uWMode: { value: 0 },
    };
  }

  update(weather: string, motionScale: any, centerX: number, centerZ: number, halfWidth: number, halfHeight: number): void {
    if (!weather || !WEATHER_COUNTS[weather]) {
      if (this.mesh) this.mesh.visible = false;
      return;
    }
    this.ensureMesh();
    const [mode, count] = WEATHER_COUNTS[weather];
    this.uniforms.uWMode.value = mode;
    const scale = motionScale == null ? 1 : Number(motionScale) || 1;
    this.uniforms.uWCount.value = Math.max(1, Math.round(count * scale));
    this.uniforms.uArea.value[0] = centerX;
    this.uniforms.uArea.value[1] = centerZ;
    this.uniforms.uArea.value[2] = halfWidth;
    this.uniforms.uArea.value[3] = halfHeight;
    this.mesh!.visible = true;
  }

  private ensureMesh(): void {
    if (this.mesh) return;
    let seed = 48271;
    const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0), seed / 4294967296);
    const corners = [-0.5, -0.5, 0.5, -0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5];
    const data = new Float32Array(this.maxParticles * 6 * 6);
    let offset = 0;
    for (let i = 0; i < this.maxParticles; i++) {
      const s0 = random();
      const s1 = random();
      const s2 = random();
      for (let v = 0; v < 6; v++) {
        data[offset++] = s0;
        data[offset++] = s1;
        data[offset++] = s2;
        data[offset++] = corners[v * 2];
        data[offset++] = corners[v * 2 + 1];
        data[offset++] = i;
      }
    }
    const geometry = new THREE.BufferGeometry();
    const buffer = new THREE.InterleavedBuffer(data, 6);
    const seedAttribute = new THREE.InterleavedBufferAttribute(buffer, 3, 0);
    geometry.setAttribute("aSeed", seedAttribute);
    geometry.setAttribute("position", seedAttribute);
    geometry.setAttribute("aCorner", new THREE.InterleavedBufferAttribute(buffer, 2, 3));
    geometry.setAttribute("aId", new THREE.InterleavedBufferAttribute(buffer, 1, 5));
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), Infinity);
    const material = new THREE.RawShaderMaterial({
      vertexShader: this.options.shaders.WEATHER_VS,
      fragmentShader: this.options.shaders.WEATHER_FS,
      uniforms: this.uniforms,
    });
    material.glslVersion = THREE.GLSL3;
    material.blending = THREE.CustomBlending;
    material.blendEquation = THREE.AddEquation;
    material.blendSrc = THREE.OneFactor;
    material.blendDst = THREE.OneMinusSrcAlphaFactor;
    material.depthTest = true;
    material.depthWrite = false;
    material.side = THREE.DoubleSide;
    material.transparent = false;
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = false;
    this.options.group.add(this.mesh);
  }
}
