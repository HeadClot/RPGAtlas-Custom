/* RPGAtlas — pure matrix, color, and frame geometry helpers. */
/* eslint-disable @typescript-eslint/no-explicit-any */
export class RenderMath {
  private readonly hexRGBCache = new Map<string, [number, number, number]>();

  perspective(fovY: number, aspect: number, near: number, far: number): number[] {
    return this.perspectiveInto(new Array(16), fovY, aspect, near, far) as number[];
  }

  perspectiveInto(out: number[] | Float32Array, fovY: number, aspect: number, near: number, far: number): typeof out {
    const f = 1 / Math.tan(fovY / 2);
    const nf = 1 / (near - far);
    out[0] = f / aspect; out[1] = 0; out[2] = 0; out[3] = 0;
    out[4] = 0; out[5] = f; out[6] = 0; out[7] = 0;
    out[8] = 0; out[9] = 0; out[10] = (far + near) * nf; out[11] = -1;
    out[12] = 0; out[13] = 0; out[14] = 2 * far * near * nf; out[15] = 0;
    return out;
  }

  lookAt(ex: number, ey: number, ez: number, tx: number, ty: number, tz: number): number[] {
    return this.lookAtInto(new Array(16), ex, ey, ez, tx, ty, tz) as number[];
  }

  lookAtInto(
    out: number[] | Float32Array,
    ex: number, ey: number, ez: number,
    tx: number, ty: number, tz: number,
  ): typeof out {
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
    out[0] = xx; out[1] = yx; out[2] = zx; out[3] = 0;
    out[4] = xy; out[5] = yy; out[6] = zy; out[7] = 0;
    out[8] = xz; out[9] = yz; out[10] = zz; out[11] = 0;
    out[12] = -(xx * ex + xy * ey + xz * ez);
    out[13] = -(yx * ex + yy * ey + yz * ez);
    out[14] = -(zx * ex + zy * ey + zz * ez);
    out[15] = 1;
    return out;
  }

  multiply(a: number[], b: number[]): number[] {
    return this.multiplyInto(new Array(16), a, b) as number[];
  }

  multiplyInto(
    out: number[] | Float32Array,
    a: ArrayLike<number>,
    b: ArrayLike<number>,
  ): typeof out {
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
    return this.orthoInto(new Array(16), l, r, b, t, n, f) as number[];
  }

  orthoInto(
    out: number[] | Float32Array,
    l: number, r: number, b: number, t: number, n: number, f: number,
  ): typeof out {
    out[0] = 2 / (r - l); out[1] = 0; out[2] = 0; out[3] = 0;
    out[4] = 0; out[5] = 2 / (t - b); out[6] = 0; out[7] = 0;
    out[8] = 0; out[9] = 0; out[10] = -2 / (f - n); out[11] = 0;
    out[12] = -(r + l) / (r - l);
    out[13] = -(t + b) / (t - b);
    out[14] = -(f + n) / (f - n);
    out[15] = 1;
    return out;
  }
}
