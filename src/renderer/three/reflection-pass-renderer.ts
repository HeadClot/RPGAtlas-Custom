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
  waterY: number;
}

export class ReflectionPassRenderer {
  private target: THREE.WebGLRenderTarget | null = null;
  private targetWidth = 0;
  private targetHeight = 0;
  private readonly mirrorY: number[];

  constructor(private readonly options: ReflectionRendererOptions) {
    this.mirrorY = [1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1, 0, 0, 2 * options.waterY, 0, 1];
  }

  render(renderer: THREE.WebGLRenderer, mvp: number[], clear: number[], width: number, height: number): void {
    this.ensureTarget(width, height);
    const { waterGroup, dropGroup, weatherGroup, uniforms, scene, camera, clearColor, multiply } = this.options;
    waterGroup.visible = false;
    dropGroup.visible = false;
    weatherGroup.visible = false;
    uniforms.uClipY.value[0] = 1;
    uniforms.uClipY.value[1] = this.options.waterY + 0.5;
    uniforms.uMVP.value.fromArray(multiply(mvp, this.mirrorY));
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
  }
}
