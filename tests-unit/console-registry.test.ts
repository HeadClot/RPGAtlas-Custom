/* RPGAtlas — tests-unit/console-registry.test.ts
   The Console command core (src/editor/console/registry.ts): tokenizer,
   flag extraction, subcommand resolution, executor behavior (unknown-command
   suggestions, required-arg checks, --json), completion, and the
   programmatic AtlasConsole surface. The registry is DOM-free by design, so
   these run without a browser. GPL-3.0-or-later. */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { beforeAll, describe, expect, it } from "vitest";
import {
  completeLine, done, executeConsoleLine, extractFlags, fail,
  installConsoleApi, listConsoleCommands, registerConsoleCommand,
  resolveCommand, resultText, suggestCommand, table, text, tokenize,
} from "../src/editor/console/registry";

beforeAll(() => {
  registerConsoleCommand({
    name: "greet",
    group: "Test",
    summary: "say hello",
    usage: "greet <name>",
    args: [{ name: "name", hint: "who", required: true }],
    run: (args) => done([text("hello " + args[0])], { name: args[0] }),
  });
  registerConsoleCommand({
    name: "build",
    group: "Test",
    summary: "hub",
    usage: "build",
    run: () => done([text("hub")]),
  });
  registerConsoleCommand({
    name: "build web",
    group: "Test",
    summary: "sub",
    usage: "build web",
    run: () => done([text("built web")], { target: "web" }),
  });
  registerConsoleCommand({
    name: "boom",
    group: "Test",
    summary: "throws",
    usage: "boom",
    run: () => { throw new Error("kaput"); },
  });
});

describe("tokenize", () => {
  it("splits on whitespace and honors quotes", () => {
    expect(tokenize("find Old Mine")).toEqual(["find", "Old", "Mine"]);
    expect(tokenize('find "Old Mine" x')).toEqual(["find", "Old Mine", "x"]);
    expect(tokenize("give 'Iron Sword' 3")).toEqual(["give", "Iron Sword", "3"]);
    expect(tokenize("   ")).toEqual([]);
    expect(tokenize('say ""')).toEqual(["say", ""]);
  });
});

describe("extractFlags", () => {
  it("pulls --flags out anywhere and keeps order of the rest", () => {
    const { rest, flags } = extractFlags(["stats", "--json", "x", "--depth=2"]);
    expect(rest).toEqual(["stats", "x"]);
    expect(flags).toEqual({ json: true, depth: "2" });
  });
});

describe("resolveCommand", () => {
  it("prefers the longest multi-word match", () => {
    const hit = resolveCommand(["build", "web", "extra"]);
    expect(hit!.def.name).toBe("build web");
    expect(hit!.args).toEqual(["extra"]);
  });
  it("falls back to the one-word command", () => {
    expect(resolveCommand(["build", "mars"])!.def.name).toBe("build");
    expect(resolveCommand(["nope"])).toBeNull();
  });
});

describe("executeConsoleLine", () => {
  it("runs a command with args", async () => {
    const r = await executeConsoleLine("greet Ada");
    expect(r.ok).toBe(true);
    expect(resultText(r)).toBe("hello Ada");
    expect(r.data).toEqual({ name: "Ada" });
  });
  it("suggests a close command name", async () => {
    const r = await executeConsoleLine("gret Ada");
    expect(r.ok).toBe(false);
    expect(resultText(r)).toContain("greet");
  });
  it("reports a missing required argument with usage", async () => {
    const r = await executeConsoleLine("greet");
    expect(r.ok).toBe(false);
    expect(resultText(r)).toContain("greet <name>");
  });
  it("turns thrown errors into friendly failures", async () => {
    const r = await executeConsoleLine("boom");
    expect(r.ok).toBe(false);
    expect(resultText(r)).toContain("kaput");
  });
  it("--json replaces blocks with the data payload", async () => {
    const r = await executeConsoleLine("build web --json");
    expect(r.blocks).toEqual([{ kind: "json", data: { target: "web" } }]);
  });
  it("is a no-op on empty input", async () => {
    const r = await executeConsoleLine("   ");
    expect(r.ok).toBe(true);
    expect(r.blocks).toEqual([]);
  });
});

describe("completion & suggestions", () => {
  it("completes command names by prefix", () => {
    expect(completeLine("bui")).toEqual(["build", "build web"]);
    expect(completeLine("build w")).toEqual(["build web"]);
  });
  it("suggests near-misses within edit distance", () => {
    expect(suggestCommand("gret")).toBe("greet");
    expect(suggestCommand("zzzzzz")).toBeNull();
  });
});

describe("metadata & programmatic surface", () => {
  it("lists commands with machine-readable specs", () => {
    const greet = listConsoleCommands().find((c) => c.name === "greet");
    expect(greet).toBeTruthy();
    expect(greet!.args[0]).toEqual({ name: "name", hint: "who", required: true });
  });
  it("installs AtlasConsole with serializable results", async () => {
    const target: any = {};
    installConsoleApi(target);
    expect(target.AtlasConsole.version).toBe(1);
    const out = await target.AtlasConsole.run("greet Ada");
    expect(out).toEqual({ ok: true, text: "hello Ada", data: { name: "Ada" } });
    expect(() => JSON.stringify(out)).not.toThrow();
  });
});

describe("resultText", () => {
  it("flattens tables and text", () => {
    const r = done([text("head"), table(["A", "B"], [["1", "2"]])]);
    expect(resultText(r)).toBe("head\nA | B\n1 | 2");
  });
  it("keeps failure messages", () => {
    expect(resultText(fail("nope"))).toBe("nope");
  });
});
