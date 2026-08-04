/* RPGAtlas — tests-unit/build-manifest.test.ts
   Sanity test proving the toolchain wiring: Vitest runs TS, and the shared build
   manifest is importable and well-formed. GPL-3.0-or-later. */

import { describe, expect, it } from "vitest";
// The manifest is plain ESM under js/; imported here at runtime for the test.
import {
  STANDALONE_EXPORT_FILES,
  PLAYER_BUNDLE_FILE,
  PLAYER_BUNDLE_DEV_URL,
  FRONTEND_INCLUDE,
  HTML_ENTRIES,
  PASSTHROUGH_DIRS,
} from "../js/build-manifest.mjs";

describe("build-manifest", () => {
  it("lists standalone export files, css first, player bundle last", () => {
    expect(Array.isArray(STANDALONE_EXPORT_FILES)).toBe(true);
    expect(STANDALONE_EXPORT_FILES.length).toBeGreaterThan(0);
    expect(STANDALONE_EXPORT_FILES[0]).toBe("css/play.css");
    // Phase 1: the engine ships as the single-file player bundle (last entry),
    // no longer as a fetchable js/engine.js classic script.
    expect(STANDALONE_EXPORT_FILES).not.toContain("js/engine.js");
    expect(STANDALONE_EXPORT_FILES[STANDALONE_EXPORT_FILES.length - 1]).toBe(
      PLAYER_BUNDLE_FILE,
    );
    expect(PLAYER_BUNDLE_FILE).toBe("player-bundle.js");
    expect(PLAYER_BUNDLE_DEV_URL).toBe("/__atlas/player-bundle.js");
  });

  it("lists the full frontend include set and HTML entries", () => {
    expect(FRONTEND_INCLUDE).toContain("index.html");
    expect(FRONTEND_INCLUDE).toContain("play.html");
    expect(FRONTEND_INCLUDE).toContain("js");
    expect(HTML_ENTRIES).toEqual(["index.html", "play.html"]);
  });

  it("derives passthrough dirs as frontend include minus HTML entries", () => {
    expect(PASSTHROUGH_DIRS).toEqual(["css", "js", "img", "bin"]);
    for (const entry of HTML_ENTRIES) {
      expect(PASSTHROUGH_DIRS).not.toContain(entry);
    }
  });
});
