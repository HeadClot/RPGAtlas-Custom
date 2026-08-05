/* RPGAtlas — tests-e2e/fixtures/perf.mjs
   Shared helpers for the performance budget specs (renderer-perf, load-perf,
   adv-perf). Single-sourced so the measurement logic and the deterministic
   RNG cannot drift between the specs whose numbers get compared against each
   other. GPL-3.0-or-later. */

/** Deterministic LCG — identical fixture content every run (same recipe as
 *  scripts/build-atlas-quest-hd.mjs, which must stay byte-reproducible). */
export function makeRand(seed) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

/** Average ms/frame over `frames` rAF ticks after `warmup` ticks, measured
 *  in-page. rAF cadence means a scene holding 60 fps reports ~16.7 ms. */
export function measureFrames(page, { warmup, frames }) {
  return page.evaluate(
    ({ warmup, frames }) =>
      new Promise((resolve) => {
        let n = 0;
        let start = 0;
        function tick(now) {
          n++;
          if (n === warmup) start = now;
          if (n === warmup + frames) {
            resolve((now - start) / frames);
            return;
          }
          requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      }),
    { warmup, frames },
  );
}

/** Collect cadence statistics for a frame window. This is intentionally based
 * on rAF timestamps rather than wall-clock sleeps so the result stays stable
 * under Playwright's virtualized browser scheduling. */
export function measureFrameStats(page, { warmup, frames }) {
  return page.evaluate(
    ({ warmup, frames }) =>
      new Promise((resolve) => {
        const samples = [];
        let n = 0;
        let previous = 0;
        function tick(now) {
          if (previous && n >= warmup) samples.push(now - previous);
          previous = now;
          n++;
          if (n >= warmup + frames) {
            const sorted = samples.slice().sort((a, b) => a - b);
            resolve({
              avgMs: samples.reduce((sum, value) => sum + value, 0) / samples.length,
              minMs: sorted[0] || 0,
              maxMs: sorted[sorted.length - 1] || 0,
              p95Ms: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] || 0,
            });
            return;
          }
          requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      }),
    { warmup, frames },
  );
}

/** Measure a Playwright action sequence from the same test process. Useful for
 * editor tools whose cost is DOM/Canvas work rather than a game rAF loop. */
export async function measureAction(action) {
  const start = performance.now();
  await action();
  return performance.now() - start;
}
