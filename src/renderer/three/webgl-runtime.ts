/* RPGAtlas — internal WebGL2 lifecycle and context recovery. */
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as THREE from "three";

export interface WebGLRuntimeHooks {
  onContextLost(): void;
  onContextRestored(): void;
}

export class WebGLRuntime {
  private canvas: HTMLCanvasElement | null = null;
  private webgl: THREE.WebGLRenderer | null = null;
  private context: WebGL2RenderingContext | null = null;
  private status: boolean | null = null;
  private sizedW = 0;
  private sizedH = 0;

  get renderer(): THREE.WebGLRenderer | null {
    return this.webgl;
  }

  get gl(): WebGL2RenderingContext | null {
    return this.context;
  }

  get ok(): boolean | null {
    return this.status;
  }

  get element(): HTMLCanvasElement | null {
    return this.canvas;
  }

  async available(options: any = {}, hooks: WebGLRuntimeHooks): Promise<boolean> {
    if (this.status !== null) return this.status;
    try {
      const targetCanvas = options.canvas || null;
      if (targetCanvas) {
        this.canvas = targetCanvas;
      } else {
        const gameCanvas = document.getElementById("gamecanvas");
        if (!gameCanvas || !gameCanvas.parentNode) return (this.status = false);
        this.canvas = document.createElement("canvas");
        this.canvas.id = "glcanvas";
        this.canvas.style.cssText = "position:absolute;inset:0;z-index:0;image-rendering:pixelated";
        gameCanvas.parentNode.insertBefore(this.canvas, gameCanvas);
      }
      this.webgl = new THREE.WebGLRenderer({
        canvas: this.canvas!,
        antialias: false,
        premultipliedAlpha: true,
        stencil: false,
      });
      this.context = this.webgl.getContext() as WebGL2RenderingContext;
      if (typeof WebGL2RenderingContext === "undefined" || !(this.context instanceof WebGL2RenderingContext)) {
        throw new Error("WebGL2 required");
      }
      this.webgl.autoClear = false;
      this.webgl.sortObjects = false;
      this.webgl.setPixelRatio(1);
      this.webgl.outputColorSpace = THREE.LinearSRGBColorSpace;
      this.webgl.toneMapping = THREE.NoToneMapping;
      this.canvas!.addEventListener("webglcontextlost", (event) => {
        event.preventDefault();
        console.warn("HD-2D: WebGL context lost — falling back to Canvas 2D.");
        this.status = false;
        hooks.onContextLost();
      });
      this.canvas!.addEventListener("webglcontextrestored", () => {
        console.warn("HD-2D: WebGL context restored — rebuilding GPU resources.");
        this.status = true;
        hooks.onContextRestored();
      });
      this.status = true;
    } catch (error) {
      console.error("HD-2D: WebGL2 init failed", error);
      this.webgl = null;
      this.context = null;
      this.status = false;
    }
    if (!this.status) console.warn("HD-2D: WebGL2 unavailable — using the Canvas 2D renderer.");
    return this.status;
  }

  resize(width: number, height: number): void {
    if (!this.webgl || (this.sizedW === width && this.sizedH === height)) return;
    this.webgl.setSize(width, height, false);
    this.sizedW = width;
    this.sizedH = height;
  }

  get width(): number {
    return this.sizedW;
  }

  get height(): number {
    return this.sizedH;
  }

  isLost(): boolean {
    return !this.status || (!!this.context && this.context.isContextLost());
  }
}
