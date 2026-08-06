/* RPGAtlas — scripts/package-exe.mjs
   Builds the Electrobun desktop executable and drops it at the project root.
   GPL-3.0-or-later. */

import { execSync } from "node:child_process";
import { copyFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const win = process.platform === "win32";
const outName = win ? "RPGAtlas-Desktop.exe" : "RPGAtlas-Desktop";
const run = (cmd) => execSync(cmd, { cwd: root, stdio: "inherit" });

console.log("[package-exe] building + staging frontend via stage-frontend.mjs");
run("node scripts/stage-frontend.mjs");
console.log("[package-exe] building Electrobun application");
run("bunx electrobun build --env=stable");

function findNewestExecutable(dir) {
  if (!existsSync(dir)) return null;
  const candidates = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = findNewestExecutable(path);
      if (nested) candidates.push(nested);
    } else if (win ? entry.name.toLowerCase().endsWith(".exe") : !entry.name.includes(".")) {
      candidates.push({ path, mtime: statSync(path).mtimeMs });
    }
  }
  candidates.sort((a, b) => {
    const setupBias = (candidate) => candidate.path.toLowerCase().endsWith("-setup.exe") ? 1 : 0;
    return setupBias(b) - setupBias(a) || b.mtime - a.mtime;
  });
  return candidates[0] || null;
}

const source = findNewestExecutable(join(root, "build", "electrobun"));
if (!source) {
  console.error("[package-exe] build output not found under build/electrobun");
  process.exit(1);
}
const destination = join(root, outName);
copyFileSync(source.path, destination);
console.log("[package-exe] wrote " + destination);
