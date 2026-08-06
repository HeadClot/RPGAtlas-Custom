/* RPGAtlas — internal Three.js scene graph and shared uniforms. */
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as THREE from "three";

export class ThreeSceneGraph {
  readonly lightPos: Float32Array;
  readonly lightCol: Float32Array;
  readonly clearColor = new THREE.Color();
  readonly uniforms: Record<string, { value: any }>;
  readonly depthMVP = { value: new THREE.Matrix4() };
  readonly camera = new THREE.Camera();
  readonly scene = new THREE.Scene();
  readonly terrainGroup = new THREE.Group();
  readonly waterGroup = new THREE.Group();
  readonly dropGroup = new THREE.Group();
  readonly spriteGroup = new THREE.Group();
  readonly overheadGroup = new THREE.Group();
  readonly weatherGroup = new THREE.Group();
  private readonly cullGroups: THREE.Group[];
  private readonly culledChildren: THREE.Object3D[] = [];

  constructor(maxLights: number) {
    this.lightPos = new Float32Array(maxLights * 4);
    this.lightCol = new Float32Array(maxLights * 3);
    this.uniforms = {
      uMVP: { value: new THREE.Matrix4() },
      uEye: { value: new Float32Array(3) },
      uAmbient: { value: 0.45 },
      uLightCount: { value: 0 },
      uLightPos: { value: this.lightPos },
      uLightCol: { value: this.lightCol },
      uFog: { value: new Float32Array(4) },
      uFogRange: { value: new Float32Array([1, 2]) },
      uAmbTint: { value: new Float32Array([1, 1, 1]) },
      uSunMVP: { value: new THREE.Matrix4() },
      uShadowMap: { value: null as THREE.Texture | null },
      uShadowStrength: { value: 0 },
      uShadowTexel: { value: new Float32Array(2) },
      uPLMap: { value: null as THREE.Texture | null },
      uPLCount: { value: 0 },
      uPLStrength: { value: 0 },
      uClipY: { value: new Float32Array(2) },
      uReflect: { value: null as THREE.Texture | null },
      uScreen: { value: new Float32Array([1, 1]) },
      uTime: { value: 0 },
      uSunDir: { value: new Float32Array([0.33, 0.82, -0.47]) },
      uGlow: { value: 0 },
    };
    this.scene.add(
      this.terrainGroup,
      this.waterGroup,
      this.dropGroup,
      this.spriteGroup,
      this.overheadGroup,
      this.weatherGroup,
    );
    this.cullGroups = [this.terrainGroup, this.waterGroup, this.overheadGroup];
    [
      this.scene,
      this.terrainGroup,
      this.waterGroup,
      this.dropGroup,
      this.spriteGroup,
      this.overheadGroup,
      this.weatherGroup,
    ].forEach((object) => (object.matrixAutoUpdate = false));
  }

  setViewCull(camX: number, camY: number, viewW: number, viewH: number, tile: number, on: boolean): void {
    if (!on) {
      for (let i = 0; i < this.culledChildren.length; i++) this.culledChildren[i].visible = true;
      this.culledChildren.length = 0;
      return;
    }
    const margin = 6 * tile;
    const x0 = camX - margin;
    const x1 = camX + viewW + margin;
    const z0 = camY - 10 * tile;
    const z1 = camY + viewH + margin;
    for (let i = 0; i < this.culledChildren.length; i++) this.culledChildren[i].visible = true;
    this.culledChildren.length = 0;
    for (const group of this.cullGroups) {
      for (const child of group.children) {
        const rect = child.userData.rect;
        if (!rect) continue;
        const outside = rect.x1 < x0 || rect.x0 > x1 || rect.z1 < z0 || rect.z0 > z1;
        child.visible = !outside;
        if (outside) this.culledChildren.push(child);
      }
    }
  }
}
