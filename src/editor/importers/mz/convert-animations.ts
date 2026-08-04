/* RPGAtlas — src/editor/importers/mz/convert-animations.ts
   Project Compass M4·B: `data/Animations.json` → Atlas `BattleAnimation`s
   (matrix §10, decision D4).

   MV animations are sheet-based and convert for REAL: each 15-fps frame tracks
   its first cell's sheet pattern, consecutive-ascending runs become `flipbook`
   items over the sheet's `asset:pictures/…` key (the M2 "add the art and it
   appears" pattern), and the timing rows become `flash`/`sound` items. Holds
   (repeated patterns) emit one-cell flipbooks per frame so total duration stays
   exact. Anything the flipbook can't carry (multi-cell frames, per-cell
   offsets/rotation/mirror/fades, hue shifts, hide-target flashes) is simplified
   behind ONE aggregated report line (D11).

   MZ animations are Effekseer particle files — a locked skip (D4). Each entry
   converts to its REAL flash/sound/quake timings, and `resolveAnimationFallbacks`
   (called from assembleProject, the only place the base project is in hand)
   clones the visual items of the nearest engine-default animation by a
   name/element-bucket heuristic, reporting the substitution per animation.

   Pure — no DOM. Copyright (C) 2026 RPGAtlas contributors — GPL-3.0-or-later. */

import type { AnimItem, BattleAnimation } from "../../../shared/schema";
import { assetKeyOf, slugName } from "../../../shared/asset-library";
import type { ImportReport } from "./report";
import type { MzRawData, RmAnimation, RmMvAnimTiming, RmMzAnimTiming } from "./raw-types";

/** MV/MZ animation editors run at 15 fps; the Atlas timeline at 60 ticks/s. */
const TICKS_PER_FRAME = 4;
const FRAME_MS = 1000 / 15;

/** An MZ entry waiting for its visual fallback (resolved in assembleProject). */
export interface AnimationFallback {
  /** Index into the converted `animations` array. */
  index: number;
  /** Normalized match bucket ("fire" | "heal" | "hit"), element-hinted. */
  bucket: string;
  /** Whether the MZ entry brought its own sound / flash timings. */
  hasSound: boolean;
  hasFlash: boolean;
}

export interface AnimationsConversion {
  animations: BattleAnimation[];
  fallbacks: AnimationFallback[];
}

// ---------------------------------------------------------------------------
// The name/element bucket heuristic (D4)
// ---------------------------------------------------------------------------

const BUCKET_WORDS: Record<string, string[]> = {
  fire: ["fire", "flame", "flare", "burn", "ember", "blaze", "inferno", "explosion", "burst", "bomb", "meteor"],
  heal: ["heal", "cure", "recover", "restore", "regen", "bless", "pray", "hope", "revive", "raise"],
  hit: ["slash", "hit", "attack", "strike", "claw", "bite", "blow", "cut", "pierce", "thrust", "sting", "shot", "arrow", "sword", "spear", "axe", "punch", "kick", "crush", "smite"],
};

/** Best-effort bucket for an animation/element name; "" = no signal. */
export function animBucketOf(name: string): string {
  const n = String(name || "").toLowerCase();
  if (!n) return "";
  for (const [bucket, words] of Object.entries(BUCKET_WORDS)) {
    for (const w of words) if (n.includes(w)) return bucket;
  }
  return "";
}

/** animationId → element name, scanned from the skills that use it (the
 *  "element" half of D4's name/element heuristic). */
function elementHints(raw: MzRawData): Map<number, string> {
  const elements = (raw.system && raw.system.elements) || [];
  const hints = new Map<number, string>();
  for (const s of raw.skills || []) {
    if (!s || !s.animationId || s.animationId <= 0) continue;
    const el = s.damage && s.damage.elementId;
    if (el && el > 0 && elements[el] && !hints.has(s.animationId)) {
      hints.set(s.animationId, String(elements[el]));
    }
  }
  return hints;
}

// ---------------------------------------------------------------------------
// Shared timing math
// ---------------------------------------------------------------------------

const hex2 = (n: number): string =>
  ("0" + Math.max(0, Math.min(255, Math.round(Number(n) || 0))).toString(16)).slice(-2);

function flashItem(at: number, color: number[] | undefined, durationFrames: number, screen: boolean): AnimItem | null {
  const c = Array.isArray(color) ? color : [255, 255, 255, 170];
  const opacity = Math.min(1, Math.max(0.02, (Number(c[3]) || 0) / 255));
  const frames = Math.max(1, Number(durationFrames) || 1);
  if (!(Number(c[3]) || 0)) return null; // zero-strength flash = nothing to show
  return {
    at,
    type: "flash",
    anchor: screen ? "screen" : "target",
    color: "#" + hex2(c[0]) + hex2(c[1]) + hex2(c[2]),
    opacity: Math.round(opacity * 100) / 100,
    duration: Math.round(frames * FRAME_MS),
  };
}

function soundItem(at: number, se: { name?: string } | null | undefined): AnimItem | null {
  if (!se || !se.name) return null;
  return { at, type: "sound", se: "asset:audio/" + se.name };
}

// ---------------------------------------------------------------------------
// MV sheet conversion
// ---------------------------------------------------------------------------

interface MvStats {
  sheets: Set<string>;
  simplified: number;
}

function convertMvAnimation(a: RmAnimation, stats: MvStats): BattleAnimation {
  const items: AnimItem[] = [];
  const frames = Array.isArray(a.frames) ? a.frames : [];
  const sheet1 = a.animation1Name ? assetKeyOf("pictures", slugName(a.animation1Name)) : "";
  const sheet2 = a.animation2Name ? assetKeyOf("pictures", slugName(a.animation2Name)) : "";
  if ((Number(a.animation1Hue) || 0) !== 0 || (Number(a.animation2Hue) || 0) !== 0) stats.simplified++;

  // Track the first cell of each frame: sheet (1/2), pattern, scale.
  const cells: ({ sheet: string; pattern: number; scale: number } | null)[] = frames.map((frame) => {
    if (!Array.isArray(frame) || !frame.length || !Array.isArray(frame[0])) return null;
    if (frame.length > 1) stats.simplified++;
    const [pattern, x, y, scale, rotation, mirror, opacity] = frame[0].map((v) => Number(v) || 0);
    if (x || y || rotation || mirror || (frame[0].length > 6 && opacity !== 255)) stats.simplified++;
    const p = Math.max(0, Math.round(pattern));
    const sheet = p >= 100 ? sheet2 : sheet1;
    return sheet ? { sheet, pattern: p >= 100 ? p - 100 : p, scale: scale || 100 } : null;
  });

  // Rows per sheet from the highest used pattern (MV sheets are 5 columns).
  const maxPattern = new Map<string, number>();
  for (const c of cells) {
    if (c) maxPattern.set(c.sheet, Math.max(maxPattern.get(c.sheet) || 0, c.pattern));
  }
  for (const key of maxPattern.keys()) stats.sheets.add(key);

  // Consecutive-ascending pattern runs on the same sheet → one flipbook each.
  let run: { sheet: string; from: number; to: number; startFrame: number; scale: number } | null = null;
  const flush = (): void => {
    if (!run) return;
    items.push({
      at: run.startFrame * TICKS_PER_FRAME,
      type: "flipbook",
      sheet: run.sheet,
      cols: 5,
      rows: Math.max(1, Math.ceil(((maxPattern.get(run.sheet) || 0) + 1) / 5)),
      from: run.from,
      to: run.to,
      fps: 15,
      scale: Math.round((4 * run.scale) / 100 * 100) / 100,
    });
    run = null;
  };
  cells.forEach((c, i) => {
    if (!c) { flush(); return; }
    if (run && c.sheet === run.sheet && c.pattern === run.to + 1 && c.scale === run.scale) {
      run.to = c.pattern;
      return;
    }
    flush();
    run = { sheet: c.sheet, from: c.pattern, to: c.pattern, startFrame: i, scale: c.scale };
  });
  flush();

  // Timing rows → flash + sound items.
  for (const t of (a.timings || []) as RmMvAnimTiming[]) {
    if (!t) continue;
    const at = Math.max(0, Number(t.frame) || 0) * TICKS_PER_FRAME;
    const snd = soundItem(at, t.se);
    if (snd) items.push(snd);
    const scope = Number(t.flashScope) || 0;
    if (scope === 1 || scope === 2) {
      const fl = flashItem(at, t.flashColor, Number(t.flashDuration) || 0, scope === 2);
      if (fl) items.push(fl);
    } else if (scope === 3) {
      stats.simplified++; // hide-the-target flashes have no Atlas equivalent
    }
  }

  return {
    id: a.id,
    name: String(a.name || "Animation " + a.id),
    target: (Number(a.position) || 0) === 3 ? "screen" : "target",
    items,
  };
}

// ---------------------------------------------------------------------------
// MZ Effekseer conversion (real timings now; visuals resolved in assemble)
// ---------------------------------------------------------------------------

function convertMzAnimation(a: RmAnimation): { anim: BattleAnimation; hasSound: boolean; hasFlash: boolean } {
  const items: AnimItem[] = [];
  let hasSound = false, hasFlash = false;
  for (const t of (a.soundTimings || []) as RmMzAnimTiming[]) {
    const snd = t && soundItem(Math.max(0, Number(t.frame) || 0) * TICKS_PER_FRAME, t.se);
    if (snd) { items.push(snd); hasSound = true; }
  }
  for (const t of (a.flashTimings || []) as RmMzAnimTiming[]) {
    if (!t) continue;
    const fl = flashItem(Math.max(0, Number(t.frame) || 0) * TICKS_PER_FRAME, t.color, Number(t.duration) || 0, false);
    if (fl) { items.push(fl); hasFlash = true; }
  }
  const quake = Number(a.quakePower) || 0;
  if (quake > 0) {
    items.push({ at: 0, type: "shake", power: Math.min(9, Math.max(1, quake)), speed: 6, duration: 20 });
  }
  return {
    anim: { id: a.id, name: String(a.name || "Animation " + a.id), target: "target", items },
    hasSound,
    hasFlash,
  };
}

// ---------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------

/** Convert `raw.animations`. MV entries convert fully; MZ entries carry their
 *  real timings plus a fallback marker for `resolveAnimationFallbacks`. */
export function convertAnimations(raw: MzRawData, report: ImportReport): AnimationsConversion {
  const list = (raw.animations || []).filter(Boolean) as RmAnimation[];
  const animations: BattleAnimation[] = [];
  const fallbacks: AnimationFallback[] = [];
  if (!list.length) return { animations, fallbacks };

  const hints = elementHints(raw);
  const mvStats: MvStats = { sheets: new Set(), simplified: 0 };

  for (const a of list) {
    if (typeof a.effectName === "string" && !Array.isArray(a.frames)) {
      // MZ: Effekseer entry.
      const { anim, hasSound, hasFlash } = convertMzAnimation(a);
      fallbacks.push({
        index: animations.length,
        bucket: animBucketOf(a.name) || animBucketOf(a.effectName) || animBucketOf(hints.get(a.id) || "") || "hit",
        hasSound,
        hasFlash,
      });
      animations.push(anim);
    } else {
      animations.push(convertMvAnimation(a, mvStats));
    }
  }

  if (mvStats.sheets.size) {
    report.add({
      area: "Animations",
      kind: "partial",
      what: "battle animation sheet images",
      detail:
        "your animations play in Atlas — add their sheet images (from img/animations) to the " +
        "Assets library as pictures and they'll appear",
      count: mvStats.sheets.size,
    });
  }
  if (mvStats.simplified) {
    report.add({
      area: "Animations",
      kind: "partial",
      what: "animation frame details",
      detail:
        "Atlas plays one picture cell per animation frame — extra cells, offsets, spins, " +
        "color shifts, and fades were simplified",
      count: mvStats.simplified,
    });
  }

  return { animations, fallbacks };
}

/** Resolve MZ Effekseer fallbacks against the base project's animations
 *  (called from assembleProject — D4). Clones the matched animation's visual
 *  items onto each fallback entry (skipping sound/flash items the MZ entry
 *  already brought) and reports the substitution per animation. */
export function resolveAnimationFallbacks(
  baseAnims: BattleAnimation[],
  animations: BattleAnimation[],
  fallbacks: AnimationFallback[],
  report: ImportReport,
): void {
  if (!fallbacks.length || !baseAnims.length) return;
  const byBucket = new Map<string, BattleAnimation>();
  for (const b of baseAnims) {
    const bucket = animBucketOf(b.name);
    if (bucket && !byBucket.has(bucket)) byBucket.set(bucket, b);
  }
  const generic = byBucket.get("hit") || baseAnims[0];

  for (const fb of fallbacks) {
    const anim = animations[fb.index];
    if (!anim) continue;
    const exact = baseAnims.find((b) => b.name.toLowerCase() === anim.name.toLowerCase());
    const match = exact || byBucket.get(fb.bucket) || generic;
    const borrowed = (match.items || []).filter(
      (it) => !(fb.hasSound && it.type === "sound") && !(fb.hasFlash && it.type === "flash"),
    );
    anim.items = [...borrowed.map((it) => ({ ...it })), ...anim.items];
    report.add({
      area: "Animations",
      kind: "partial",
      what: 'the "' + anim.name + '" animation',
      detail:
        "its particle effects (Effekseer) can't come across — it now plays Atlas's \"" +
        match.name + "\" animation" +
        (fb.hasSound || fb.hasFlash ? " plus your own flashes and sounds" : ""),
    });
  }
}
