/* RPGAtlas — src/editor/fuzzy.ts
   Pure fuzzy scorer for the command palette (Phase 3 Stage A).

   Scoring model, highest first: exact substring match (at a word start =
   better, earlier = better) beats a word-start subsequence (initials), which
   beats a scattered subsequence. Case-insensitive. Returns null when the
   query is not a subsequence of the text at all. No imports, no DOM —
   unit-tested in tests-unit/editor-fuzzy.test.ts.
   Copyright (C) 2026 RPGAtlas contributors — GPL-3.0-or-later (see LICENSE). */

function isWordStart(text: string, i: number) {
  if (i === 0) return true;
  const prev = text[i - 1];
  return prev === " " || prev === "-" || prev === "_" || prev === "/" || prev === "(" || prev === "▸";
}

// One left-to-right subsequence walk. With preferWordStart, each query char
// first looks for a word-start occurrence ahead (so initials line up), then
// falls back to the nearest plain occurrence. Greedy word-start jumps can
// consume text a later char needs, so callers ALSO run the plain walk and
// keep the better result — plain-greedy-leftmost finds any subsequence that
// exists. Spaces in the query only separate hints and are skipped.
function walk(q: string, t: string, preferWordStart: boolean): { gaps: number; ws: number } | null {
  let pos = 0, gaps = 0, ws = 0;
  for (const ch of q) {
    if (ch === " ") continue;
    let at = -1;
    if (preferWordStart) {
      for (let i = pos; i < t.length; i++) {
        if (t[i] === ch && isWordStart(t, i)) { at = i; break; }
      }
    }
    if (at < 0) at = t.indexOf(ch, pos);
    if (at < 0) return null;
    if (isWordStart(t, at)) ws++;
    gaps += at - pos;
    pos = at + 1;
  }
  return { gaps, ws };
}

/** Score `query` against `text`; higher is better; null = no match. */
export function fuzzyScore(query: string, text: string): number | null {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (!q.trim()) return 0;

  // Tier 1: contiguous substring — 1000 base, word-start and earliness bonuses.
  const sub = t.indexOf(q);
  if (sub >= 0) {
    return 1000 + (isWordStart(t, sub) ? 200 : 0) - Math.min(sub, 100);
  }

  // Tier 2/3: best of the word-start-first and plain subsequence walks.
  const a = walk(q, t, true);
  const b = walk(q, t, false);
  let best: number | null = null;
  for (const r of [a, b]) {
    if (!r) continue;
    const s = 100 + r.ws * 50 - Math.min(r.gaps, 300);
    if (best === null || s > best) best = s;
  }
  return best;
}
