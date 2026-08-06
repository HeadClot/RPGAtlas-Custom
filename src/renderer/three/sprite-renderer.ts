/* RPGAtlas — internal sprite and character drop-shadow pools. */
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as THREE from "three";
import type { ShaderLibrary } from "./shader-library.js";
import { ShaderMaterialFactory } from "./shader-material-factory.js";

type SpriteEntry = {
  mesh: THREE.Mesh;
  buf: THREE.InterleavedBuffer;
  mat: THREE.RawShaderMaterial;
};
type DropEntry = { mesh: THREE.Mesh; buf: THREE.InterleavedBuffer };

export interface SpriteRendererOptions {
  factory: ShaderMaterialFactory;
  shaders: ShaderLibrary;
  uniforms: Record<string, { value: any }>;
  spriteGroup: THREE.Group;
  dropGroup: THREE.Group;
  tile: number;
  onPoolExtended(): void;
}

export class SpriteRenderer {
  private readonly spriteTexCache = new WeakMap<HTMLCanvasElement, THREE.CanvasTexture>();
  private readonly spritePool: SpriteEntry[] = [];
  private readonly dropPool: DropEntry[] = [];
  private dropTexture: THREE.CanvasTexture | null = null;
  private readonly stateCanvas: Array<HTMLCanvasElement | null> = [];
  private readonly stateRx: number[] = [];
  private readonly stateRy: number[] = [];
  private readonly statePr: number[] = [];
  private lastWorldBaseX = NaN;
  private lastWorldBaseY = NaN;
  private lastSampleHeight: ((x: number, y: number) => number) | null = null;
  private lastDropShadows = false;

  constructor(private readonly options: SpriteRendererOptions) {}

  entries(): readonly SpriteEntry[] {
    return this.spritePool;
  }

  invalidate(): void {
    this.lastSampleHeight = null;
  }

  update(sprites: any[], worldBaseX: number, worldBaseY: number, dropShadows: boolean, sampleHeight: (x: number, y: number) => number): boolean {
    const { tile } = this.options;
    let needsSort = false;
    for (let i = 1; i < sprites.length; i++) {
      if (sprites[i - 1].ry > sprites[i].ry) { needsSort = true; break; }
    }
    if (needsSort) sprites.sort(compareSpriteDepth);
    let geometryChanged = sprites.length !== this.stateCanvas.length ||
      worldBaseX !== this.lastWorldBaseX || worldBaseY !== this.lastWorldBaseY ||
      sampleHeight !== this.lastSampleHeight;
    for (let i = 0; i < sprites.length && !geometryChanged; i++) {
      const sprite = sprites[i];
      geometryChanged = this.stateCanvas[i] !== sprite.canvas ||
        this.stateRx[i] !== sprite.rx || this.stateRy[i] !== sprite.ry || this.statePr[i] !== sprite.pr;
    }
    const visualChanged = geometryChanged || dropShadows !== this.lastDropShadows;
    if (!visualChanged) return false;
    for (let i = 0; i < sprites.length; i++) {
      const sprite = sprites[i];
      const pooled = this.poolSprite(i);
      const sw = sprite.canvas.width;
      const sh = sprite.canvas.height;
      const x0 = (sprite.rx - worldBaseX) * tile + (tile - sw) / 2;
      const base = sampleHeight(sprite.rx - worldBaseX, sprite.ry - worldBaseY) * tile;
      const z = (sprite.ry - worldBaseY + 1) * tile - 8 + ((sprite.pr || 1) - 1) * 6;
      this.writeBillboard(pooled.buf.array as Float32Array, x0, base + sh, z, sw, sh);
      pooled.buf.needsUpdate = true;
      pooled.mat.uniforms.uTex.value = this.textureFor(sprite.canvas);
      const bound = pooled.mesh.userData.bound as number[];
      bound[0] = x0 + sw / 2;
      bound[1] = z;
      bound[2] = Math.max(sw, sh);
      pooled.mesh.visible = true;
      if (dropShadows) {
        const drop = this.poolDrop(i);
        const dw = sw * 0.72;
        const dh = sw * 0.42;
        const cx = x0 + sw / 2;
        const cz = z - 4;
        const y = base + 1.5;
        this.writeGroundQuad(drop.buf.array as Float32Array, cx - dw / 2, y, cz - dh / 2, dw, dh);
        drop.buf.needsUpdate = true;
        drop.mesh.visible = true;
      }
    }
    for (let i = sprites.length; i < this.spritePool.length; i++) this.spritePool[i].mesh.visible = false;
    for (let i = dropShadows ? sprites.length : 0; i < this.dropPool.length; i++) {
      this.dropPool[i].mesh.visible = false;
    }
    this.stateCanvas.length = sprites.length;
    this.stateRx.length = sprites.length;
    this.stateRy.length = sprites.length;
    this.statePr.length = sprites.length;
    for (let i = 0; i < sprites.length; i++) {
      this.stateCanvas[i] = sprites[i].canvas;
      this.stateRx[i] = sprites[i].rx;
      this.stateRy[i] = sprites[i].ry;
      this.statePr[i] = sprites[i].pr;
    }
    this.lastWorldBaseX = worldBaseX;
    this.lastWorldBaseY = worldBaseY;
    this.lastSampleHeight = sampleHeight;
    this.lastDropShadows = dropShadows;
    return geometryChanged;
  }

  private textureFor(canvas: HTMLCanvasElement): THREE.CanvasTexture {
    let texture = this.spriteTexCache.get(canvas);
    if (!texture) {
      texture = this.options.factory.makeTexture(canvas);
      this.spriteTexCache.set(canvas, texture);
    }
    return texture;
  }

  private poolSprite(index: number): SpriteEntry {
    while (this.spritePool.length <= index) {
      const { geo, buf } = this.options.factory.batchGeometry(new Array(36).fill(0), true);
      const mat = this.options.factory.sceneMaterial(null as any);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false;
      mesh.matrixAutoUpdate = false;
      mesh.userData.bound = [0, 0, 0];
      this.options.spriteGroup.add(mesh);
      this.spritePool.push({ mesh, buf, mat });
      this.options.onPoolExtended();
    }
    return this.spritePool[index];
  }

  private poolDrop(index: number): DropEntry {
    this.ensureDropTexture();
    while (this.dropPool.length <= index) {
      const { geo, buf } = this.options.factory.batchGeometry(new Array(36).fill(0), true);
      const material = new THREE.RawShaderMaterial({
        vertexShader: this.options.shaders.WATER_VS,
        fragmentShader: this.options.shaders.DROP_FS,
        uniforms: { uMVP: this.options.uniforms.uMVP, uTex: { value: this.dropTexture } },
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
      const mesh = new THREE.Mesh(geo, material);
      mesh.frustumCulled = false;
      mesh.matrixAutoUpdate = false;
      this.options.dropGroup.add(mesh);
      this.dropPool.push({ mesh, buf });
    }
    return this.dropPool[index];
  }

  private ensureDropTexture(): void {
    if (this.dropTexture) return;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 64;
    const context = canvas.getContext("2d")!;
    const gradient = context.createRadialGradient(32, 32, 2, 32, 32, 30);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.7, "rgba(255,255,255,0.55)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 64, 64);
    this.dropTexture = this.options.factory.makeTexture(canvas);
    this.dropTexture.magFilter = THREE.LinearFilter;
    this.dropTexture.minFilter = THREE.LinearFilter;
  }

  private writeBillboard(a: Float32Array, x0: number, yTop: number, z: number, w: number, h: number, tint = 1): void {
    const x1 = x0 + w;
    const yBottom = yTop - h;
    let i = 0;
    a[i++] = x0; a[i++] = yTop; a[i++] = z; a[i++] = 0; a[i++] = 0; a[i++] = tint;
    a[i++] = x1; a[i++] = yTop; a[i++] = z; a[i++] = 1; a[i++] = 0; a[i++] = tint;
    a[i++] = x0; a[i++] = yBottom; a[i++] = z; a[i++] = 0; a[i++] = 1; a[i++] = tint;
    a[i++] = x0; a[i++] = yBottom; a[i++] = z; a[i++] = 0; a[i++] = 1; a[i++] = tint;
    a[i++] = x1; a[i++] = yTop; a[i++] = z; a[i++] = 1; a[i++] = 0; a[i++] = tint;
    a[i++] = x1; a[i++] = yBottom; a[i++] = z; a[i++] = 1; a[i++] = 1; a[i++] = tint;
  }

  private writeGroundQuad(a: Float32Array, x0: number, y: number, z0: number, w: number, h: number, tint = 1): void {
    const x1 = x0 + w;
    const z1 = z0 + h;
    let i = 0;
    a[i++] = x0; a[i++] = y; a[i++] = z0; a[i++] = 0; a[i++] = 0; a[i++] = tint;
    a[i++] = x1; a[i++] = y; a[i++] = z0; a[i++] = 1; a[i++] = 0; a[i++] = tint;
    a[i++] = x0; a[i++] = y; a[i++] = z1; a[i++] = 0; a[i++] = 1; a[i++] = tint;
    a[i++] = x0; a[i++] = y; a[i++] = z1; a[i++] = 0; a[i++] = 1; a[i++] = tint;
    a[i++] = x1; a[i++] = y; a[i++] = z0; a[i++] = 1; a[i++] = 0; a[i++] = tint;
    a[i++] = x1; a[i++] = y; a[i++] = z1; a[i++] = 1; a[i++] = 1; a[i++] = tint;
  }
}

function compareSpriteDepth(a: any, b: any): number {
  return a.ry - b.ry;
}
