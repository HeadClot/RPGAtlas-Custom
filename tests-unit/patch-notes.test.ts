/* RPGAtlas — tests-unit/patch-notes.test.ts
   Coverage for timestamped, append-only patch-note ordering and formatting. */

import { describe, expect, it } from "vitest";
import { PATCH_NOTES } from "../js/patch-notes.js";
import {
  formatPatchNoteDate,
  patchNoteTime,
  type PatchNoteLike,
  sortPatchNotes,
} from "../src/editor/core/patch-notes";

interface TestPatchNote extends PatchNoteLike {
  title?: string;
}

const notes = PATCH_NOTES as TestPatchNote[];

describe("patch notes", () => {
  it("accepts valid immutable timestamps on appended entries", () => {
    const timestamped = notes.filter((note) => note.timestamp);
    expect(timestamped.length).toBeGreaterThan(0);
    for (const note of timestamped) {
      expect(Date.parse(note.timestamp)).not.toBeNaN();
      expect(note.timestamp).toMatch(/T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
    }
  });

  it("sorts mixed timestamped and legacy notes newest-first", () => {
    const sorted = sortPatchNotes(notes);
    expect(sorted[0].title).toBe("Deterministic HD terrain texture updates");
    for (let i = 1; i < sorted.length; i += 1) {
      expect(patchNoteTime(sorted[i - 1])).toBeGreaterThanOrEqual(patchNoteTime(sorted[i]));
    }
  });

  it("keeps legacy date-only notes readable", () => {
    expect(formatPatchNoteDate({ date: "June 13, 2026" })).toBe("June 13, 2026");
  });

  it("formats timestamped notes with localized date and time", () => {
    const formatted = formatPatchNoteDate(
      { timestamp: "2026-08-05T16:16:58-06:00" },
      "en-US",
    );
    expect(formatted).toContain("2026");
    expect(formatted).toMatch(/AM|PM/);
  });
});
