/* Build the standalone Practice Clearing playable project.
   Usage: node scripts/build-practice-clearing-demo.mjs
   The source fixture remains under tests/fixtures so automated coverage and the
   manually hosted demo always use the same authored combat slice. */
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const source = join(root, "tests", "fixtures", "practice-clearing-project.json");
const output = join(root, "Practice_Clearing.json");
mkdirSync(dirname(output), { recursive: true });
copyFileSync(source, output);
console.log(`[practice-clearing] wrote ${output}`);
console.log(`[practice-clearing] host with: node server/dist/beacon.mjs --project Practice_Clearing.json`);
