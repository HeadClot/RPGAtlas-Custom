/* RPGAtlas — ordered frame pass coordinator for the internal Three.js renderer. */
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as THREE from "three";
import type { PostProcessRenderer } from "./post-process-renderer.js";
import type { ReflectionPassRenderer } from "./reflection-pass-renderer.js";
import type { ShadowPassRenderer } from "./shadow-pass-renderer.js";
import type { SpriteRenderer } from "./sprite-renderer.js";
import type { WeatherRenderer } from "./weather-renderer.js";

export interface FramePipelineTiming {
  sunShadowMs: number;
  pointShadowMs: number;
  reflectionMs: number;
  sceneMs: number;
  postMs: number;
}

export interface FramePipelineFrame {
  renderer: THREE.WebGLRenderer;
  sprites: any[];
  cfg: any;
  extra: any;
  width: number;
  height: number;
  runtimeWidth: number;
  runtimeHeight: number;
  camX: number;
  camY: number;
  shakeX: number;
  shakeZ: number;
  worldBaseX: number;
  worldBaseY: number;
  tile: number;
  zoom: number;
  targetX: number;
  targetZ: number;
  mvp: number[];
  clear: number[];
  near: number;
  far: number;
  distance: number;
  eye: number[];
  sunDaylight: number;
  lightCount: number;
  sampleHeight(rx: number, ry: number): number;
  timing: FramePipelineTiming;
  perfTraceEnabled: boolean;
}

export interface FramePipelineOptions {
  spriteRenderer: SpriteRenderer;
  weatherRenderer: WeatherRenderer;
  shadowPass: ShadowPassRenderer;
  reflectionPass: ReflectionPassRenderer;
  postProcess: PostProcessRenderer;
  waterGroup: THREE.Group;
  scene: THREE.Scene;
  camera: THREE.Camera;
  clearColor: THREE.Color;
  setViewCull(camX: number, camY: number, viewW: number, viewH: number, on: boolean): void;
}

/** Keeps the frame's pass order and pass-local timing in one place. */
export class RenderFramePipeline {
  constructor(private readonly options: FramePipelineOptions) {}

  render(frame: FramePipelineFrame): void {
    const { renderer, cfg, extra, timing, perfTraceEnabled } = frame;
    const { spriteRenderer, weatherRenderer, shadowPass, reflectionPass, postProcess, waterGroup, scene, camera, clearColor } = this.options;
    spriteRenderer.update(frame.sprites, frame.worldBaseX, frame.worldBaseY, cfg.dropShadows, frame.sampleHeight);
    weatherRenderer.update(cfg.weather, extra.motionScale, frame.targetX, frame.targetZ - 40,
      frame.width / frame.zoom / 2 + 100, frame.height / frame.zoom / 2 + 200);

    if (cfg.shadows > 0 && frame.sunDaylight > 0.003) {
      const start = perfTraceEnabled ? performance.now() : 0;
      shadowPass.renderSun(renderer, frame.sunDaylight);
      if (perfTraceEnabled) timing.sunShadowMs = performance.now() - start;
    } else if (cfg.shadows > 0) {
      shadowPass.uniforms.uShadowStrength.value = 0;
    }

    const pointCount = cfg.pointShadows > 0 ? Math.min(frame.lightCount, shadowPass.maxPointLights) : 0;
    shadowPass.uniforms.uPLCount.value = pointCount;
    if (cfg.pointShadows > 0) timing.pointShadowMs = shadowPass.renderPointPass(renderer, pointCount, perfTraceEnabled);

    this.options.setViewCull(
      frame.camX - frame.worldBaseX * frame.tile + frame.shakeX,
      frame.camY - frame.worldBaseY * frame.tile + frame.shakeZ,
      frame.width / frame.zoom,
      frame.height / frame.zoom,
      true,
    );

    clearColor.setRGB(frame.clear[0], frame.clear[1], frame.clear[2]);
    if (cfg.water > 0 && waterGroup.children.length) {
      const start = perfTraceEnabled ? performance.now() : 0;
      reflectionPass.render(renderer, frame.mvp, frame.clear, frame.runtimeWidth, frame.runtimeHeight);
      if (perfTraceEnabled) timing.reflectionMs = performance.now() - start;
    }

    const post = cfg.bloom > 0 || cfg.dof > 0 || cfg.ssao > 0 || cfg.aces || cfg.vignette > 0 || !!cfg.grade || cfg.fxaa;
    if (post) {
      postProcess.ensureTargets(frame.width, frame.height, cfg.fxaa);
      renderer.setRenderTarget(postProcess.targets!.scene);
    } else renderer.setRenderTarget(null);
    const sceneStart = perfTraceEnabled ? performance.now() : 0;
    renderer.setClearColor(clearColor, 1);
    renderer.clear(true, true, false);
    renderer.render(scene, camera);
    shadowPass.markSceneFrame(pointCount);
    if (perfTraceEnabled) timing.sceneMs = performance.now() - sceneStart;
    this.options.setViewCull(0, 0, 0, 0, false);

    if (post) {
      timing.postMs = postProcess.render(renderer, {
        cfg, width: frame.width, height: frame.height, near: frame.near, far: frame.far,
        distance: frame.distance, eye: frame.eye, extra, worldBaseX: frame.worldBaseX,
        worldBaseY: frame.worldBaseY, tile: frame.tile, fov: Math.PI / 4,
        sampleHeight: frame.sampleHeight, perfTraceEnabled,
      });
    }
  }
}
