/* RPGAtlas — src/editor/database/bulk.ts
   Pure helpers for the Database list upgrades (Phase 3 Stage E): shared-field
   discovery + bulk numeric edits over a multi-selection, and the cross-project
   entry clipboard (copy an entry in one project, paste it into another via
   localStorage). The list scaffold (shared.ts) wires these into every
   list-form Database tab; keeping the logic here (no DOM, no editor imports)
   makes it unit-testable.
   Copyright (C) 2026 RPGAtlas contributors — GPL-3.0-or-later (see LICENSE). */
/* eslint-disable @typescript-eslint/no-explicit-any */

export type BulkOp = "set" | "add" | "mul";

const isPlainObject = (v: any) =>
  v != null && typeof v === "object" && !Array.isArray(v);

/** Read a dotted path ("base.mhp") off an object; undefined if any hop misses. */
export function getPath(obj: any, path: string): any {
  let cur = obj;
  for (const seg of path.split(".")) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = cur[seg];
  }
  return cur;
}

/** Write a dotted path, creating intermediate plain objects as needed. */
export function setPath(obj: any, path: string, value: any): void {
  const segs = path.split(".");
  let cur = obj;
  for (let i = 0; i < segs.length - 1; i++) {
    const s = segs[i];
    if (!isPlainObject(cur[s])) cur[s] = {};
    cur = cur[s];
  }
  cur[segs[segs.length - 1]] = value;
}

// Numeric dotted paths on one entry: top-level numbers (minus `id`), plus one
// level into any plain-object field (base/growth/stats/params) for its numbers.
function numericPaths(entry: any): string[] {
  const out: string[] = [];
  if (!isPlainObject(entry)) return out;
  for (const [k, v] of Object.entries(entry)) {
    if (k === "id") continue;
    if (typeof v === "number") out.push(k);
    else if (isPlainObject(v)) {
      for (const [k2, v2] of Object.entries(v as any)) {
        if (typeof v2 === "number") out.push(k + "." + k2);
      }
    }
  }
  return out;
}

/** The numeric fields (dotted paths) present on EVERY selected entry — the
 *  fields a bulk edit can safely apply across the whole selection. Ordered by
 *  first appearance so the UI is stable. */
export function sharedNumericFields(entries: any[]): string[] {
  if (!entries || !entries.length) return [];
  const counts = new Map<string, number>();
  const order: string[] = [];
  for (const e of entries) {
    for (const p of numericPaths(e)) {
      if (!counts.has(p)) { counts.set(p, 0); order.push(p); }
      counts.set(p, counts.get(p)! + 1);
    }
  }
  return order.filter((p) => counts.get(p) === entries.length);
}

/** Apply a numeric op to `path` on every entry (only where the path currently
 *  holds a number). Returns the count changed. Mutates in place. */
export function applyBulk(entries: any[], path: string, op: BulkOp, value: number): number {
  let changed = 0;
  for (const e of entries || []) {
    const cur = getPath(e, path);
    if (typeof cur !== "number") continue;
    let next = cur;
    if (op === "set") next = value;
    else if (op === "add") next = cur + value;
    else if (op === "mul") next = cur * value;
    // keep integers integral, but preserve fractional growth rates as-is
    if (Number.isInteger(cur) && Number.isInteger(value)) next = Math.round(next);
    setPath(e, path, next);
    changed++;
  }
  return changed;
}

/** Deep-clone entries and assign fresh sequential ids following `existing`'s
 *  current max id (so a paste never collides). Returns the new entries; does
 *  not touch `existing`. */
export function cloneEntries(entries: any[], existing: any[]): any[] {
  let next = 1;
  for (const e of existing || []) next = Math.max(next, (Number(e.id) || 0) + 1);
  return (entries || []).map((e) => {
    const c = JSON.parse(JSON.stringify(e));
    c.id = next++;
    return c;
  });
}

// ---- cross-project clipboard (localStorage) --------------------------------
const CLIP_KEY = "rpgatlas_db_clip";

export interface DbClip { kind: string; entries: any[]; }

/** Copy entries to the cross-project clipboard, tagged by list `kind` (so a
 *  paste only lands in a compatible tab). Deep-cloned on the way in. */
export function writeDbClip(kind: string, entries: any[]): void {
  try {
    const payload: DbClip = { kind, entries: JSON.parse(JSON.stringify(entries)) };
    localStorage.setItem(CLIP_KEY, JSON.stringify(payload));
  } catch { /* quota / unavailable — clipboard is best-effort */ }
}

/** The current clipboard, or null if empty/unreadable. */
export function readDbClip(): DbClip | null {
  try {
    const raw = localStorage.getItem(CLIP_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (p && typeof p.kind === "string" && Array.isArray(p.entries)) return p;
  } catch { /* ignore */ }
  return null;
}
