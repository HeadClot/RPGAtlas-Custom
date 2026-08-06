/* RPGAtlas — scripts/package-game-exe.mjs
   Phase 7 Stage E: build a PROPER NATIVE desktop executable for one game — an
   Electrobun webview app with the game embedded, no browser and no extraction
   step (the in-editor "Windows EXE" launcher remains the no-toolchain path).

   Usage:
     node scripts/package-game-exe.mjs <project.json> [--out <file.exe>] [--skip-frontend-build]

   <project.json> should be a project SAVED/EXPORTED AS A FILE from the
   editor — file saves embed the library assets the game uses
   (proj.assets.external), so the exe is complete. References to shipped
   img/ assets are embedded from disk here; anything unresolvable warns.

   Pipeline (reuses the exact pieces the in-editor export uses — the shared
   build manifest and the shared HTML template — so nothing can drift):
     1. vite build (unless --skip-frontend-build)  → dist/player-bundle.js
     2. assembleStandaloneHtml(...)                → the single-file game
     3. stage build/electrobun-game/frontend/index.html
     4. electrobun build                            → native exe, copied out

   Requires Bun and the Electrobun native build toolchain. GPL-3.0-or-later. */

import { execSync } from "node:child_process";
import {
  copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { STANDALONE_EXPORT_FILES, PLAYER_BUNDLE_FILE } from "../js/build-manifest.mjs";
import { assembleStandaloneHtml, safeFileName } from "../js/standalone-template.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const run = (cmd) => execSync(cmd, { cwd: root, stdio: "inherit" });

// ---- args ----
const args = process.argv.slice(2);
const projectPath = args.find((a) => !a.startsWith("--"));
const outFlag = args.includes("--out") ? args[args.indexOf("--out") + 1] : null;
const skipBuild = args.includes("--skip-frontend-build");
if (!projectPath) {
  console.error("Usage: node scripts/package-game-exe.mjs <project.json> [--out <file.exe>] [--skip-frontend-build]");
  process.exit(1);
}

// ---- load project ----
const project = JSON.parse(readFileSync(resolve(projectPath), "utf8"));
if (!project || !project.meta || project.meta.engine !== "rpgatlas") {
  console.error("[package-game] not an RPGAtlas project file: " + projectPath);
  process.exit(1);
}
const title = project.system.title || "RPGAtlas Game";
const baseName = safeFileName(title, "RPGAtlas_Game");
const slug = baseName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "game";

// ---- 1. frontend build (the player bundle ships from dist) ----
const bundlePath = join(root, "dist", PLAYER_BUNDLE_FILE);
if (!skipBuild || !existsSync(bundlePath)) {
  console.log("[package-game] vite build (player bundle)");
  run("bun run build");
}

// ---- 2. assemble the game html ----
const MIME = {
  png: "image/png", webp: "image/webp", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
  ogg: "audio/ogg", mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4",
};
function fileDataUrl(path) {
  const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  return "data:" + (MIME[ext] || "application/octet-stream") + ";base64," +
    readFileSync(path).toString("base64");
}

// Used assets: embedded ones ride along; other asset: references resolve
// against the shipped img/ folders on disk.
const usedAssets = [];
const embedded = new Map();
for (const item of (project.assets && project.assets.external) || []) {
  embedded.set("asset:" + item.type + "/" + item.name, true);
  usedAssets.push(item);
}
if (project.assets && project.assets.external) delete project.assets.external; // avoid double payload
const referenced = new Set(JSON.stringify(project).match(/asset:[a-z]+\/[a-z0-9._-]+/g) || []);
for (const key of referenced) {
  if (embedded.has(key)) continue;
  const [, type, name] = key.match(/^asset:([a-z]+)\/(.+)$/);
  const dir = join(root, "img", type);
  const hit = existsSync(dir) &&
    readdirSync(dir).find((f) => f.replace(/\.[^.]+$/, "") === name);
  if (hit) {
    usedAssets.push({ type, name, src: fileDataUrl(join(dir, hit)) });
  } else {
    console.warn("[package-game] WARNING: " + key + " is referenced but not embedded and not in img/" + type +
      " — the game will fall back like a missing asset. Re-export the project from the editor to embed it.");
  }
}

const files = STANDALONE_EXPORT_FILES.map((rel) =>
  rel === PLAYER_BUNDLE_FILE
    ? readFileSync(bundlePath, "utf8")
    : readFileSync(join(root, rel), "utf8"),
);
const iconSet = fileDataUrl(join(root, "img", "system", "icon_set.png"));
const game = assembleStandaloneHtml(project, files, usedAssets, iconSet);
console.log("[package-game] game html assembled (" + (game.html.length / 1024).toFixed(0) + " KB)");

// ---- 3. stage dist as the Electrobun frontend -----------------------------
const stageDir = join(root, "build", "electrobun-game", "frontend");
mkdirSync(stageDir, { recursive: true });
writeFileSync(join(stageDir, "index.html"), game.html);

const width = Math.max(384, Math.floor(Number(project.system.screenWidth) || 816));
const height = Math.max(288, Math.floor(Number(project.system.screenHeight) || 624));
// ---- 4. native build ----
console.log("[package-game] electrobun build");
process.env.RPGATLAS_FRONTEND_STAGE = stageDir;
process.env.RPGATLAS_APP_NAME = baseName;
process.env.RPGATLAS_APP_IDENTIFIER = "com.rpgatlas.game." + slug.replace(/-/g, "");
run("bunx electrobun build --env=stable");

// The stable Windows build emits a self-contained Setup.exe next to its archive.
// Prefer that launcher over the embedded Bun/runtime helper executables.
const releaseDir = join(root, "build", "electrobun");
const exeName = process.platform === "win32" ? ".exe" : "";
function findExecutables(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return findExecutables(path);
    if (!entry.isFile()) return [];
    if (exeName ? !entry.name.endsWith(exeName) : entry.name.includes(".")) return [];
    return [{ path, t: statSync(path).mtimeMs }];
  });
}
const candidates = findExecutables(releaseDir).sort((a, b) => {
  const setupBias = (candidate) => candidate.path.toLowerCase().endsWith("-setup.exe") ? 1 : 0;
  return setupBias(b) - setupBias(a) || b.t - a.t;
});
if (!candidates.length) {
  console.error("[package-game] no stable build output found in " + releaseDir);
  process.exit(1);
}
const out = outFlag ? resolve(outFlag) : join(root, baseName + exeName);
copyFileSync(candidates[0].path, out);
console.log("[package-game] wrote " + out + "  (window " + width + "x" + height + ", '" + title + "')");
