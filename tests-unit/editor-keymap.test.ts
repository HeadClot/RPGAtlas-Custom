/* RPGAtlas — tests-unit/editor-keymap.test.ts
   The pure key-dispatch rules behind the editor's global binding table
   (src/editor/keymap.ts, Phase 3 Stage A). The semantics under test are the
   ones the old boot.ts cascade encoded positionally: first-match-wins order,
   tri-state modifiers, the bare-Ctrl barrier, and `when` guards that fall
   through to later bindings. GPL-3.0-or-later. */

import { describe, expect, it } from "vitest";
import { dispatchKey, matchBinding, type KeyBinding, type KeyEventLike } from "../src/editor/keymap";

function ev(over: Partial<KeyEventLike>): KeyEventLike & { defaultPrevented: boolean } {
  const e = {
    code: "", key: "", ctrlKey: false, metaKey: false, shiftKey: false,
    defaultPrevented: false,
    preventDefault() { e.defaultPrevented = true; },
  };
  return Object.assign(e, over);
}

describe("matchBinding", () => {
  it("matches by code list and by produced key as alternatives", () => {
    const b: KeyBinding[] = [
      { codes: ["Equal", "NumpadAdd"], run: () => {} },
      { key: "?", run: () => {} },
    ];
    expect(matchBinding(b, ev({ code: "NumpadAdd" }))).toBe(b[0]);
    expect(matchBinding(b, ev({ code: "Slash", key: "?", shiftKey: true }))).toBe(b[1]);
    expect(matchBinding(b, ev({ code: "KeyA", key: "a" }))).toBeNull();
  });

  it("treats ctrl as tri-state: require, forbid, don't-care", () => {
    const requires: KeyBinding[] = [{ codes: ["KeyZ"], ctrl: true, run: () => {} }];
    const forbids: KeyBinding[] = [{ codes: ["Tab"], ctrl: false, run: () => {} }];
    const ignores: KeyBinding[] = [{ codes: ["Escape"], run: () => {} }];
    expect(matchBinding(requires, ev({ code: "KeyZ" }))).toBeNull();
    expect(matchBinding(requires, ev({ code: "KeyZ", ctrlKey: true }))).toBe(requires[0]);
    expect(matchBinding(requires, ev({ code: "KeyZ", metaKey: true }))).toBe(requires[0]); // meta counts as ctrl
    expect(matchBinding(forbids, ev({ code: "Tab", ctrlKey: true }))).toBeNull();
    expect(matchBinding(ignores, ev({ code: "Escape", ctrlKey: true }))).toBe(ignores[0]);
  });

  it("first match wins, and a failed `when` guard keeps searching", () => {
    let mode = "height";
    const b: KeyBinding[] = [
      { codes: ["Digit1"], when: () => mode === "height", run: () => {} },
      { codes: ["Digit1"], when: () => mode === "map", run: () => {} },
    ];
    expect(matchBinding(b, ev({ code: "Digit1" }))).toBe(b[0]);
    mode = "map";
    expect(matchBinding(b, ev({ code: "Digit1" }))).toBe(b[1]);
    mode = "event";
    expect(matchBinding(b, ev({ code: "Digit1" }))).toBeNull();
  });

  it("a keyless binding is a barrier: any key within its modifier class", () => {
    const hits: string[] = [];
    const b: KeyBinding[] = [
      { codes: ["KeyS"], ctrl: true, run: () => hits.push("save") },
      { ctrl: true, run: () => hits.push("barrier") },
      { codes: ["KeyQ"], ctrl: false, run: () => hits.push("tool") },
    ];
    dispatchKey(b, ev({ code: "KeyQ", ctrlKey: true }));  // unbound Ctrl chord
    expect(hits).toEqual(["barrier"]);                     // …swallowed, tool NOT run
    dispatchKey(b, ev({ code: "KeyQ" }));
    expect(hits).toEqual(["barrier", "tool"]);
  });
});

describe("dispatchKey", () => {
  it("runs the match, honors preventDefault, reports consumption", () => {
    let ran = 0;
    const b: KeyBinding[] = [{ codes: ["F1"], preventDefault: true, run: () => ran++ }];
    const hit = ev({ code: "F1" });
    expect(dispatchKey(b, hit)).toBe(true);
    expect(ran).toBe(1);
    expect(hit.defaultPrevented).toBe(true);
    const miss = ev({ code: "F9" });
    expect(dispatchKey(b, miss)).toBe(false);
    expect(miss.defaultPrevented).toBe(false);
  });

  it("does not preventDefault unless asked (plain tool/zoom keys today)", () => {
    const b: KeyBinding[] = [{ codes: ["KeyQ"], run: () => {} }];
    const hit = ev({ code: "KeyQ" });
    dispatchKey(b, hit);
    expect(hit.defaultPrevented).toBe(false);
  });
});
