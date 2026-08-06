"use strict";

// Compatibility checks for the opt-in project contract. These stay in the
// classic data harness so legacy JSON and current stamped JSON are both covered.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const context = vm.createContext({ console, Assets: { T: {} } });
vm.runInContext(fs.readFileSync("js/plugins.js", "utf8"), context, { filename: "js/plugins.js" });
vm.runInContext(fs.readFileSync("js/data.js", "utf8"), context, { filename: "js/data.js" });
const evaluate = (source) => vm.runInContext(source, context);

const fresh = evaluate("DataDefaults.newProject()");
assert.equal(fresh.system.gameMode, "rpg");
assert.deepEqual(JSON.parse(JSON.stringify(fresh.system.platformer)), JSON.parse(JSON.stringify(evaluate("RA.defaultPlatformer()"))));
assert.deepEqual(JSON.parse(JSON.stringify(fresh.system.input.keyboard.jump)), ["Space"]);
assert.deepEqual(JSON.parse(JSON.stringify(fresh.system.input.gamepad.jump)), ["face_south"]);

const legacy = evaluate(`RA.migrateProject({
  meta: { engine: "rpgatlas", formatVersion: 4 },
  system: {},
  maps: [{ id: 1, width: 4, height: 3, layers: {} }]
})`);
assert.equal(legacy.system.gameMode, "rpg");
assert.equal(legacy.maps[0].platformerCollision.length, 12);

const malformed = evaluate(`RA.migrateProject({
  meta: { engine: "rpgatlas", formatVersion: RA.FORMAT_VERSION },
  system: { gameMode: "platformer", platformer: { gravity: -99, coyoteFrames: 999 } },
  maps: []
})`);
assert.equal(malformed.system.gameMode, "platformer");
assert.equal(malformed.system.platformer.gravity, 0.1);
assert.equal(malformed.system.platformer.coyoteFrames, 30);

console.log("Platformer mode compatibility tests passed.");
