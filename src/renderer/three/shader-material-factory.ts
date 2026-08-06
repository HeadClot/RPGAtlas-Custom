/* RPGAtlas — internal parity-preserving material, texture, and geometry factory. */
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as THREE from "three";
import type { ShaderLibrary } from "./shader-library.js";

type AuxTextures = { mat: THREE.Texture; emis: THREE.Texture };

export class ShaderMaterialFactory {
  constructor(
    private readonly shaders: ShaderLibrary,
    private readonly uniforms: Record<string, { value: any }>,
    private readonly getConfig: () => any,
  ) {}

  sceneMaterial(tex: THREE.Texture, aux?: AuxTextures | null): THREE.RawShaderMaterial {
    const cfg = this.getConfig();
    const m = new THREE.RawShaderMaterial({
      vertexShader: this.shaders.SCENE_VS,
      fragmentShader: this.shaders.SCENE_FS,
      uniforms: aux
        ? { ...this.uniforms, uTex: { value: tex }, uMatMap: { value: aux.mat }, uEmisMap: { value: aux.emis } }
        : { ...this.uniforms, uTex: { value: tex } },
    });
    if (cfg.shadows > 0) m.defines.SHADOWS = 1;
    if (cfg.pointShadows > 0) m.defines.POINT_SHADOWS = 1;
    if (cfg.water > 0) m.defines.CLIPY = 1;
    if (cfg.dayNight) m.defines.DAYNIGHT = 1;
    if (aux) m.defines.MATERIALS = 1;
    m.glslVersion = THREE.GLSL3;
    m.blending = THREE.CustomBlending;
    m.blendEquation = THREE.AddEquation;
    m.blendSrc = THREE.OneFactor;
    m.blendDst = THREE.OneMinusSrcAlphaFactor;
    m.depthTest = true;
    m.depthWrite = true;
    m.depthFunc = THREE.LessEqualDepth;
    m.transparent = false;
    m.side = THREE.DoubleSide;
    return m;
  }

  waterMaterial(tex: THREE.Texture, chunkW: number, chunkH: number): THREE.RawShaderMaterial {
    const cfg = this.getConfig();
    const m = new THREE.RawShaderMaterial({
      vertexShader: this.shaders.WATER_VS,
      fragmentShader: this.shaders.WATER_FS,
      uniforms: {
        ...this.uniforms,
        uTex: { value: tex },
        uChunkPx: { value: new Float32Array([chunkW, chunkH]) },
      },
    });
    m.glslVersion = THREE.GLSL3;
    if (cfg.dayNight) m.defines.DAYNIGHT = 1;
    m.blending = THREE.CustomBlending;
    m.blendEquation = THREE.AddEquation;
    m.blendSrc = THREE.OneFactor;
    m.blendDst = THREE.OneMinusSrcAlphaFactor;
    m.depthTest = true;
    m.depthWrite = true;
    m.depthFunc = THREE.LessEqualDepth;
    m.transparent = false;
    m.side = THREE.DoubleSide;
    return m;
  }

  postMaterial(fragmentShader: string, uniforms: Record<string, { value: any }>): THREE.RawShaderMaterial {
    const m = new THREE.RawShaderMaterial({
      vertexShader: this.shaders.POST_VS,
      fragmentShader,
      uniforms,
    });
    m.glslVersion = THREE.GLSL3;
    m.blending = THREE.NoBlending;
    m.depthTest = false;
    m.depthWrite = false;
    m.side = THREE.DoubleSide;
    return m;
  }

  makeTexture(srcCanvas: HTMLCanvasElement): THREE.CanvasTexture {
    const texture = new THREE.CanvasTexture(srcCanvas);
    texture.flipY = false;
    texture.premultiplyAlpha = true;
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.generateMipmaps = false;
    texture.colorSpace = THREE.NoColorSpace;
    return texture;
  }

  batchGeometry(verts: number[], dynamic = false): { geo: THREE.BufferGeometry; buf: THREE.InterleavedBuffer } {
    const geo = new THREE.BufferGeometry();
    const buf = new THREE.InterleavedBuffer(new Float32Array(verts), 6);
    if (dynamic) buf.setUsage(THREE.DynamicDrawUsage);
    const pos = new THREE.InterleavedBufferAttribute(buf, 3, 0);
    geo.setAttribute("aPos", pos);
    geo.setAttribute("position", pos);
    geo.setAttribute("aUV", new THREE.InterleavedBufferAttribute(buf, 2, 3));
    geo.setAttribute("aTint", new THREE.InterleavedBufferAttribute(buf, 1, 5));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), Infinity);
    return { geo, buf };
  }

  batchMesh(verts: number[], tex: THREE.Texture, aux?: AuxTextures | null): THREE.Mesh {
    const { geo } = this.batchGeometry(verts);
    const mesh = new THREE.Mesh(geo, this.sceneMaterial(tex, aux));
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false;
    return mesh;
  }
}
