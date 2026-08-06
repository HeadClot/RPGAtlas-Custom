/* RPGAtlas — internal HD-2D renderer settings and deterministic curves. */
/* eslint-disable @typescript-eslint/no-explicit-any */
export interface GradePreset {
  m: number[];
  b: number[];
}

export interface DayNightState {
  daylight: number;
  scale: number;
  tint: number[];
  azimuth: number;
  elevation: number;
}

export class RenderSettings {
  readonly tileTypes: any;
  readonly waterTiles: Set<any>;
  readonly specTiles: Set<any>;
  readonly emisTiles: Set<any>;
  private dayNightCacheHour = NaN;
  private dayNightCache: DayNightState | null = null;

  constructor(tileTypes: any = {}) {
    this.tileTypes = tileTypes;
    this.waterTiles = new Set(
      [tileTypes.water, tileTypes.deepwater, tileTypes.swamp].filter((v: any) => v != null),
    );
    this.specTiles = new Set(
      [
        tileTypes.water,
        tileTypes.deepwater,
        tileTypes.swamp,
        tileTypes.ice,
        tileTypes.crystalfloor,
        tileTypes.crystals,
      ].filter((v: any) => v != null),
    );
    this.emisTiles = new Set(
      [
        tileTypes.window,
        tileTypes.lava,
        tileTypes.lava_rock,
        tileTypes.crystals,
        tileTypes.crystalfloor,
        tileTypes.torch,
      ].filter((v: any) => v != null),
    );
  }

  tileId(value: number): number {
    return (value | 0) & ((1 << 28) - 1);
  }

  gradeFor(name: any): GradePreset | null {
    const desat = (m: number[], s: number) => {
      const L = [0.299, 0.587, 0.114];
      const out = m.slice();
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          out[c * 3 + r] = m[c * 3 + r] * (1 - s) + L[c] * s;
        }
      }
      return out;
    };
    const diag = (x: number, y: number, z: number) => [x, 0, 0, 0, y, 0, 0, 0, z];
    switch (String(name || "")) {
      case "warm":
        return { m: diag(1.1, 1.0, 0.88), b: [0.012, 0.004, 0] };
      case "cool":
        return { m: diag(0.88, 1.0, 1.12), b: [0, 0.004, 0.015] };
      case "night":
        return { m: desat(diag(0.6, 0.7, 1.08), 0.25), b: [0, 0.004, 0.02] };
      case "sepia":
        return {
          m: [0.393, 0.349, 0.272, 0.769, 0.686, 0.534, 0.189, 0.168, 0.131],
          b: [0, 0, 0],
        };
      case "noir":
        return { m: desat(diag(1.18, 1.18, 1.18), 1), b: [-0.06, -0.06, -0.06] };
      default:
        return null;
    }
  }

  cachedDayNightAt(hour: number): DayNightState {
    if (this.dayNightCache && this.dayNightCacheHour === hour) return this.dayNightCache;
    this.dayNightCacheHour = hour;
    this.dayNightCache = this.dayNightAt(hour);
    return this.dayNightCache;
  }

  private dayNightAt(hour: number): DayNightState {
    const daylight = Math.max(0, Math.sin((Math.PI * (hour - 6)) / 12));
    const dl = Math.pow(daylight, 0.7);
    const dusk = daylight * (1 - daylight) * 4 * (daylight > 0 ? 1 : 0);
    const night = [0.55, 0.62, 1.05];
    const day = [1, 1, 1];
    const gold = [1.2, 0.85, 0.6];
    const tint = [0, 0, 0];
    for (let i = 0; i < 3; i++) {
      tint[i] = night[i] + (day[i] - night[i]) * dl;
      tint[i] += (gold[i] - tint[i]) * dusk * 0.45;
    }
    return {
      daylight: dl,
      scale: 0.25 + 0.75 * dl,
      tint,
      azimuth: 90 + Math.min(1, Math.max(0, (hour - 6) / 12)) * 180,
      elevation: 15 + 60 * daylight,
    };
  }
}
