import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { assetRead, assetWriteInPlace, assetsScan } from "../src/platform/electrobun/native/assets";
import { projectCreate, projectOpen, projectSave } from "../src/platform/electrobun/native/project";
import { containedJoin, ProjectError, validateComponent } from "../src/platform/electrobun/native/path-guard";
import { projectArgFromArgs } from "../src/platform/electrobun/native/launch";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe("Electrobun native contracts", () => {
  it("rejects traversal and unsafe project components", () => {
    const root = mkdtempSync(join(tmpdir(), "rpgatlas-electrobun-"));
    roots.push(root);
    expect(() => containedJoin(root, "..")).toThrowError(ProjectError);
    expect(() => validateComponent("CON")).toThrowError(ProjectError);
    expect(() => validateComponent("nested/name")).toThrowError(ProjectError);
  });

  it("creates, opens, saves, and backs up a project folder", () => {
    const parent = mkdtempSync(join(tmpdir(), "rpgatlas-electrobun-"));
    roots.push(parent);
    const created = projectCreate(parent, "Demo", '{"version":1}');
    expect(projectOpen(join(parent, "Demo", "game.rpgatlas")).document).toBe('{"version":1}');
    projectSave(created.root, '{"version":2}');
    expect(readFileSync(join(created.root, "game.rpgatlas"), "utf8")).toBe('{"version":2}');
    expect(assetsScan(created.root)).toEqual([]);
  });

  it("stores in-place assets and returns their metadata and bytes", () => {
    const parent = mkdtempSync(join(tmpdir(), "rpgatlas-electrobun-"));
    roots.push(parent);
    const project = projectCreate(parent, "Assets", "{}");
    const path = assetWriteInPlace(project.root, "characters", "hero.png", Buffer.from("png").toString("base64"));
    expect(path).toBe("assets/characters/hero.png");
    expect(assetRead(project.root, path, null)).toMatchObject({ data: Buffer.from("png").toString("base64"), mime: "image/png" });
    expect(assetsScan(project.root)).toHaveLength(1);
  });

  it("parses relative, absolute, and flag-only launch arguments", () => {
    expect(projectArgFromArgs(["RPGAtlas.exe", "games/demo.rpgatlas"], "C:\\Work")).toBe("C:\\Work\\games\\demo.rpgatlas");
    expect(projectArgFromArgs(["RPGAtlas.exe", "--profile", "C:\\Games\\demo.rpgatlas"], "C:\\Work")).toBe("C:\\Games\\demo.rpgatlas");
    expect(projectArgFromArgs(["RPGAtlas.exe", "--profile"], "C:\\Work")).toBeNull();
  });
});
