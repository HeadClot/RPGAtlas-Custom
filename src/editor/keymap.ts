/* RPGAtlas — src/editor/keymap.ts
   Pure ordered-binding keyboard dispatcher (Phase 3 Stage A).

   The editor's global keydown cascade (boot.ts) used to be one hardcoded
   handler whose if/switch ORDER carried the semantics (height-mode digits win
   over layer digits; an unmatched Ctrl chord still swallows the event; …).
   This module turns that into data: an ordered KeyBinding[] where the first
   binding whose keys, modifiers, and `when` guard all match wins. boot.ts owns
   the table; this module owns the matching rules — it imports nothing and
   touches no DOM, so the rules are unit-testable (tests-unit/editor-keymap).

   Modifier semantics are tri-state: `ctrl: true` requires Ctrl or Meta held,
   `ctrl: false` requires neither held, `ctrl: undefined` matches either.
   Same for `shift`. A binding with no `codes` and no `key` is a barrier: it
   matches any key (subject to its modifiers/guard) and, with an empty run,
   reproduces "this modifier class never falls through" rules.
   Copyright (C) 2026 RPGAtlas contributors — GPL-3.0-or-later (see LICENSE). */

export interface KeyEventLike {
  code: string;
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  preventDefault(): void;
}

export interface KeyBinding {
  /** e.code values this binding matches (physical keys, layout-independent). */
  codes?: string[];
  /** e.key value this binding matches (produced character — for "?" etc.). */
  key?: string;
  /** true = require Ctrl/Meta, false = forbid, undefined = don't care. */
  ctrl?: boolean;
  /** true = require Shift, false = forbid, undefined = don't care. */
  shift?: boolean;
  /** Extra context guard (mode checks etc.); unmatched guard = keep searching. */
  when?: () => boolean;
  /** Call e.preventDefault() before running (browser-shortcut overrides). */
  preventDefault?: boolean;
  run: (e: KeyEventLike) => void;
}

function modOk(required: boolean | undefined, held: boolean) {
  return required === undefined || required === held;
}

/** First binding in array order whose keys, modifiers, and guard match. */
export function matchBinding(bindings: KeyBinding[], e: KeyEventLike): KeyBinding | null {
  const ctrlHeld = e.ctrlKey || e.metaKey;
  for (const b of bindings) {
    if (!modOk(b.ctrl, ctrlHeld) || !modOk(b.shift, e.shiftKey)) continue;
    // Key match: codes and key are alternatives; neither present = any key (barrier).
    if (b.codes || b.key) {
      const codeHit = !!b.codes && b.codes.indexOf(e.code) >= 0;
      const keyHit = b.key !== undefined && e.key === b.key;
      if (!codeHit && !keyHit) continue;
    }
    if (b.when && !b.when()) continue;
    return b;
  }
  return null;
}

/** Match + execute. Returns true when a binding consumed the event. */
export function dispatchKey(bindings: KeyBinding[], e: KeyEventLike): boolean {
  const b = matchBinding(bindings, e);
  if (!b) return false;
  if (b.preventDefault) e.preventDefault();
  b.run(e);
  return true;
}
