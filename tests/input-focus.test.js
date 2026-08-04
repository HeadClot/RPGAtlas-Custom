"use strict";

// Headless tests for held-state clearing on focus loss in js/runtime/input.js:
// a key or pad button held when the window blurs (alt-tab, native file dialog)
// or the tab goes hidden must not stay "held" forever, because its release
// fires no keyup/poll diff while unfocused. Mirrors the vm harness in
// tests/input-capture.test.js (loads plugins.js + data.js for RA, then input.js;
// document/window are injected fakes so their handlers can be fired directly).

const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const context = vm.createContext({ console, Assets: { T: {} }, window: {} });
vm.runInContext(fs.readFileSync("js/plugins.js", "utf8"), context, { filename: "js/plugins.js" });
vm.runInContext(fs.readFileSync("js/data.js", "utf8"), context, { filename: "js/data.js" });
vm.runInContext(fs.readFileSync("js/runtime/input.js", "utf8"), context, { filename: "js/runtime/input.js" });

const createInputSystem = vm.runInContext("createInputSystem", context);
const RA = vm.runInContext("RA", context);
const defaultInput = () => JSON.parse(JSON.stringify(RA.defaultInput()));
const PAD_BUTTONS = RA.PAD_BUTTONS;

// Fake Standard Gamepad from a list of pressed PAD_BUTTONS names (axes centered).
function pad(down, axes) {
  const buttons = PAD_BUTTONS.map((name) => ({ pressed: down.indexOf(name) !== -1, value: down.indexOf(name) !== -1 ? 1 : 0 }));
  return { index: 0, buttons, axes: axes || [0, 0] };
}

// Input wired to fake document + window (captured handlers) + mutable pad list.
function makeInput() {
  let pads = [];
  const docHandlers = {};
  const winHandlers = {};
  const fakeDoc = { hidden: false, addEventListener: (type, fn) => { docHandlers[type] = fn; } };
  const Input = createInputSystem({
    defaultBindings: defaultInput(),
    padButtons: PAD_BUTTONS,
    document: fakeDoc,
    window: { addEventListener: (type, fn) => { winHandlers[type] = fn; } },
    navigator: { getGamepads: () => pads },
    isMenuOpen: () => false,
    onMenuNav: () => {},
  });
  Input.attachDOM();
  return {
    Input,
    doc: fakeDoc,
    setPads: (p) => { pads = p; },
    keydown: (code, repeat) => docHandlers.keydown({ code, repeat: !!repeat, preventDefault() {} }),
    keyup: (code) => docHandlers.keyup({ code, preventDefault() {} }),
    blur: () => winHandlers.blur(),
    visibilitychange: () => docHandlers.visibilitychange(),
  };
}

// 1. A held keyboard action is released by window blur (the stuck-key repro:
//    hold move key, alt-tab away, release while unfocused, come back).
{
  const t = makeInput();
  t.keydown("KeyW"); // bound to "up"
  t.Input.poll();
  assert.equal(t.Input.pressed("up"), true, "key held before blur");
  t.blur();
  assert.equal(t.Input.pressed("up"), false, "blur clears the held action");
  // A fresh press after refocus works normally.
  t.keydown("KeyW");
  assert.equal(t.Input.pressed("up"), true, "fresh press after refocus is held again");
}

// 2. visibilitychange -> hidden clears held state; becoming visible again does not.
{
  const t = makeInput();
  t.keydown("ShiftLeft"); // bound to "dash"
  assert.equal(t.Input.pressed("dash"), true, "dash held");
  t.doc.hidden = false;
  t.visibilitychange(); // still visible — no clear
  assert.equal(t.Input.pressed("dash"), true, "visible visibilitychange leaves state alone");
  t.doc.hidden = true;
  t.visibilitychange();
  assert.equal(t.Input.pressed("dash"), false, "hidden tab clears the held action");
}

// 3. Blur also drops a queued-but-unpolled edge, so the press can't fire an
//    action a frame after focus already left.
{
  const t = makeInput();
  t.keydown("KeyZ"); // bound to "ok" — queues an edge for the next poll
  t.blur();
  t.Input.poll();
  assert.equal(t.Input.justPressed("ok"), false, "queued edge is dropped on blur");
}

// 4. Gamepad slot held state is cleared too (poll() reseeds from the live pad,
//    so a pad still physically held simply reads as held again — no stale edge).
{
  const t = makeInput();
  t.setPads([pad(["face_south"])]); // bound to "ok"
  t.Input.poll();
  assert.equal(t.Input.pressed("ok"), true, "pad button held");
  t.blur();
  assert.equal(t.Input.pressed("ok"), false, "blur clears pad held state");
  // Pad released while unfocused: next poll sees it up, and no fresh edge fires.
  t.setPads([pad([])]);
  t.Input.poll();
  assert.equal(t.Input.pressed("ok"), false, "released pad stays up after refocus");
  assert.equal(t.Input.justPressed("ok"), false, "no phantom edge after refocus");
}

// 5. The keyup that never happened: after blur, releasing the key while
//    unfocused and re-pressing it on refocus produces a fresh edge (heldCodes
//    was cleared, so the press is not treated as an OS repeat of stale state).
{
  const t = makeInput();
  t.keydown("KeyZ");
  t.Input.poll(); // drain the first edge
  t.blur();
  t.keydown("KeyZ"); // fresh press after refocus (no keyup ever fired)
  t.Input.poll();
  assert.equal(t.Input.justPressed("ok"), true, "re-press after blur fresh-edges its action");
}

console.log("Input focus-loss tests passed.");
