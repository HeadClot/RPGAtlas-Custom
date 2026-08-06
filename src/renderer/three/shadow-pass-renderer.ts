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
  lookAt(eyeX: number, eyeY: number, eyeZ: number, targetX: number, targetY: number, targetZ: number): number[];
  multiply(a: number[], b: number[]): number[];
  ortho(left: number, right: number, bottom: number, top: number, near: number, far: number): number[];
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
  private pointKey = "";

  constructor(options: ShadowPassOptions) {
    this.options = options;
  }

  get revision(): number { return this.pointRevision; }
  get frameId(): number { return this.pointFrameId; }
  get sceneFrameId(): number { return this.pointSceneFrameId; }
  get ready(): boolean { return this.pointReady; }
  get programsReady(): boolean { return this.pointProgramsReady; }
  get uniforms(): Record<string, { value: any }> { return this.options.uniforms; }
  get maxPointLights(): number { return this.options.maxPointLights; }

  invalidatePrograms(): void { this.pointProgramsReady = false; }

  reset(pointShadows: number): void {
    this.pointRevision++;
    this.pointFrameId = 0;
    this.pointSceneFrameId = 0;
    this.pointReady = pointShadows <= 0;
    this.pointProgramsReady = false;
    this.pointKey = "";
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
    const view = lookAt(cx + dir[0] * dist, cy + dir[1] * dist, cz + dir[2] * dist, cx, cy, cz);
    let l = Infinity, r = -Infinity, b = Infinity, t = -Infinity, zMin = Infinity, zMax = -Infinity;
    for (const x of [0, wpx]) {
      for (const y of [0, top]) {
        for (const z of [0, hpx]) {
          const vx = view[0] * x + view[4] * y + view[8] * z + view[12];
          const vy = view[1] * x + view[5] * y + view[9] * z + view[13];
          const vz = view[2] * x + view[6] * y + view[10] * z + view[14];
          l = Math.min(l, vx); r = Math.max(r, vx); b = Math.min(b, vy); t = Math.max(t, vy);
          zMin = Math.min(zMin, vz); zMax = Math.max(zMax, vz);
        }
      }
    }
    const pad = tile;
    uniforms.uSunMVP.value.fromArray(multiply(ortho(l - pad, r + pad, b - pad, t + pad, -zMax - pad, -zMin + pad), view));
  }

  renderSun(renderer: THREE.WebGLRenderer, strengthScale = 1): void {
    this.ensureShadowTarget();
    const { uniforms, depthMVP, scene, camera } = this.options;
    depthMVP.value.copy(uniforms.uSunMVP.value);
    this.withDepthMaterials(() => {
      renderer.setRenderTarget(this.shadowRT);
      renderer.clear(true, true, false);
      renderer.render(scene, camera);
    });
    uniforms.uShadowMap.value = this.shadowRT!.depthTexture;
    uniforms.uShadowStrength.value = this.options.getConfig().shadows * strengthScale;
  }

  renderPoint(renderer: THREE.WebGLRenderer, count: number): void {
    this.ensurePointTarget();
    this.withDepthMaterials((meshes) => {
      const { pointWidth, pointHeight, pointFace, pointNear, tile, uniforms, depthMVP, scene, camera, lightPos } = this.pointInputs();
      this.pointRT!.viewport.set(0, 0, pointWidth, pointHeight);
      renderer.setRenderTarget(this.pointRT);
      renderer.clear(true, true, false);
      const hidden: THREE.Mesh[] = [];
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
          if (out) { mesh.visible = false; hidden.push(mesh); }
        }
        const proj = this.options.perspective(Math.PI / 2, 1, pointNear, range);
        for (let f = 0; f < 6; f++) {
          const [R, Uv, F] = PL_FACES[f];
          depthMVP.value.fromArray(this.options.multiply(proj, faceView(R, Uv, F, lx, ly, lz)));
          this.pointRT!.viewport.set((f % 3) * pointFace, (i * 2 + (f < 3 ? 0 : 1)) * pointFace, pointFace, pointFace);
          renderer.setRenderTarget(this.pointRT);
          renderer.render(scene, camera);
        }
        for (const mesh of hidden) mesh.visible = true;
        hidden.length = 0;
      }
      this.pointRT!.viewport.set(0, 0, pointWidth, pointHeight);
      uniforms.uPLMap.value = this.pointRT!.depthTexture;
    });
    this.options.uniforms.uPLStrength.value = this.options.getConfig().pointShadows;
  }

  renderPointPass(renderer: THREE.WebGLRenderer, count: number, trace: boolean): number {
    const uniforms = this.options.uniforms;
    const { lightPos, lightCol } = this.pointInputs();
    const nextKey = count > 0
      ? [count, ...Array.from({ length: count }, (_, i) => [
        lightPos[i * 4], lightPos[i * 4 + 1], lightPos[i * 4 + 2], lightPos[i * 4 + 3],
        lightCol[i * 3], lightCol[i * 3 + 1], lightCol[i * 3 + 2],
      ].join(","))].join(";")
      : "none";
    if (nextKey !== this.pointKey) {
      this.pointRevision++;
      this.pointKey = nextKey;
      this.pointReady = false;
      this.pointSceneFrameId = 0;
    } else if (count > 0 && this.pointFrameId > 0 && this.pointSceneFrameId === this.pointFrameId) {
      this.pointReady = true;
    } else if (count === 0) this.pointReady = true;
    this.ensurePointTarget();
    uniforms.uPLMap.value = this.pointRT!.depthTexture;
    if (count <= 0) return 0;
    this.ensurePrograms(renderer);
    const start = trace ? performance.now() : 0;
    this.renderPoint(renderer, count);
    this.pointFrameId++;
    return trace ? performance.now() - start : 0;
  }

  markSceneFrame(count: number): void {
    if (count > 0) this.pointSceneFrameId = this.pointFrameId;
  }

  private pointInputs(): { lightPos: Float32Array; lightCol: Float32Array; uniforms: Record<string, { value: any }>; depthMVP: { value: THREE.Matrix4 }; scene: THREE.Scene; camera: THREE.Camera; pointWidth: number; pointHeight: number; pointFace: number; pointNear: number; tile: number } {
    return {
      lightPos: this.options.lightPos,
      lightCol: this.options.lightCol,
      uniforms: this.options.uniforms,
      depthMVP: this.options.depthMVP,
      scene: this.options.scene,
      camera: this.options.camera,
      pointWidth: this.options.pointWidth,
      pointHeight: this.options.pointHeight,
      pointFace: this.options.pointFace,
      pointNear: this.options.pointNear,
      tile: this.options.tile,
    };
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
    const { terrainGroup, spriteGroup, overheadGroup, waterGroup, dropGroup, weatherGroup } = this.options;
    const swapped: Array<[THREE.Mesh, THREE.Material | THREE.Material[]]> = [];
    const meshes: THREE.Mesh[] = [];
    for (const group of [terrainGroup, spriteGroup, overheadGroup]) {
      for (const child of group.children) {
        const mesh = child as THREE.Mesh;
        if (!mesh.visible) continue;
        swapped.push([mesh, mesh.material]); meshes.push(mesh); mesh.material = this.depthMaterial(mesh);
      }
    }
    const wasVisible: Array<[THREE.Group, boolean]> = [];
    for (const group of [waterGroup, dropGroup, weatherGroup]) { wasVisible.push([group, group.visible]); group.visible = false; }
    try { fn(meshes); } finally {
      for (const [group, visible] of wasVisible) group.visible = visible;
      for (const [mesh, material] of swapped) mesh.material = material;
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

function faceView(R: number[], up: number[], forward: number[], px: number, py: number, pz: number): number[] {
  return [
    R[0], up[0], -forward[0], 0, R[1], up[1], -forward[1], 0, R[2], up[2], -forward[2], 0,
    -(R[0] * px + R[1] * py + R[2] * pz), -(up[0] * px + up[1] * py + up[2] * pz),
    forward[0] * px + forward[1] * py + forward[2] * pz, 1,
  ];
}
