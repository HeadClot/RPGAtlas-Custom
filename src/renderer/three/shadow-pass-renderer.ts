/* RPGAtlas — internal sun and point-light shadow passes. */
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as THREE from "three";
import type { ShaderLibrary } from "./shader-library.js";

export interface ShadowPassOptions {
  shaders: ShaderLibrary;
  uniforms: Record<string, { value: any }>;
  lightPos: Float32Array;
  lightCol: Float32Array;
  depthMVP: { value: THREE.Matrix4 };
  scene: THREE.Scene;
  camera: THREE.Camera;
  terrainGroup: THREE.Group;
  spriteGroup: THREE.Group;
  overheadGroup: THREE.Group;
  waterGroup: THREE.Group;
  dropGroup: THREE.Group;
  weatherGroup: THREE.Group;
  tile: number;
  maxPointLights: number;
  pointFace: number;
  pointNear: number;
  pointWidth: number;
  pointHeight: number;
  perspective(fov: number, aspect: number, near: number, far: number): number[];
  perspectiveInto?(out: number[] | Float32Array, fov: number, aspect: number, near: number, far: number): void;
  lookAt(eyeX: number, eyeY: number, eyeZ: number, targetX: number, targetY: number, targetZ: number): number[];
  lookAtInto?(out: number[] | Float32Array, eyeX: number, eyeY: number, eyeZ: number, targetX: number, targetY: number, targetZ: number): void;
  multiply(a: number[], b: number[]): number[];
  multiplyInto?(out: number[] | Float32Array, a: ArrayLike<number>, b: ArrayLike<number>): void;
  ortho(left: number, right: number, bottom: number, top: number, near: number, far: number): number[];
  orthoInto?(out: number[] | Float32Array, left: number, right: number, bottom: number, top: number, near: number, far: number): void;
  getConfig(): any;
}

export class ShadowPassRenderer {
  private readonly options: ShadowPassOptions;
  private shadowRT: THREE.WebGLRenderTarget | null = null;
  private pointRT: THREE.WebGLRenderTarget | null = null;
  private pointRevision = 0;
  private pointFrameId = 0;
  private pointSceneFrameId = 0;
  private pointReady = false;
  private pointProgramsReady = false;
  private pointKeyCount = -1;
  private pointKeyValid = false;
  private readonly pointKeyPos: Float32Array;
  private readonly pointKeyCol: Float32Array;
  private casterRevisionValue = 0;
  private renderedCasterRevision = -1;
  private pointRenderedCasterRevision = -1;
  private sunRevision = 0;
  private renderedSunRevision = -1;
  private readonly sunView = new Float32Array(16);
  private readonly sunProjection = new Float32Array(16);
  private readonly sunMVP = new Float32Array(16);
  private readonly pointProjection = new Float32Array(16);
  private readonly pointFaceView = new Float32Array(16);
  private readonly pointMVP = new Float32Array(16);
  private readonly depthMeshes: THREE.Mesh[] = [];
  private readonly swappedMaterials: Array<[THREE.Mesh, THREE.Material | THREE.Material[]]> = [];
  private readonly hiddenMeshes: THREE.Mesh[] = [];
  private readonly hiddenGroups: Array<[THREE.Group, boolean]> = [];
  private readonly depthGroups: THREE.Group[];
  private readonly disabledGroups: THREE.Group[];

  constructor(options: ShadowPassOptions) {
    this.options = options;
    this.pointKeyPos = new Float32Array(options.maxPointLights * 4);
    this.pointKeyCol = new Float32Array(options.maxPointLights * 3);
    this.depthGroups = [options.terrainGroup, options.spriteGroup, options.overheadGroup];
    this.disabledGroups = [options.waterGroup, options.dropGroup, options.weatherGroup];
  }

  get revision(): number { return this.pointRevision; }
  get frameId(): number { return this.pointFrameId; }
  get sceneFrameId(): number { return this.pointSceneFrameId; }
  get casterRevision(): number { return this.casterRevisionValue; }
  get ready(): boolean { return this.pointReady; }
  get programsReady(): boolean { return this.pointProgramsReady; }
  get uniforms(): Record<string, { value: any }> { return this.options.uniforms; }
  get maxPointLights(): number { return this.options.maxPointLights; }

  invalidatePrograms(): void { this.pointProgramsReady = false; }

  invalidateCasters(): void {
    this.casterRevisionValue++;
    this.pointReady = false;
    this.pointSceneFrameId = 0;
  }

  reset(pointShadows: number): void {
    this.casterRevisionValue++;
    this.pointRevision++;
    this.pointFrameId = 0;
    this.pointSceneFrameId = 0;
    this.pointReady = pointShadows <= 0;
    this.pointProgramsReady = false;
    this.pointKeyCount = -1;
    this.pointKeyValid = false;
    this.renderedCasterRevision = -1;
    this.pointRenderedCasterRevision = -1;
    this.renderedSunRevision = -1;
  }

  resetContext(pointShadows: number): void {
    this.shadowRT?.dispose();
    this.pointRT?.dispose();
    this.shadowRT = null;
    this.pointRT = null;
    this.reset(pointShadows);
  }

  fitSunCamera(map: any, sun: any): void {
    const { tile, uniforms, lookAt, multiply, ortho } = this.options;
    const azDeg = sun && Number.isFinite(Number(sun.azimuth)) ? Number(sun.azimuth) : 35;
    const elDeg = Math.min(85, Math.max(15, sun && Number.isFinite(Number(sun.elevation)) ? Number(sun.elevation) : 55));
    const az = (azDeg * Math.PI) / 180, el = (elDeg * Math.PI) / 180;
    const dir = [Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)];
    let maxH = 0;
    if (map.heights) for (const v of map.heights) if (v > maxH) maxH = Number(v);
    const wpx = map.width * tile, hpx = map.height * tile, top = (maxH + 2) * tile;
    const cx = wpx / 2, cy = top / 2, cz = hpx / 2;
    const dist = Math.hypot(wpx, top, hpx);
    if (this.options.lookAtInto) this.options.lookAtInto(this.sunView, cx + dir[0] * dist, cy + dir[1] * dist, cz + dir[2] * dist, cx, cy, cz);
    else this.sunView.set(lookAt(cx + dir[0] * dist, cy + dir[1] * dist, cz + dir[2] * dist, cx, cy, cz));
    let l = Infinity, r = -Infinity, b = Infinity, t = -Infinity, zMin = Infinity, zMax = -Infinity;
    for (const x of [0, wpx]) {
      for (const y of [0, top]) {
        for (const z of [0, hpx]) {
          const vx = this.sunView[0] * x + this.sunView[4] * y + this.sunView[8] * z + this.sunView[12];
          const vy = this.sunView[1] * x + this.sunView[5] * y + this.sunView[9] * z + this.sunView[13];
          const vz = this.sunView[2] * x + this.sunView[6] * y + this.sunView[10] * z + this.sunView[14];
          l = Math.min(l, vx); r = Math.max(r, vx); b = Math.min(b, vy); t = Math.max(t, vy);
          zMin = Math.min(zMin, vz); zMax = Math.max(zMax, vz);
        }
      }
    }
    const pad = tile;
    if (this.options.orthoInto) this.options.orthoInto(this.sunProjection, l - pad, r + pad, b - pad, t + pad, -zMax - pad, -zMin + pad);
    else this.sunProjection.set(ortho(l - pad, r + pad, b - pad, t + pad, -zMax - pad, -zMin + pad));
    if (this.options.multiplyInto) this.options.multiplyInto(this.sunMVP, this.sunProjection, this.sunView);
    else this.sunMVP.set(multiply(this.sunProjection as unknown as number[], this.sunView as unknown as number[]));
    uniforms.uSunMVP.value.fromArray(this.sunMVP);
    this.sunRevision++;
  }

  renderSun(renderer: THREE.WebGLRenderer, strengthScale = 1): void {
    this.ensureShadowTarget();
    const { uniforms, depthMVP, scene, camera } = this.options;
    if (this.renderedCasterRevision !== this.casterRevisionValue || this.renderedSunRevision !== this.sunRevision) {
      depthMVP.value.copy(uniforms.uSunMVP.value);
      this.withDepthMaterials(() => {
        renderer.setRenderTarget(this.shadowRT);
        renderer.clear(true, true, false);
        renderer.render(scene, camera);
      });
      this.renderedCasterRevision = this.casterRevisionValue;
      this.renderedSunRevision = this.sunRevision;
    }
    uniforms.uShadowMap.value = this.shadowRT!.depthTexture;
    uniforms.uShadowStrength.value = this.options.getConfig().shadows * strengthScale;
  }

  renderPoint(renderer: THREE.WebGLRenderer, count: number): void {
    this.ensurePointTarget();
    this.withDepthMaterials((meshes) => {
      const { pointWidth, pointHeight, pointFace, pointNear, tile, uniforms, depthMVP, scene, camera, lightPos } = this.options;
      this.pointRT!.viewport.set(0, 0, pointWidth, pointHeight);
      renderer.setRenderTarget(this.pointRT);
      renderer.clear(true, true, false);
      this.hiddenMeshes.length = 0;
      for (let i = 0; i < count; i++) {
        const lx = lightPos[i * 4], ly = lightPos[i * 4 + 1], lz = lightPos[i * 4 + 2];
        const range = Math.max(lightPos[i * 4 + 3], pointNear * 2);
        for (const mesh of meshes) {
          const ud = mesh.userData;
          let out = false;
          if (ud.rect) {
            const dx = Math.max(ud.rect.x0 - lx, 0, lx - ud.rect.x1);
            const dz = Math.max(ud.rect.z0 - lz, 0, lz - ud.rect.z1);
            out = Math.hypot(dx, dz) > range + tile;
          } else if (ud.bound) out = Math.hypot(ud.bound[0] - lx, ud.bound[1] - lz) - ud.bound[2] > range + tile;
          if (out) { mesh.visible = false; this.hiddenMeshes.push(mesh); }
        }
        if (this.options.perspectiveInto) this.options.perspectiveInto(this.pointProjection, Math.PI / 2, 1, pointNear, range);
        else this.pointProjection.set(this.options.perspective(Math.PI / 2, 1, pointNear, range));
        for (let f = 0; f < 6; f++) {
          const [R, Uv, F] = PL_FACES[f];
          faceViewInto(this.pointFaceView, R, Uv, F, lx, ly, lz);
          if (this.options.multiplyInto) this.options.multiplyInto(this.pointMVP, this.pointProjection, this.pointFaceView);
          else this.pointMVP.set(this.options.multiply(this.pointProjection as unknown as number[], this.pointFaceView as unknown as number[]));
          depthMVP.value.fromArray(this.pointMVP);
          this.pointRT!.viewport.set((f % 3) * pointFace, (i * 2 + (f < 3 ? 0 : 1)) * pointFace, pointFace, pointFace);
          renderer.setRenderTarget(this.pointRT);
          renderer.render(scene, camera);
        }
        for (let j = 0; j < this.hiddenMeshes.length; j++) this.hiddenMeshes[j].visible = true;
        this.hiddenMeshes.length = 0;
      }
      this.pointRT!.viewport.set(0, 0, pointWidth, pointHeight);
      uniforms.uPLMap.value = this.pointRT!.depthTexture;
    });
    this.options.uniforms.uPLStrength.value = this.options.getConfig().pointShadows;
  }

  renderPointPass(renderer: THREE.WebGLRenderer, count: number, trace: boolean): number {
    const uniforms = this.options.uniforms;
    const { lightPos, lightCol } = this.options;
    let keyChanged = count !== this.pointKeyCount || !this.pointKeyValid;
    if (!keyChanged) {
      for (let i = 0; i < count * 4 && !keyChanged; i++) keyChanged = this.pointKeyPos[i] !== lightPos[i];
      for (let i = 0; i < count * 3 && !keyChanged; i++) keyChanged = this.pointKeyCol[i] !== lightCol[i];
    }
    if (keyChanged) {
      this.pointRevision++;
      this.pointKeyCount = count;
      this.pointKeyValid = true;
      for (let i = 0; i < count * 4; i++) this.pointKeyPos[i] = lightPos[i];
      for (let i = 0; i < count * 3; i++) this.pointKeyCol[i] = lightCol[i];
      this.pointReady = false;
      this.pointSceneFrameId = 0;
    } else if (count > 0 && this.pointFrameId > 0 && this.pointSceneFrameId === this.pointFrameId) {
      this.pointReady = true;
    } else if (count === 0) this.pointReady = true;
    this.ensurePointTarget();
    uniforms.uPLMap.value = this.pointRT!.depthTexture;
    if (count <= 0) return 0;
    const needsRender = keyChanged || this.pointRenderedCasterRevision !== this.casterRevisionValue || this.pointFrameId === 0;
    if (!needsRender) {
      this.pointFrameId++;
      return 0;
    }
    this.ensurePrograms(renderer);
    const start = trace ? performance.now() : 0;
    this.renderPoint(renderer, count);
    this.pointFrameId++;
    this.pointRenderedCasterRevision = this.casterRevisionValue;
    return trace ? performance.now() - start : 0;
  }

  markSceneFrame(count: number): void {
    if (count <= 0) return;
    this.pointSceneFrameId = this.pointFrameId;
    if (this.pointFrameId > 0 && this.pointRenderedCasterRevision === this.casterRevisionValue) {
      this.pointReady = true;
    }
  }

  private ensureShadowTarget(): void {
    if (this.shadowRT) return;
    const res = 2048;
    this.shadowRT = new THREE.WebGLRenderTarget(res, res, {
      minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
      wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping,
      format: THREE.RGBAFormat, type: THREE.UnsignedByteType, colorSpace: THREE.NoColorSpace,
      depthBuffer: true, stencilBuffer: false, generateMipmaps: false,
    });
    const dt = new THREE.DepthTexture(res, res);
    dt.format = THREE.DepthFormat; dt.type = THREE.UnsignedIntType;
    this.shadowRT.depthTexture = dt;
    this.options.uniforms.uShadowTexel.value[0] = 1 / res;
    this.options.uniforms.uShadowTexel.value[1] = 1 / res;
  }

  private ensurePointTarget(): void {
    if (this.pointRT) return;
    const { pointWidth, pointHeight } = this.options;
    this.pointRT = new THREE.WebGLRenderTarget(pointWidth, pointHeight, {
      minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
      wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping,
      format: THREE.RGBAFormat, type: THREE.UnsignedByteType, colorSpace: THREE.NoColorSpace,
      depthBuffer: true, stencilBuffer: false, generateMipmaps: false,
    });
    const dt = new THREE.DepthTexture(pointWidth, pointHeight);
    dt.format = THREE.DepthFormat; dt.type = THREE.UnsignedIntType;
    this.pointRT.depthTexture = dt;
  }

  private depthMaterial(mesh: THREE.Mesh): THREE.RawShaderMaterial {
    let material = mesh.userData.depthMat as THREE.RawShaderMaterial | undefined;
    if (!material) {
      material = new THREE.RawShaderMaterial({
        vertexShader: this.options.shaders.DEPTH_VS,
        fragmentShader: this.options.shaders.DEPTH_FS,
        uniforms: { uDepthMVP: this.options.depthMVP, uTex: (mesh.material as any).uniforms.uTex },
      });
      material.glslVersion = THREE.GLSL3; material.blending = THREE.NoBlending;
      material.depthTest = true; material.depthWrite = true; material.side = THREE.DoubleSide;
      mesh.userData.depthMat = material;
    }
    return material;
  }

  private withDepthMaterials(fn: (swapped: THREE.Mesh[]) => void): void {
    this.swappedMaterials.length = 0;
    this.depthMeshes.length = 0;
    for (const group of this.depthGroups) {
      for (const child of group.children) {
        const mesh = child as THREE.Mesh;
        if (!mesh.visible) continue;
        this.swappedMaterials.push([mesh, mesh.material]);
        this.depthMeshes.push(mesh);
        mesh.material = this.depthMaterial(mesh);
      }
    }
    this.hiddenGroups.length = 0;
    for (const group of this.disabledGroups) {
      this.hiddenGroups.push([group, group.visible]);
      group.visible = false;
    }
    try { fn(this.depthMeshes); } finally {
      for (const [group, visible] of this.hiddenGroups) group.visible = visible;
      for (const [mesh, material] of this.swappedMaterials) mesh.material = material;
    }
  }

  private ensurePrograms(renderer: THREE.WebGLRenderer): void {
    if (this.pointProgramsReady) return;
    this.withDepthMaterials(() => renderer.compile(this.options.scene, this.options.camera));
    renderer.compile(this.options.scene, this.options.camera);
    this.pointProgramsReady = true;
  }
}

const PL_FACES: Array<[number[], number[], number[]]> = [
  [[0, 0, -1], [0, 1, 0], [1, 0, 0]], [[0, 0, 1], [0, 1, 0], [-1, 0, 0]],
  [[1, 0, 0], [0, 0, 1], [0, 1, 0]], [[1, 0, 0], [0, 0, -1], [0, -1, 0]],
  [[1, 0, 0], [0, 1, 0], [0, 0, 1]], [[-1, 0, 0], [0, 1, 0], [0, 0, -1]],
];

function faceViewInto(
  out: number[] | Float32Array,
  R: number[], up: number[], forward: number[],
  px: number, py: number, pz: number,
): void {
  out[0] = R[0]; out[1] = up[0]; out[2] = -forward[0]; out[3] = 0;
  out[4] = R[1]; out[5] = up[1]; out[6] = -forward[1]; out[7] = 0;
  out[8] = R[2]; out[9] = up[2]; out[10] = -forward[2]; out[11] = 0;
  out[12] = -(R[0] * px + R[1] * py + R[2] * pz);
  out[13] = -(up[0] * px + up[1] * py + up[2] * pz);
  out[14] = forward[0] * px + forward[1] * py + forward[2] * pz;
  out[15] = 1;
}
