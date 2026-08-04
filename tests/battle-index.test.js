"use strict";

// Regression test for the battle enemy-index mismatch: a troop whose enemy list
// contains a stale/deleted enemy id BEFORE a valid one used to bake each
// enemy's `.i` from its index in the unfiltered troop array, while the sprite
// array (`sprs`) was built from the filtered list — so every later
// `sprs[en.i]` lookup on the shifted enemy indexed past the end and crashed
// the battle. The fix assigns `.i` from the FILTERED array, the same source
// `sprs` is built from. This test evaluates the actual enemy-list construction
// statement extracted from the battle scene (src/engine/scenes/battle.ts
// since Phase 1 Stage B — the statement is verbatim JS, with Battle.run
// capturing `const proj = ctx.proj` above it) and pins the invariant
// enemies[k].i === k regardless of stale ids in the troop.

const assert = require("node:assert/strict");
const fs = require("node:fs");

const engineSource = fs.readFileSync("src/engine/scenes/battle.ts", "utf8");

// Extract the `const enemies = troop.enemies ... ;` statement from Battle.run.
const startMarker = "const enemies = troop.enemies";
const endMarker = "const sideView";
const start = engineSource.indexOf(startMarker);
assert.notEqual(start, -1, "enemy-list construction exists in the battle scene");
const end = engineSource.indexOf(endMarker, start);
assert.notEqual(end, -1, "end marker after enemy-list construction exists");
const snippet = engineSource.slice(start, end).trim();

// Run the shipped statement against a project where the troop references a
// deleted enemy id (999) before two valid ones and another stale one after.
function buildEnemies(troopEnemies, projEnemies) {
  const RA = { byId: (list, id) => list.find((e) => e.id === id) || null };
  return Function("troop", "proj", "RA", snippet + "\nreturn enemies;")(
    { enemies: troopEnemies },
    { enemies: projEnemies },
    RA,
  );
}

const projEnemies = [
  { id: 5, name: "Slime", stats: { mhp: 20 } },
  { id: 7, name: "Bat", stats: { mhp: 12 } },
];

// 1. Stale id first: the valid enemies still get contiguous filtered indices.
{
  const enemies = buildEnemies([999, 5, 998, 7], projEnemies);
  assert.equal(enemies.length, 2, "stale ids are filtered out");
  assert.equal(enemies[0].d.id, 5, "first surviving enemy is the Slime");
  assert.equal(enemies[1].d.id, 7, "second surviving enemy is the Bat");
  // The invariant the battle relies on: `sprs` is built by mapping over this
  // filtered array, so en.i MUST be each enemy's position in it.
  enemies.forEach((en, k) => {
    assert.equal(en.i, k, "enemies[" + k + "].i indexes the filtered array");
  });
  // hp/alive seeding still intact.
  assert.equal(enemies[0].hp, 20, "hp seeded from stats.mhp");
  assert.equal(enemies[1].hp, 12, "hp seeded from stats.mhp");
  assert.equal(enemies[0].alive, true, "starts alive");
}

// 2. No stale ids: indices are unchanged from before the fix.
{
  const enemies = buildEnemies([5, 7], projEnemies);
  assert.deepEqual(enemies.map((e) => e.i), [0, 1], "clean troop keeps 0..n-1");
}

// 3. All ids stale: battle gets an empty enemy list, not a crash.
{
  const enemies = buildEnemies([998, 999], projEnemies);
  assert.deepEqual(enemies, [], "all-stale troop yields an empty list");
}

console.log("Battle enemy-index tests passed.");
