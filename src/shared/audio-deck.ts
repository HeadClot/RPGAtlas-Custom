/* RPGAtlas — src/shared/audio-deck.ts
   The streamed-audio deck (Phase 6 Stage D): plays imported OGG/MP3/WAV
   library assets over the SAME WebAudio mixer the procedural chiptunes use
   (js/sfx.js exposes its buses via Sfx.getBuses()). The procedural paths are
   untouched — sfx.js routes any "asset:" reference here through the
   window.AtlasAudioDeck handshake and does everything else exactly as before.

   Channels:
   - BGM  — a two-slot crossfade deck of looping <audio> elements
            (equal-ramp fades on per-slot gains; one BGM owner at a time,
            enforced in Music.play).
   - BGS  — N looping ambience layers, diffed per map (setAmbience) with
            short fades; per-layer volume from map.ambience[].vol.
   - ME   — one-shot jingles that duck the BGM bus to 20% and restore.
   - SE   — decodeAudioData buffer cache (LRU) + BufferSource; the positional
            variant adds a StereoPanner + distance gain (pan/vol are computed
            by the caller from tile distance — see panGainForTile).

   URLs resolve through the asset library (object URLs) or, in standalone
   game exports, the embedded RPGATLAS_ASSETS data URLs — one reference
   works in both worlds. Autoplay rejections are retried once on the next
   user gesture (matching the engine's existing first-input audio unlock).

   Pure helpers (ambienceDiff, panGainForTile) are vitest-covered.
   GPL-3.0-or-later (see LICENSE). */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { Sfx } from "./deps.js";
import { assetUrl, assetUrlSync, libraryMetas } from "./asset-library";
import { ambienceDiff, type AmbienceLayer } from "./audio-math";

export { ambienceDiff, panGainForTile, type AmbienceLayer } from "./audio-math";

/** The audio role for a key: the library meta's kind, or (in exports) the
 *  embedded entry's kind; defaults to "se". */
export function audioKindOf(key: string): string {
  const meta = libraryMetas().find((m) => m.key === key);
  if (meta && meta.kind) return meta.kind;
  if (typeof window !== "undefined") {
    const embedded = (window as any).RPGATLAS_ASSETS;
    if (Array.isArray(embedded)) {
      const entry = embedded.find((e: any) => e && e.type === "audio" && "asset:audio/" + e.name === key);
      if (entry && entry.kind) return entry.kind;
    }
  }
  return "se";
}

// ---------------------------------------------------------------------------
// The deck
// ---------------------------------------------------------------------------

async function urlFor(key: string): Promise<string | null> {
  return assetUrlSync(key) || (await assetUrl(key));
}

/** One retry queue for autoplay-blocked elements: the next user gesture
 *  replays whatever the browser refused (same policy as the engine's
 *  first-input unlock). */
const blocked: HTMLAudioElement[] = [];
let unlockArmed = false;
function playElement(el: HTMLAudioElement): void {
  el.play().catch(() => {
    blocked.push(el);
    if (!unlockArmed && typeof document !== "undefined") {
      unlockArmed = true;
      const unlock = () => {
        unlockArmed = false;
        for (const b of blocked.splice(0)) {
          if (b.isConnected !== false && !b.ended && b.dataset.dead !== "1") b.play().catch(() => {});
        }
      };
      document.addEventListener("pointerdown", unlock, { once: true });
      document.addEventListener("keydown", unlock, { once: true });
    }
  });
}

interface Slot {
  key: string;
  el: HTMLAudioElement;
  gain: GainNode;
  pan?: StereoPannerNode;
}

/** Playback options shared by the streamed channels (M4·B): `pitch` is a
 *  playback rate (1 = normal, RM-style — speed AND pitch shift), `pan` −1…1. */
interface SlotOpts {
  pitch?: number;
  pan?: number;
}

function applyPitch(el: HTMLAudioElement, pitch: number | undefined): void {
  if (pitch == null) return;
  const rate = Math.max(0.1, Math.min(4, Number(pitch) || 1));
  try {
    (el as any).preservesPitch = false; // RM pitch shifts speed AND pitch
  } catch { /* older engines: rate-only is close enough */ }
  el.playbackRate = rate;
}

function makeSlot(
  actx: AudioContext,
  bus: AudioNode,
  url: string,
  key: string,
  loop: boolean,
  level: number,
  opts: SlotOpts = {},
): Slot {
  const el = new Audio(url);
  el.loop = loop;
  applyPitch(el, opts.pitch);
  const src = actx.createMediaElementSource(el);
  const gain = actx.createGain();
  gain.gain.value = level;
  src.connect(gain);
  let tail: AudioNode = gain;
  let pan: StereoPannerNode | undefined;
  if (opts.pan && actx.createStereoPanner) {
    pan = actx.createStereoPanner();
    pan.pan.value = Math.max(-1, Math.min(1, opts.pan));
    tail.connect(pan);
    tail = pan;
  }
  tail.connect(bus);
  playElement(el);
  return { key, el, gain, pan };
}

function fadeSlot(actx: AudioContext, slot: Slot, to: number, ms: number, thenStop: boolean): void {
  const t = actx.currentTime;
  const dur = Math.max(0.01, ms / 1000);
  slot.gain.gain.cancelScheduledValues(t);
  slot.gain.gain.setValueAtTime(slot.gain.gain.value, t);
  slot.gain.gain.linearRampToValueAtTime(to, t + dur);
  if (thenStop) {
    const el = slot.el;
    el.dataset.dead = "1";
    setTimeout(() => {
      el.pause();
      el.src = "";
    }, ms + 60);
  }
}

let bgmSlot: Slot | null = null;
const bgsSlots = new Map<string, Slot & { vol: number }>();
let meSlot: Slot | null = null;
const seBuffers = new Map<string, AudioBuffer>();
const SE_CACHE_MAX = 32;

const DEFAULT_FADE = 800;

export interface BgmOpts {
  fadeMs?: number;
  /** Target volume 0–1 (M4·B, RM 241; default 1). */
  vol?: number;
  pitch?: number;
  pan?: number;
  /** Start position in seconds (M4·B Resume BGM; applied once metadata is in). */
  seek?: number;
}

function seekWhenReady(el: HTMLAudioElement, seconds: number): void {
  const apply = () => {
    try { el.currentTime = Math.max(0, seconds); } catch { /* not seekable */ }
  };
  if (el.readyState >= 1) apply();
  else el.addEventListener("loadedmetadata", apply, { once: true });
}

/** Crossfade to a streamed BGM. Replaying the current key RETUNES it in place
 *  (MZ parameter-update semantics: volume/pitch/pan/seek without a restart). */
export async function playBgm(key: string, opts: BgmOpts = {}): Promise<void> {
  const level = opts.vol == null ? 1 : Math.max(0, Math.min(1, opts.vol));
  if (bgmSlot && bgmSlot.key === key) {
    const { actx } = Sfx.getBuses();
    fadeSlot(actx, bgmSlot, level, 250, false);
    applyPitch(bgmSlot.el, opts.pitch);
    if (opts.pan != null && bgmSlot.pan) bgmSlot.pan.pan.value = Math.max(-1, Math.min(1, opts.pan));
    if (opts.seek != null) seekWhenReady(bgmSlot.el, opts.seek);
    return;
  }
  const url = await urlFor(key);
  if (!url) {
    console.warn("[audio] missing BGM asset " + key);
    return;
  }
  const fade = opts.fadeMs == null ? DEFAULT_FADE : Math.max(0, opts.fadeMs);
  const { actx, bgm } = Sfx.getBuses();
  if (bgmSlot) fadeSlot(actx, bgmSlot, 0, fade, true);
  bgmSlot = makeSlot(actx, bgm, url, key, true, fade ? 0 : level, opts);
  if (opts.seek != null) seekWhenReady(bgmSlot.el, opts.seek);
  if (fade) fadeSlot(actx, bgmSlot, level, fade, false);
}

/** The playing streamed BGM + its position, for Save BGM (M4·B, RM 243). */
export function bgmPosition(): { key: string; pos: number } | null {
  if (!bgmSlot) return null;
  let pos = 0;
  try { pos = bgmSlot.el.currentTime || 0; } catch { /* detached element */ }
  return { key: bgmSlot.key, pos };
}

/** Fade out and stop the streamed BGM (procedural themes call this too). */
export function stopBgm(opts: { fadeMs?: number } = {}): void {
  if (!bgmSlot) return;
  const fade = opts.fadeMs == null ? DEFAULT_FADE : Math.max(0, opts.fadeMs);
  const { actx } = Sfx.getBuses();
  fadeSlot(actx, bgmSlot, 0, fade, true);
  bgmSlot = null;
}

/** Reconcile the looping ambience layers with a map's wanted list. `fadeMs`
 *  overrides the 500 ms default (M4·B Fadeout BGS). */
export async function setAmbience(layers: AmbienceLayer[], opts: { fadeMs?: number } = {}): Promise<void> {
  const fade = opts.fadeMs == null ? 500 : Math.max(0, opts.fadeMs);
  const current = Array.from(bgsSlots.values(), (s) => ({ key: s.key, vol: s.vol }));
  const { start, stop, retune } = ambienceDiff(current, layers || []);
  if (!start.length && !stop.length && !retune.length) return;
  const { actx, bgs } = Sfx.getBuses();
  for (const key of stop) {
    const slot = bgsSlots.get(key)!;
    bgsSlots.delete(key);
    fadeSlot(actx, slot, 0, fade, true);
  }
  for (const { key, vol } of retune) {
    const slot = bgsSlots.get(key)!;
    slot.vol = vol;
    fadeSlot(actx, slot, vol, fade, false);
  }
  for (const { key, vol, pitch, pan } of start) {
    const url = await urlFor(key);
    if (!url) {
      console.warn("[audio] missing ambience asset " + key);
      continue;
    }
    const slot = makeSlot(actx, bgs, url, key, true, 0, { pitch, pan }) as Slot & { vol: number };
    slot.vol = vol;
    bgsSlots.set(key, slot);
    fadeSlot(actx, slot, vol, fade, false);
  }
}

/** One-shot jingle on the ME bus. Default: duck the BGM bus to 20% and
 *  restore (the Phase 6 behavior, byte-identical). `interrupt: true` (M4·B,
 *  MZ ME semantics) PAUSES a streamed BGM element instead and resumes it when
 *  the jingle ends; a procedural chiptune still ducks (it has no position to
 *  pause — spec-logged). */
export async function playMe(key: string, opts: SlotOpts & { interrupt?: boolean; vol?: number } = {}): Promise<void> {
  const url = await urlFor(key);
  if (!url) return;
  const { actx, me, bgm } = Sfx.getBuses();
  if (meSlot) fadeSlot(actx, meSlot, 0, 120, true);
  const paused = opts.interrupt && bgmSlot && !bgmSlot.el.paused ? bgmSlot : null;
  if (paused) paused.el.pause();
  const duck = !paused;
  const restore = bgm.gain.value;
  if (duck) {
    const t = actx.currentTime;
    bgm.gain.cancelScheduledValues(t);
    bgm.gain.setValueAtTime(bgm.gain.value, t);
    bgm.gain.linearRampToValueAtTime(restore * 0.2, t + 0.25);
  }
  const slot = makeSlot(actx, me, url, key, false, opts.vol == null ? 1 : Math.max(0, Math.min(1, opts.vol)), opts);
  meSlot = slot;
  slot.el.onended = () => {
    if (meSlot === slot) meSlot = null;
    if (paused) {
      // Resume the interrupted BGM if it's still the live slot.
      if (paused === bgmSlot && paused.el.dataset.dead !== "1") playElement(paused.el);
      return;
    }
    const t2 = actx.currentTime;
    bgm.gain.cancelScheduledValues(t2);
    bgm.gain.setValueAtTime(bgm.gain.value, t2);
    bgm.gain.linearRampToValueAtTime(restore, t2 + 0.4);
  };
}

async function seBuffer(key: string): Promise<AudioBuffer | null> {
  const hit = seBuffers.get(key);
  if (hit) {
    // refresh LRU position
    seBuffers.delete(key);
    seBuffers.set(key, hit);
    return hit;
  }
  const url = await urlFor(key);
  if (!url) return null;
  const { actx } = Sfx.getBuses();
  try {
    const buf = await actx.decodeAudioData(await (await fetch(url)).arrayBuffer());
    seBuffers.set(key, buf);
    if (seBuffers.size > SE_CACHE_MAX) seBuffers.delete(seBuffers.keys().next().value!);
    return buf;
  } catch (e) {
    console.warn("[audio] could not decode " + key, e);
    return null;
  }
}

/** Live streamed-SE sources, so Stop SE (M4·B, RM 251) can silence them. */
const activeSes = new Set<AudioBufferSourceNode>();

/** Play an imported sound: ME-kind assets duck-and-jingle, everything else
 *  is a (optionally positional/pitched) buffered SE. `rate` is a playback
 *  rate (1 = normal; RM pitch/100). */
export async function playSound(key: string, opts: { pan?: number; vol?: number; rate?: number } = {}): Promise<void> {
  if (audioKindOf(key) === "me") {
    return playMe(key);
  }
  const buf = await seBuffer(key);
  if (!buf) return;
  const { actx, se } = Sfx.getBuses();
  const src = actx.createBufferSource();
  src.buffer = buf;
  if (opts.rate != null && opts.rate !== 1) {
    src.playbackRate.value = Math.max(0.1, Math.min(4, Number(opts.rate) || 1));
  }
  let node: AudioNode = src;
  if (opts.pan) {
    const pan = actx.createStereoPanner();
    pan.pan.value = Math.max(-1, Math.min(1, opts.pan));
    node.connect(pan);
    node = pan;
  }
  if (opts.vol != null && opts.vol !== 1) {
    const g = actx.createGain();
    g.gain.value = Math.max(0, Math.min(1, opts.vol));
    node.connect(g);
    node = g;
  }
  node.connect(se);
  activeSes.add(src);
  src.onended = () => activeSes.delete(src);
  src.start();
}

/** Stop every playing streamed SE (M4·B, RM 251). Procedural SEs are
 *  fire-and-forget blips and are not tracked. */
export function stopSe(): void {
  for (const src of activeSes) {
    try { src.stop(); } catch { /* already ended */ }
  }
  activeSes.clear();
}

/** Introspection for tests/diagnostics: what the deck is currently playing. */
export function deckState(): { bgmKey: string | null; meKey: string | null; ambience: { key: string; vol: number }[] } {
  return {
    bgmKey: bgmSlot ? bgmSlot.key : null,
    meKey: meSlot ? meSlot.key : null,
    ambience: Array.from(bgsSlots.values(), (s) => ({ key: s.key, vol: s.vol })),
  };
}

// The classic-script handshake: js/sfx.js routes "asset:" references here.
if (typeof window !== "undefined") {
  (window as any).AtlasAudioDeck = { playBgm, stopBgm, bgmPosition, setAmbience, playMe, playSound, stopSe, deckState };
}
