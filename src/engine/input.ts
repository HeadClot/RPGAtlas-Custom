/* RPGAtlas — src/engine/input.ts
   Unified input wiring (keyboard + gamepad) and the "\input[action]" glyph
   text processor, extracted verbatim from the js/engine.js monolith (Phase 1
   Stage B). The input system itself lives in js/runtime/input.js (classic
   script) and is created here through the deps seam. Menu navigation is gated
   exactly as before: while any UI is open a press routes to UIStack.top.onKey
   and is never queued as a map edge. The live Input instance is late-bound
   onto the shared engine context; the glyph processor registers on the
   Plugins text-processor list through fns (the plugin runtime is extracted in
   a later step). GPL-3.0-or-later (see LICENSE). */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { Assets, RA, createInputSystem } from "../shared/deps.js";
import { esc } from "./util.js";
import { UIStack } from "./ui-stack.js";
import { ctx, fns } from "./state/engine-context.js";

export function actionLabel(key: any): string {
  const a = RA.INPUT_ACTIONS.find((x: any) => x.key === key);
  return a ? a.label : key;
}

// Inline input-prompt glyphs in messages: "\input[ok]" renders the glyph for whatever is bound
// to that action on the device in use *when the message opens* (a snapshot via activeDevice(),
// not live mid-message). Registered as a text processor so it runs post-esc like \i[n] and may
// emit the <img> glyph; it lives in the engine because it needs the live Input bindings. Falls
// back to the other device's primary binding, then to a plain text label.
function inputPromptGlyph(action: any): string {
  const act = String(action).toLowerCase();
  if (!RA.INPUT_ACTIONS.some((a: any) => a.key === act)) return "";
  const Input = ctx.Input;
  const b = Input.getBindings();
  let device = Input.activeDevice() === "gamepad" ? "gamepad" : "keyboard";
  let arr = (b[device] && b[device][act]) || [];
  if (!arr.length) {
    device = device === "gamepad" ? "keyboard" : "gamepad";
    arr = (b[device] && b[device][act]) || [];
  }
  if (!arr.length) return esc(actionLabel(act));
  const family =
    device === "gamepad" && Input.padFamily ? Input.padFamily() : "xbox";
  return Assets.inputGlyphHtml(device, arr[0], family, "msg-icon");
}

/** Create the unified input system, attach the DOM listeners, and register the
 *  \input[…] glyph text processor — called by the engine body at the exact
 *  point the monolith did all three. */
export function initInputSystem(): void {
  const Input = createInputSystem({
    defaultBindings: RA.defaultInput(),
    isMenuOpen: () => UIStack.length > 0,
    onMenuNav: (action: any, repeat: any) => {
      if (UIStack.length) UIStack[UIStack.length - 1].onKey(action, repeat);
    },
  });
  Input.attachDOM(document);
  ctx.Input = Input;
  fns.Plugins.textProcessors.push((html: string) =>
    html.replace(/\\input\[(\w+)\]/gi, (_m: any, action: any) =>
      inputPromptGlyph(action),
    ),
  );
}
