/* RPGAtlas — tests-unit/mz-script.test.ts
   Project Compass M5·B: the read-only RPG Maker Script-command adapter
   (src/shared/mz-script.ts, mig-0 D5). Two surfaces under test — the
   import-time gate (analyzeMzScript) and the runtime shim (mzGlobalsFromState +
   runMzScript/evalMzScript). Pure module, so it runs in the vitest node env
   with no engine/DOM stubs. GPL-3.0-or-later. */

import { describe, it, expect, vi } from "vitest";
import {
  analyzeMzScript,
  mzGlobalsFromState,
  runMzScript,
  evalMzScript,
  type MzReadState,
} from "../src/shared/mz-script";

describe("analyzeMzScript — the import-time gate (D5 read-only subset)", () => {
  it("admits the supported read expressions", () => {
    for (const ok of [
      "$gameSwitches.value(2)",
      "$gameVariables.value(1) >= 5",
      "$gameSwitches.value(1) && $gameVariables.value(2) === 3",
      "$gameParty.gold() > 100",
      "$gameParty.size() > 1",
      "$gameParty.hasItem(3)",
      "!$gameSwitches.value(7)",
    ]) {
      expect(analyzeMzScript(ok).ok, ok).toBe(true);
    }
  });

  it("rejects WRITES — the fixtures' setValue lands out of scope (D5 note)", () => {
    for (const bad of [
      "$gameVariables.setValue(1, 999)",
      "$gameSwitches.setValue(2, true)",
      "$gameParty.gainGold(100)",
      "$gameParty.gainItem($dataItems[1], 1)",
    ]) {
      const v = analyzeMzScript(bad);
      expect(v.ok, bad).toBe(false);
      expect(v.reason).toBeTruthy();
    }
  });

  it("rejects other $game* / data globals it can't read yet", () => {
    for (const bad of [
      "$gameActors.actor(1).level",
      "$gameMap.mapId()",
      "$gameSystem.saveEnabled()",
      "$gamePlayer.x",
      "$dataItems[3].price",
    ]) {
      expect(analyzeMzScript(bad).ok, bad).toBe(false);
    }
  });

  it("rejects template literals — a ${…} interpolation would execute unvouched code", () => {
    for (const bad of [
      "$gameSwitches.value(`${$gameMap.regionId(0, 0)}`)",
      "$gameVariables.value(`${SceneManager.exit()}`) > 0",
      "$gameParty.hasItem(`3`)",
    ]) {
      const v = analyzeMzScript(bad);
      expect(v.ok, bad).toBe(false);
      expect(v.reason).toMatch(/backticks/);
    }
  });

  it("rejects bare identifiers, control flow, and other globals (new Function escape)", () => {
    for (const bad of [
      "if (a) { b(); }",
      "SceneManager.push(Scene_Menu)",
      "$gameSwitches = null",
      "for (var i = 0; i < 3; i++) {}",
      "Math.random() > 0.5",
      "$gameSwitches.value(1); require('fs')",
    ]) {
      expect(analyzeMzScript(bad).ok, bad).toBe(false);
    }
  });

  it("rejects the empty snippet and a snippet with no game-data read", () => {
    expect(analyzeMzScript("").ok).toBe(false);
    expect(analyzeMzScript("   ").ok).toBe(false);
    expect(analyzeMzScript("true").ok).toBe(false); // literal, reads nothing
  });

  it("a comment mentioning a forbidden global doesn't reject a clean read", () => {
    expect(analyzeMzScript("$gameSwitches.value(1) /* not $gameActors */").ok).toBe(true);
    expect(analyzeMzScript("$gameVariables.value(2) // set later by $gameMap").ok).toBe(true);
  });
});

describe("the runtime shim — mzGlobalsFromState + run/eval (read-only)", () => {
  const state: MzReadState = {
    switches: { 2: true, 3: false },
    vars: { 1: 42, 5: 7 },
    party: [{ actorId: 1 }, { actorId: 4 }],
    gold: 250,
    inv: { item: { 3: 2 }, weapon: {}, armor: { 9: 1 } },
  };

  it("$gameSwitches / $gameVariables read live state", () => {
    const g = mzGlobalsFromState(state);
    expect(g.$gameSwitches.value(2)).toBe(true);
    expect(g.$gameSwitches.value(3)).toBe(false);
    expect(g.$gameSwitches.value(99)).toBe(false); // absent → false
    expect(g.$gameVariables.value(1)).toBe(42);
    expect(g.$gameVariables.value(99)).toBe(0); // absent → 0
  });

  it("$gameParty basics: size / gold / members / hasItem", () => {
    const g = mzGlobalsFromState(state);
    expect(g.$gameParty.size()).toBe(2);
    expect(g.$gameParty.gold()).toBe(250);
    expect(g.$gameParty.members()).toEqual([1, 4]);
    expect(g.$gameParty.hasItem(3)).toBe(true); // owned item
    expect(g.$gameParty.hasItem(9)).toBe(true); // owned armor
    expect(g.$gameParty.hasItem(5)).toBe(false); // not owned
    expect(g.$gameParty.hasItem({ id: 3 })).toBe(true); // object form
  });

  it("evalMzScript evaluates a gated condition to a boolean over live state", () => {
    const g = mzGlobalsFromState(state);
    expect(evalMzScript("$gameSwitches.value(2)", g)).toBe(true);
    expect(evalMzScript("$gameSwitches.value(3)", g)).toBe(false);
    expect(evalMzScript("$gameVariables.value(1) >= 40 && $gameParty.size() > 1", g)).toBe(true);
    expect(evalMzScript("$gameParty.gold() > 1000", g)).toBe(false);
  });

  it("evalMzScript returns false (never throws) on a broken expression", () => {
    const g = mzGlobalsFromState(state);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(evalMzScript("$gameVariables.value(1) +", g)).toBe(false); // syntax error
    spy.mockRestore();
  });

  it("runMzScript executes without throwing and never mutates the state (read-only)", () => {
    const snapshot = JSON.stringify(state);
    const g = mzGlobalsFromState(state);
    expect(() => runMzScript("$gameSwitches.value(2) && $gameVariables.value(1)", g)).not.toThrow();
    expect(JSON.stringify(state)).toBe(snapshot); // the shim exposes no setter to change it
  });

  it("the shim has no setter — a write attempt is a swallowed runtime no-op", () => {
    const g = mzGlobalsFromState(state);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    // $gameVariables.setValue isn't a function on the shim → TypeError → swallowed.
    expect(() => runMzScript("$gameVariables.setValue(1, 0)", g)).not.toThrow();
    expect(state.vars![1]).toBe(42); // unchanged
    spy.mockRestore();
  });
});
