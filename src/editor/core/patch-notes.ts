/* RPGAtlas — src/editor/core/patch-notes.ts
   Sorting and presentation helpers for the append-only patch-note feed.
   GPL-3.0-or-later. */

export interface PatchNoteLike {
  date?: string;
  timestamp?: string;
}

export function patchNoteTime(note: PatchNoteLike): number {
  if (note.timestamp) {
    const timestamp = Date.parse(note.timestamp);
    if (Number.isFinite(timestamp)) return timestamp;
  }
  if (note.date) {
    const date = Date.parse(note.date);
    if (Number.isFinite(date)) return date;
  }
  return Number.NEGATIVE_INFINITY;
}

export function sortPatchNotes<T extends PatchNoteLike>(notes: readonly T[]): T[] {
  return [...notes].sort((a, b) => patchNoteTime(b) - patchNoteTime(a));
}

export function formatPatchNoteDate(note: PatchNoteLike, locale?: string): string {
  if (note.timestamp) {
    const timestamp = Date.parse(note.timestamp);
    if (Number.isFinite(timestamp)) {
      return new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(timestamp);
    }
  }
  return note.date || "";
}
