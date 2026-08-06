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

  constructor(private readonly options: SpriteRendererOptions) {}

  entries(): readonly SpriteEntry[] {
    return this.spritePool;
  }

  update(sprites: any[], worldBaseX: number, worldBaseY: number, dropShadows: boolean, sampleHeight: (x: number, y: number) => number): void {
    const { tile } = this.options;
    sprites.sort((a, b) => a.ry - b.ry);
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
    const put = (x: number, y: number, u: number, v: number) => {
      a[i++] = x; a[i++] = y; a[i++] = z; a[i++] = u; a[i++] = v; a[i++] = tint;
    };
    put(x0, yTop, 0, 0); put(x1, yTop, 1, 0); put(x0, yBottom, 0, 1);
    put(x0, yBottom, 0, 1); put(x1, yTop, 1, 0); put(x1, yBottom, 1, 1);
  }

  private writeGroundQuad(a: Float32Array, x0: number, y: number, z0: number, w: number, h: number, tint = 1): void {
    const x1 = x0 + w;
    const z1 = z0 + h;
    let i = 0;
    const put = (x: number, z: number, u: number, v: number) => {
      a[i++] = x; a[i++] = y; a[i++] = z; a[i++] = u; a[i++] = v; a[i++] = tint;
    };
    put(x0, z0, 0, 0); put(x1, z0, 1, 0); put(x0, z1, 0, 1);
    put(x0, z1, 0, 1); put(x1, z0, 1, 0); put(x1, z1, 1, 1);
  }
}
