/* RPGAtlas — tests-unit/portmaster-package.test.ts
   Pure contract tests for the experimental PortMaster ARM64 package format.
   GPL-3.0-or-later. */

import { describe, expect, it } from "vitest";
import {
  buildPortZip,
  gameInfoXml,
  gptkConfig,
  launcherNameFor,
  launcherScript,
  portManifest,
  portNameFor,
} from "../scripts/package-portmaster.mjs";

const enc = (value: string) => new TextEncoder().encode(value);

function zipEntries(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = bytes.length - 22;
  expect(view.getUint32(eocd, true)).toBe(0x06054b50);
  const count = view.getUint16(eocd + 8, true);
  const centralOffset = view.getUint32(eocd + 16, true);
  const out: Array<{ name: string; mode: number; data: Uint8Array }> = [];
  let cursor = centralOffset;
  for (let i = 0; i < count; i++) {
    expect(view.getUint32(cursor, true)).toBe(0x02014b50);
    const nameLength = view.getUint16(cursor + 28, true);
    const name = new TextDecoder().decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
    const size = view.getUint32(cursor + 24, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const localNameLength = view.getUint16(localOffset + 26, true);
    const dataStart = localOffset + 30 + localNameLength;
    out.push({ name, mode: view.getUint32(cursor + 38, true) >>> 16, data: bytes.subarray(dataStart, dataStart + size) });
    cursor += 46 + nameLength;
  }
  return out;
}

describe("PortMaster package contract", () => {
  it("creates PortMaster-safe names and launcher names", () => {
    expect(portNameFor("A Knight's Quest! 2")).toBe("a_knight_s_quest_2");
    expect(launcherNameFor("A Knight's Quest! 2")).toBe("A_Knights_Quest_2.sh");
  });

  it("emits an ARM64 experimental manifest", () => {
    const manifest = portManifest({
      title: "Atlas Quest",
      description: "A test game.",
      portName: "atlas_quest",
      launcherName: "Atlas_Quest.sh",
    });
    expect(manifest.version).toBe(2);
    expect(manifest.items).toEqual(["Atlas_Quest.sh", "atlas_quest"]);
    expect(manifest.attr.arch).toEqual(["aarch64"]);
    expect(manifest.attr.rtr).toBe(false);
    expect(manifest.attr.reqs).toEqual(["highres"]);
  });

  it("escapes XML metadata and points EmulationStation at the launcher", () => {
    const xml = gameInfoXml({
      title: "A & B <Quest>",
      description: "Play > test",
      launcherName: "A_B.sh",
      releasedate: "20260804T000000",
    });
    expect(xml).toContain("<path>./A_B.sh</path>");
    expect(xml).toContain("A &amp; B &lt;Quest&gt;");
    expect(xml).toContain("Play &gt; test");
  });

  it("maps handheld buttons to the existing keyboard controls", () => {
    const gptk = gptkConfig();
    expect(gptk).toContain("a = z");
    expect(gptk).toContain("b = x");
    expect(gptk).toContain("up = up");
    expect(gptk).toContain("left_analog_right = d");
    expect(launcherScript({ portName: "atlas_quest" })).toContain("pm_finish");
    expect(launcherScript({ portName: "atlas_quest" })).toContain("XDG_DATA_HOME");
  });

  it("writes a valid zip and preserves executable mode bits", () => {
    const zip = buildPortZip([
      { name: "Atlas Quest.sh", data: enc("#!/bin/bash\n") },
      { name: "atlas_quest/atlas_quest.aarch64", data: enc("ELF") },
      { name: "port.json", data: enc("{}") },
    ]);
    const entries = zipEntries(zip);
    expect(entries.map((entry) => entry.name)).toEqual([
      "Atlas Quest.sh",
      "atlas_quest/atlas_quest.aarch64",
      "port.json",
    ]);
    expect(entries[0].mode & 0o111).toBeTruthy();
    expect(entries[1].mode & 0o111).toBeTruthy();
    expect(new TextDecoder().decode(entries[2].data)).toBe("{}");
  });
});
