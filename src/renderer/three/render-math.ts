/* RPGAtlas — pure matrix, color, and frame geometry helpers. */
/* eslint-disable @typescript-eslint/no-explicit-any */
export class RenderMath {
  private readonly hexRGBCache = new Map<string, [number, number, number]>();

  perspective(fovY: number, aspect: number, near: number, far: number): number[] {
    const f = 1 / Math.tan(fovY / 2);
    const nf = 1 / (near - far);
    return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0];
  }

  lookAt(ex: number, ey: number, ez: number, tx: number, ty: number, tz: number): number[] {
    let zx = ex - tx;
    let zy = ey - ty;
    let zz = ez - tz;
    const zl = Math.hypot(zx, zy, zz);
    zx /= zl; zy /= zl; zz /= zl;
    let xx = zz;
    let xy = 0;
    let xz = -zx;
    const xl = Math.hypot(xx, xy, xz);
    xx /= xl; xy /= xl; xz /= xl;
    const yx = zy * xz - zz * xy;
    const yy = zz * xx - zx * xz;
    const yz = zx * xy - zy * xx;
    return [
      xx, yx, zx, 0,
      xy, yy, zy, 0,
      xz, yz, zz, 0,
      -(xx * ex + xy * ey + xz * ez),
      -(yx * ex + yy * ey + yz * ez),
      -(zx * ex + zy * ey + zz * ez),
      1,
    ];
  }

  multiply(a: number[], b: number[]): number[] {
    const out = new Array(16);
    for (let c = 0; c < 4; c++) {
      for (let r = 0; r < 4; r++) {
        out[c * 4 + r] =
          a[r] * b[c * 4] +
          a[4 + r] * b[c * 4 + 1] +
          a[8 + r] * b[c * 4 + 2] +
          a[12 + r] * b[c * 4 + 3];
      }
    }
    return out;
  }

  hexRGB(value: any): [number, number, number] {
    const key = String(value || "");
    const cached = this.hexRGBCache.get(key);
    if (cached) return cached;
    const parsed = parseInt(key.replace("#", ""), 16) || 0;
    const rgb: [number, number, number] = [
      ((parsed >> 16) & 255) / 255,
      ((parsed >> 8) & 255) / 255,
      (parsed & 255) / 255,
    ];
    this.hexRGBCache.set(key, rgb);
    return rgb;
  }

  ortho(l: number, r: number, b: number, t: number, n: number, f: number): number[] {
    return [
      2 / (r - l), 0, 0, 0,
      0, 2 / (t - b), 0, 0,
      0, 0, -2 / (f - n), 0,
      -(r + l) / (r - l), -(t + b) / (t - b), -(f + n) / (f - n), 1,
    ];
  }
}
