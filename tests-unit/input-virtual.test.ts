/* RPGAtlas — tests-unit/input-virtual.test.ts
   Virtual touch-input behavior for the classic logical input factory. */

import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

type Input = {
  attachDOM(document?: EventTarget): void;
  setVirtualAction(action: string, held: boolean): void;
  clearVirtualActions(): void;
  poll(): void;
  pressed(action: string): boolean;
  justPressed(action: string): boolean;
  consume(action: string): boolean;
  dir(): number;
};
type Harness = { input: Input; window: EventTarget; document: EventTarget & { hidden: boolean } };
type InputFactory = (deps: Record<string, unknown>) => Input;

function makeHarness(menuOpen = false, menuEvents: Array<[string, boolean]> = []): Harness {
  const document = Object.assign(new EventTarget(), { hidden: false });
  const window = Object.assign(new EventTarget(), { navigator: { getGamepads: () => [] } });
  const sandbox: Record<string, unknown> = { document, window, navigator: window.navigator, Event };
  const source = readFileSync("js/runtime/input.js", "utf8");
  runInNewContext(source, sandbox);
  const factory = (window as typeof window & { createInputSystem: InputFactory }).createInputSystem;
  const input = factory({
    document,
    window,
    navigator: window.navigator,
    defaultBindings: { keyboard: {}, gamepad: {} },
    isMenuOpen: () => menuOpen,
    onMenuNav: (action: string, repeat: boolean) => menuEvents.push([action, repeat]),
  }) as Input;
  input.attachDOM(document);
  return { input, window, document };
}

describe("virtual input actions", () => {
  it("preserves held state and produces one fresh edge per press", () => {
    const { input } = makeHarness();

    input.setVirtualAction("up", true);
    expect(input.pressed("up")).toBe(true);
    expect(input.justPressed("up")).toBe(false);

    input.poll();
    expect(input.justPressed("up")).toBe(true);
    expect(input.consume("up")).toBe(true);
    expect(input.justPressed("up")).toBe(false);

    input.poll();
    expect(input.pressed("up")).toBe(true);
    expect(input.justPressed("up")).toBe(false);

    input.setVirtualAction("up", false);
    expect(input.pressed("up")).toBe(false);
  });

  it("supports simultaneous actions such as confirm plus jump", () => {
    const { input } = makeHarness();
    input.setVirtualAction("ok", true);
    input.setVirtualAction("jump", true);
    input.poll();

    expect(input.justPressed("ok")).toBe(true);
    expect(input.justPressed("jump")).toBe(true);
    expect(input.dir()).toBe(-1);
  });

  it("routes virtual menu presses and repeats directional holds", () => {
    const events: Array<[string, boolean]> = [];
    const { input } = makeHarness(true, events);
    input.setVirtualAction("down", true);
    input.poll();
    expect(events).toEqual([["down", false]]);
    expect(input.justPressed("down")).toBe(false);

    for (let i = 0; i < 16; i++) input.poll();
    expect(events).toContainEqual(["down", true]);

    input.setVirtualAction("down", false);
    input.poll();
    const count = events.length;
    for (let i = 0; i < 16; i++) input.poll();
    expect(events.length).toBe(count);
  });

  it("clears virtual held state and pending edges on blur", () => {
    const { input, window } = makeHarness();
    input.setVirtualAction("left", true);
    input.setVirtualAction("ok", true);
    window.dispatchEvent(new Event("blur"));
    input.poll();
    expect(input.pressed("left")).toBe(false);
    expect(input.justPressed("ok")).toBe(false);
  });
});
