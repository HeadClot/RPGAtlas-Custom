/* RPGAtlas — internal planar water reflection pass. */
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as THREE from "three";

export interface ReflectionRendererOptions {
  waterGroup: THREE.Group;
  dropGroup: THREE.Group;
  weatherGroup: THREE.Group;
  uniforms: Record<string, { value: any }>;
  scene: THREE.Scene;
  camera: THREE.Camera;
  clearColor: THREE.Color;
  multiply(a: number[], b: number[]): number[];
  multiplyInto?(out: number[] | Float32Array, a: ArrayLike<number>, b: ArrayLike<number>): void;
  waterY: number;
}

export class ReflectionPassRenderer {
  private target: THREE.WebGLRenderTarget | null = null;
  private targetWidth = 0;
  private targetHeight = 0;
  private readonly mirrorY: number[];
  private readonly mirroredMVP = new Float32Array(16);
  private readonly lastMVP = new Float32Array(16);
  private readonly lastEye = new Float32Array(3);
  private readonly lastFog = new Float32Array(4);
  private readonly lastFogRange = new Float32Array(2);
  private readonly lastAmbTint = new Float32Array(3);
  private readonly lastSunDir = new Float32Array(3);
  private readonly lastSunMVP = new Float32Array(16);
  private readonly lastShadowTexel = new Float32Array(2);
  private readonly lastLightPos: Float32Array;
  private readonly lastLightCol: Float32Array;
  private lastRevision = -1;
  private lastAmbient = NaN;
  private lastLightCount = -1;
  private lastShadowStrength = NaN;
  private lastPointLightCount = -1;
  private lastPointShadowStrength = NaN;
  private lastGlow = NaN;
  private lastShadowMap: THREE.Texture | null = null;
  private lastPointMap: THREE.Texture | null = null;
  private reflectionValid = false;

  constructor(private readonly options: ReflectionRendererOptions) {
    this.mirrorY = [1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1, 0, 0, 2 * options.waterY, 0, 1];
    this.lastLightPos = new Float32Array((options.uniforms.uLightPos.value as ArrayLike<number>).length);
    this.lastLightCol = new Float32Array((options.uniforms.uLightCol.value as ArrayLike<number>).length);
  }

  render(
    renderer: THREE.WebGLRenderer,
    mvp: ArrayLike<number>,
    clear: ArrayLike<number>,
    width: number,
    height: number,
    revision: number,
  ): void {
    this.ensureTarget(width, height);
    const { waterGroup, dropGroup, weatherGroup, uniforms, scene, camera, clearColor, multiply } = this.options;
    if (this.reflectionValid && this.sameInputs(mvp, revision)) {
      uniforms.uReflect.value = this.target!.texture;
      return;
    }
    waterGroup.visible = false;
    dropGroup.visible = false;
    weatherGroup.visible = false;
    uniforms.uClipY.value[0] = 1;
    uniforms.uClipY.value[1] = this.options.waterY + 0.5;
    if (this.options.multiplyInto) this.options.multiplyInto(this.mirroredMVP, mvp, this.mirrorY);
    else this.mirroredMVP.set(multiply(mvp as number[], this.mirrorY));
    uniforms.uMVP.value.fromArray(this.mirroredMVP);
    renderer.setRenderTarget(this.target);
    clearColor.setRGB(clear[0], clear[1], clear[2]);
    renderer.setClearColor(clearColor, 1);
    renderer.clear(true, true, false);
    renderer.render(scene, camera);
    uniforms.uMVP.value.fromArray(mvp);
    uniforms.uClipY.value[0] = 0;
    waterGroup.visible = true;
    dropGroup.visible = true;
    weatherGroup.visible = true;
    uniforms.uReflect.value = this.target!.texture;
    this.captureInputs(mvp, revision);
  }

  private ensureTarget(width: number, height: number): void {
    const targetWidth = Math.max(1, width >> 1);
    const targetHeight = Math.max(1, height >> 1);
    if (this.target && this.targetWidth === targetWidth && this.targetHeight === targetHeight) return;
    this.target?.dispose();
    this.target = new THREE.WebGLRenderTarget(targetWidth, targetHeight, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      colorSpace: THREE.NoColorSpace,
      depthBuffer: true,
      stencilBuffer: false,
      generateMipmaps: false,
    });
    this.targetWidth = targetWidth;
    this.targetHeight = targetHeight;
    this.reflectionValid = false;
  }

  private sameInputs(mvp: ArrayLike<number>, revision: number): boolean {
    const u = this.options.uniforms;
    return revision === this.lastRevision &&
      sameArray(mvp, this.lastMVP) &&
      sameArray(u.uEye.value, this.lastEye) &&
      sameArray(u.uFog.value, this.lastFog) &&
      sameArray(u.uFogRange.value, this.lastFogRange) &&
      sameArray(u.uAmbTint.value, this.lastAmbTint) &&
      sameArray(u.uSunDir.value, this.lastSunDir) &&
      sameArray(u.uSunMVP.value.elements, this.lastSunMVP) &&
      sameArray(u.uShadowTexel.value, this.lastShadowTexel) &&
      sameArray(u.uLightPos.value, this.lastLightPos) &&
      sameArray(u.uLightCol.value, this.lastLightCol) &&
      u.uShadowMap.value === this.lastShadowMap &&
      u.uPLMap.value === this.lastPointMap &&
      u.uAmbient.value === this.lastAmbient &&
      u.uLightCount.value === this.lastLightCount &&
      u.uShadowStrength.value === this.lastShadowStrength &&
      u.uPLCount.value === this.lastPointLightCount &&
      u.uPLStrength.value === this.lastPointShadowStrength &&
      u.uGlow.value === this.lastGlow;
  }

  private captureInputs(mvp: ArrayLike<number>, revision: number): void {
    const u = this.options.uniforms;
    copyArray(this.lastMVP, mvp);
    copyArray(this.lastEye, u.uEye.value);
    copyArray(this.lastFog, u.uFog.value);
    copyArray(this.lastFogRange, u.uFogRange.value);
    copyArray(this.lastAmbTint, u.uAmbTint.value);
    copyArray(this.lastSunDir, u.uSunDir.value);
    copyArray(this.lastSunMVP, u.uSunMVP.value.elements);
    copyArray(this.lastShadowTexel, u.uShadowTexel.value);
    copyArray(this.lastLightPos, u.uLightPos.value);
    copyArray(this.lastLightCol, u.uLightCol.value);
    this.lastRevision = revision;
    this.lastShadowMap = u.uShadowMap.value;
    this.lastPointMap = u.uPLMap.value;
    this.lastAmbient = u.uAmbient.value;
    this.lastLightCount = u.uLightCount.value;
    this.lastShadowStrength = u.uShadowStrength.value;
    this.lastPointLightCount = u.uPLCount.value;
    this.lastPointShadowStrength = u.uPLStrength.value;
    this.lastGlow = u.uGlow.value;
    this.reflectionValid = true;
  }
}

function sameArray(a: ArrayLike<number>, b: ArrayLike<number>): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function copyArray(out: Float32Array, source: ArrayLike<number>): void {
  for (let i = 0; i < out.length; i++) out[i] = source[i];
}
