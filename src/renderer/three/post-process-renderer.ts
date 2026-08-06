/* RPGAtlas — internal post-processing and render-target ownership. */
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as THREE from "three";
import type { ShaderLibrary } from "./shader-library.js";
import { ShaderMaterialFactory } from "./shader-material-factory.js";

type TargetSet = {
  w: number;
  h: number;
  hw: number;
  hh: number;
  fx: boolean;
  scene: THREE.WebGLRenderTarget;
  half: THREE.WebGLRenderTarget[];
  post: THREE.WebGLRenderTarget | null;
};

export interface PostProcessFrame {
  cfg: any;
  width: number;
  height: number;
  near: number;
  far: number;
  distance: number;
  eye: ArrayLike<number>;
  extra: any;
  worldBaseX: number;
  worldBaseY: number;
  tile: number;
  fov: number;
  sampleHeight(rx: number, ry: number): number;
  perfTraceEnabled: boolean;
}

export class PostProcessRenderer {
  readonly frame = {} as PostProcessFrame;
  private targetsValue: TargetSet | null = null;
  private readonly camera: THREE.Camera;
  private readonly fov: number;
  private readonly postGeo: THREE.BufferGeometry;
  private readonly brightU = { uTex: { value: null as any }, uThreshold: { value: 0 } };
  private readonly blurU = { uTex: { value: null as any }, uDir: { value: new Float32Array(2) } };
  private readonly compU = {
    uScene: { value: null as any },
    uBlurScene: { value: null as any },
    uBlurBright: { value: null as any },
    uDepth: { value: null as any },
    uAO: { value: null as any },
    uBloom: { value: 0 },
    uDof: { value: 0 },
    uFocusDist: { value: 0 },
    uFocusRange: { value: 1 },
    uNearFar: { value: new Float32Array([1, 2]) },
    uSsao: { value: 0 },
    uAces: { value: 0 },
    uVignette: { value: 0 },
    uGradeOn: { value: 0 },
    uGradeM: { value: new THREE.Matrix3() },
    uGradeB: { value: new Float32Array(3) },
  };
  private readonly aoU = {
    uDepth: { value: null as any },
    uNearFar: { value: new Float32Array([1, 2]) },
    uInvSize: { value: new Float32Array(2) },
    uProjScale: { value: 1 },
  };
  private readonly fxaaU = {
    uTex: { value: null as any },
    uInvSize: { value: new Float32Array(2) },
  };
  private readonly brightScene: THREE.Scene;
  private readonly blurScene: THREE.Scene;
  private readonly compScene: THREE.Scene;
  private readonly aoScene: THREE.Scene;
  private readonly fxaaScene: THREE.Scene;

  constructor(
    private readonly materials: ShaderMaterialFactory,
    shaders: ShaderLibrary,
    camera: THREE.Camera,
    fov: number,
  ) {
    this.camera = camera;
    this.fov = fov;
    this.postGeo = new THREE.BufferGeometry();
    const postPos = new THREE.BufferAttribute(new Float32Array([-1, -1, 3, -1, -1, 3]), 2);
    this.postGeo.setAttribute("aPos", postPos);
    this.postGeo.setAttribute("position", postPos);
    this.postGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), Infinity);
    this.brightScene = this.passScene(shaders.BRIGHT_FS, this.brightU);
    this.blurScene = this.passScene(shaders.BLUR_FS, this.blurU);
    this.compScene = this.passScene(shaders.COMP_FS, this.compU);
    this.aoScene = this.passScene(shaders.AO_FS, this.aoU);
    this.fxaaScene = this.passScene(shaders.FXAA_FS, this.fxaaU);
  }

  get targets(): TargetSet | null {
    return this.targetsValue;
  }

  hasEffects(cfg: any): boolean {
    return (
      cfg.bloom > 0 ||
      cfg.dof > 0 ||
      cfg.ssao > 0 ||
      cfg.aces ||
      cfg.vignette > 0 ||
      !!cfg.grade ||
      cfg.fxaa
    );
  }

  ensureTargets(width: number, height: number, fxaa = false): void {
    if (
      this.targetsValue &&
      this.targetsValue.w === width &&
      this.targetsValue.h === height &&
      this.targetsValue.fx === fxaa
    ) {
      return;
    }
    this.freeTargets();
    const hw = Math.max(1, width >> 1);
    const hh = Math.max(1, height >> 1);
    this.targetsValue = {
      w: width,
      h: height,
      hw,
      hh,
      fx: fxaa,
      scene: this.makeTarget(width, height, true),
      half: [
        this.makeTarget(hw, hh, false),
        this.makeTarget(hw, hh, false),
        this.makeTarget(hw, hh, false),
        this.makeTarget(hw, hh, false),
        this.makeTarget(hw, hh, false),
        this.makeTarget(hw, hh, false),
      ],
      post: fxaa ? this.makeTarget(width, height, false) : null,
    };
  }

  render(renderer: THREE.WebGLRenderer, frame: PostProcessFrame): number {
    const { cfg, width, height, near, far, distance, eye, extra, tile, worldBaseX, worldBaseY } = frame;
    const targets = this.targetsValue;
    if (!targets) return 0;
    const postT0 = frame.perfTraceEnabled ? performance.now() : 0;
    if (cfg.dof > 0) {
      this.brightU.uTex.value = targets.scene.texture;
      this.brightU.uThreshold.value = 0;
      renderer.setRenderTarget(targets.half[0]);
      renderer.render(this.brightScene, this.camera);
      this.blurPass(renderer, targets.half[0].texture, targets.half[1], 1, 0);
      this.blurPass(renderer, targets.half[1].texture, targets.half[0], 0, 1);
    }
    if (cfg.bloom > 0) {
      this.brightU.uTex.value = targets.scene.texture;
      this.brightU.uThreshold.value = 0.6;
      renderer.setRenderTarget(targets.half[2]);
      renderer.render(this.brightScene, this.camera);
      this.blurPass(renderer, targets.half[2].texture, targets.half[3], 1, 0);
      this.blurPass(renderer, targets.half[3].texture, targets.half[2], 0, 1);
      this.blurPass(renderer, targets.half[2].texture, targets.half[3], 1, 0);
      this.blurPass(renderer, targets.half[3].texture, targets.half[2], 0, 1);
    }
    if (cfg.ssao > 0) {
      this.aoU.uDepth.value = targets.scene.depthTexture;
      this.aoU.uNearFar.value[0] = near;
      this.aoU.uNearFar.value[1] = far;
      this.aoU.uInvSize.value[0] = 1 / targets.hw;
      this.aoU.uInvSize.value[1] = 1 / targets.hh;
      this.aoU.uProjScale.value = height / 2 / Math.tan(this.fov / 2);
      renderer.setRenderTarget(targets.half[4]);
      renderer.render(this.aoScene, this.camera);
      this.blurPass(renderer, targets.half[4].texture, targets.half[5], 1, 0);
      this.blurPass(renderer, targets.half[5].texture, targets.half[4], 0, 1);
    }

    this.compU.uScene.value = targets.scene.texture;
    this.compU.uBlurScene.value = targets.half[0].texture;
    this.compU.uBlurBright.value = targets.half[2].texture;
    this.compU.uDepth.value = targets.scene.depthTexture;
    this.compU.uBloom.value = cfg.bloom;
    this.compU.uDof.value = cfg.dof;
    this.compU.uNearFar.value[0] = near;
    this.compU.uNearFar.value[1] = far;
    let focusDist = distance;
    if (extra.focus) {
      const f = extra.focus;
      const fx = (f.rx - worldBaseX + 0.5) * tile;
      const fy = frame.sampleHeight(f.rx - worldBaseX, f.ry - worldBaseY) * tile;
      const fz = (f.ry - worldBaseY + 0.5) * tile;
      focusDist = Math.hypot(fx - eye[0], fy - eye[1], fz - eye[2]);
    }
    this.compU.uFocusDist.value = focusDist;
    this.compU.uFocusRange.value = distance * 0.9;
    this.compU.uAO.value = targets.half[4].texture;
    this.compU.uSsao.value = cfg.ssao;
    this.compU.uAces.value = cfg.aces ? 1 : 0;
    this.compU.uVignette.value = cfg.vignette;
    this.compU.uGradeOn.value = cfg.grade ? 1 : 0;
    if (cfg.grade) {
      this.compU.uGradeM.value.fromArray(cfg.grade.m);
      this.compU.uGradeB.value.set(cfg.grade.b);
    }
    renderer.setRenderTarget(cfg.fxaa ? targets.post : null);
    renderer.render(this.compScene, this.camera);
    if (cfg.fxaa) {
      this.fxaaU.uTex.value = targets.post!.texture;
      this.fxaaU.uInvSize.value[0] = 1 / width;
      this.fxaaU.uInvSize.value[1] = 1 / height;
      renderer.setRenderTarget(null);
      renderer.render(this.fxaaScene, this.camera);
    }
    return frame.perfTraceEnabled ? performance.now() - postT0 : 0;
  }

  private makeTarget(width: number, height: number, depth: boolean): THREE.WebGLRenderTarget {
    const target = new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      colorSpace: THREE.NoColorSpace,
      depthBuffer: depth,
      stencilBuffer: false,
      generateMipmaps: false,
    });
    if (depth) {
      const depthTexture = new THREE.DepthTexture(width, height);
      depthTexture.format = THREE.DepthFormat;
      depthTexture.type = THREE.UnsignedIntType;
      target.depthTexture = depthTexture;
    }
    return target;
  }

  private freeTargets(): void {
    if (!this.targetsValue) return;
    this.targetsValue.scene.depthTexture?.dispose();
    this.targetsValue.scene.dispose();
    this.targetsValue.half.forEach((target) => target.dispose());
    this.targetsValue.post?.dispose();
    this.targetsValue = null;
  }

  private passScene(fragmentShader: string, uniforms: Record<string, { value: any }>): THREE.Scene {
    const mesh = new THREE.Mesh(this.postGeo, this.materials.postMaterial(fragmentShader, uniforms));
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false;
    const scene = new THREE.Scene();
    scene.matrixAutoUpdate = false;
    scene.add(mesh);
    return scene;
  }

  private blurPass(
    renderer: THREE.WebGLRenderer,
    source: THREE.Texture,
    destination: THREE.WebGLRenderTarget,
    dirX: number,
    dirY: number,
  ): void {
    const targets = this.targetsValue!;
    this.blurU.uTex.value = source;
    this.blurU.uDir.value[0] = dirX / targets.hw;
    this.blurU.uDir.value[1] = dirY / targets.hh;
    renderer.setRenderTarget(destination);
    renderer.render(this.blurScene, this.camera);
  }
}
