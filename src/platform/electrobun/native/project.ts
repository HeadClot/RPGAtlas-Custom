/* RPGAtlas — Electrobun native project-folder service. */

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { canonicalRoot, containedJoin, mapFsError, ProjectError, resolveProjectTarget, validateComponent } from "./path-guard";

export const PROJECT_FILE = "game.rpgatlas";
export const ASSETS_DIR = "assets";
export const ASSETS_README_NAME = "READ ME — how to add assets.txt";
const ASSET_SUBDIRS = ["characters", "facesets", "enemies", "tilesets", "audio"] as const;
const ASSETS_README = `RPGAtlas — your game's pictures and sounds\r\n==========================================\r\n\r\nThis folder holds your game's art and audio. Drop your own files into the\r\nmatching folder below, then switch back to the editor (or click "Scan" in the\r\nAsset Browser) and RPGAtlas will find them.\r\n\r\nYour files STAY right here where you put them. RPGAtlas never moves, renames,\r\nor deletes them. This whole folder IS your game, so you can copy it, back it up,\r\nor zip it up to share — and everything comes along.\r\n\r\n  characters\\  Walking sprites (PNG). A standard sheet is 3 columns x 4 rows.\r\n  facesets\\    Message-box face pictures (PNG).\r\n  enemies\\     Battler / enemy pictures (PNG).\r\n  tilesets\\    Map tiles (PNG). Big sheets open the tile slicer so you can cut\r\n               them into 48px tiles.\r\n  audio\\       Music & sound effects (OGG, MP3, WAV, M4A, FLAC).\r\n\r\nTip: adding the same file twice is harmless — RPGAtlas notices it is already\r\nhere and skips it.\r\n`;
const GITIGNORE_BODY = "# RPGAtlas engine-managed, regenerable data\r\n.atlas/cache/\r\n.atlas/backup/\r\n";

export interface ProjectBundle { root: string; name: string; document: string; }
export interface Recent { name: string; path: string; lastOpened: number; }

export function atomicWrite(path: string, contents: string | Uint8Array): void {
  try {
    const tmp = `${path}.tmp`;
    writeFileSync(tmp, contents);
    renameSync(tmp, path);
  } catch (error) { throw mapFsError(error); }
}

function scaffold(root: string, document: string): ProjectBundle {
  try {
    for (const type of ASSET_SUBDIRS) mkdirSync(containedJoin(root, ASSETS_DIR, type), { recursive: true });
    const readme = containedJoin(root, ASSETS_DIR, ASSETS_README_NAME);
    writeFileSync(readme, ASSETS_README);
    mkdirSync(containedJoin(root, ".atlas", "cache"), { recursive: true });
    mkdirSync(containedJoin(root, ".atlas", "backup"), { recursive: true });
    atomicWrite(containedJoin(root, ".atlas", "library.json"), "[]");
    writeFileSync(containedJoin(root, ".gitignore"), GITIGNORE_BODY);
    atomicWrite(containedJoin(root, PROJECT_FILE), document);
    return { root, name: basename(root), document };
  } catch (error) { throw error instanceof ProjectError ? error : mapFsError(error); }
}

export function projectCreate(parentDir: string, name: string, document: string): ProjectBundle {
  const parent = canonicalRoot(parentDir);
  validateComponent(name);
  const root = join(parent, name);
  if (existsSync(root)) throw new ProjectError("FOLDER_EXISTS");
  try {
    mkdirSync(root);
    return scaffold(canonicalRoot(root), document);
  } catch (error) {
    try { rmSync(root, { recursive: true, force: true }); } catch { /* best effort rollback */ }
    throw error instanceof ProjectError ? error : mapFsError(error);
  }
}

export function projectOpen(target: string): ProjectBundle {
  const root = resolveProjectTarget(target);
  const documentPath = containedJoin(root, PROJECT_FILE);
  if (!existsSync(documentPath)) throw new ProjectError("NOT_A_PROJECT");
  try { return { root, name: basename(root), document: readFileSync(documentPath, "utf8") }; }
  catch (error) { throw mapFsError(error); }
}

function pruneBackups(dir: string): void {
  try {
    const backups = readdirSync(dir).map((name) => {
      const path = join(dir, name);
      return { path, mtime: statSync(path).mtimeMs };
    }).filter(({ path }) => path.endsWith(".rpgatlas.backup"))
      .sort((a, b) => b.mtime - a.mtime);
    for (const entry of backups.slice(5)) rmSync(entry.path, { force: true });
  } catch { /* backups are best effort */ }
}

function rollBackup(root: string): void {
  const backupDir = containedJoin(root, ".atlas", "backup");
  mkdirSync(backupDir, { recursive: true });
  const path = containedJoin(root, PROJECT_FILE);
  const destination = containedJoin(root, ".atlas", "backup", `game-${Date.now()}.rpgatlas.backup`);
  copyFileSync(path, destination);
  pruneBackups(backupDir);
}

export function projectSave(root: string, document: string): void {
  const canonical = canonicalRoot(root);
  const documentPath = containedJoin(canonical, PROJECT_FILE);
  if (!existsSync(documentPath) && !existsSync(containedJoin(canonical, ".atlas"))) throw new ProjectError("NOT_A_PROJECT");
  if (existsSync(documentPath)) { try { rollBackup(canonical); } catch { /* non-blocking */ } }
  atomicWrite(documentPath, document);
}

export function readRecents(configDir: string): Recent[] {
  try {
    const parsed = JSON.parse(readFileSync(join(configDir, "projects.json"), "utf8"));
    return Array.isArray(parsed) ? parsed as Recent[] : [];
  } catch { return []; }
}

export function writeRecents(configDir: string, items: Recent[]): void {
  mkdirSync(configDir, { recursive: true });
  atomicWrite(join(configDir, "projects.json"), JSON.stringify(items));
}

export function recentsTouch(configDir: string, path: string, name: string): void {
  const items = readRecents(configDir).filter((item) => item.path !== path);
  items.unshift({ name, path, lastOpened: Date.now() });
  writeRecents(configDir, items.slice(0, 12));
}

export function recentsRemove(configDir: string, path: string): void {
  writeRecents(configDir, readRecents(configDir).filter((item) => item.path !== path));
}

export function ensureAssetsReadme(root: string): void {
  const canonical = canonicalRoot(root);
  const assets = containedJoin(canonical, ASSETS_DIR);
  mkdirSync(assets, { recursive: true });
  const readme = containedJoin(canonical, ASSETS_DIR, ASSETS_README_NAME);
  if (!existsSync(readme)) writeFileSync(readme, ASSETS_README);
}

export function assetsReadme(): string { return ASSETS_README; }
