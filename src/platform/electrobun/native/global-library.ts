/* RPGAtlas — Electrobun legacy app-data asset library and import inbox. */

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, extname, join, parse } from "node:path";
import { atomicWrite } from "./project";

const TYPES = ["characters", "facesets", "enemies", "tilesets", "audio"] as const;
const IMAGE_EXTS = new Set(["png", "webp", "jpg", "jpeg"]);
const AUDIO_EXTS = new Set(["ogg", "mp3", "wav", "m4a", "flac"]);
const MIME: Record<string, string> = {
  png: "image/png", webp: "image/webp", jpg: "image/jpeg", jpeg: "image/jpeg",
  ogg: "audio/ogg", mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4", flac: "audio/flac",
};
const README = `RPGAtlas — how to add your own pictures and sounds\r\n==================================================\r\n\r\nCopy (or drag) your files into the matching folder below. The editor picks\r\nthem up automatically when you open the Asset Browser, or when you click\r\n"Scan for New Files" there. Once imported, each file is moved into the\r\n"Imported" folder so this inbox stays tidy — nothing is deleted.\r\n`;
type LibraryMeta = { key?: string; hash?: string; mime?: string; [key: string]: unknown };

function libraryDir(userData: string): string { return join(userData, "library"); }
function readIndex(userData: string): LibraryMeta[] {
  try {
    const parsed = JSON.parse(readFileSync(join(libraryDir(userData), "index.json"), "utf8"));
    return Array.isArray(parsed) ? parsed as LibraryMeta[] : [];
  } catch { return []; }
}
function writeIndex(userData: string, items: LibraryMeta[]): void {
  const dir = libraryDir(userData);
  mkdirSync(dir, { recursive: true });
  atomicWrite(join(dir, "index.json"), JSON.stringify(items));
}
function hashName(hash: string): string {
  if (!hash || !/^[0-9a-f]+$/i.test(hash)) throw new Error("invalid blob hash");
  return hash.toLowerCase();
}

export interface LibraryBlob { data: string; mime?: string; }
export interface ImportFile { type: string; name: string; mime: string; data: string; }

export function libraryList(userData: string): string { return JSON.stringify(readIndex(userData)); }

export function libraryRead(userData: string, key: string): LibraryBlob | null {
  const meta = readIndex(userData).find((item) => item && item.key === key);
  if (!meta?.hash) return null;
  const path = join(libraryDir(userData), "blobs", hashName(meta.hash));
  if (!existsSync(path)) return null;
  return { data: readFileSync(path).toString("base64"), ...(meta.mime ? { mime: meta.mime } : {}) };
}

export function libraryWrite(userData: string, metaJson: string, dataBase64: string): void {
  const meta = JSON.parse(metaJson) as LibraryMeta;
  if (!meta.key || !meta.hash) throw new Error("asset metadata has no key or hash");
  const blobs = join(libraryDir(userData), "blobs");
  mkdirSync(blobs, { recursive: true });
  writeFileSync(join(blobs, hashName(meta.hash)), Buffer.from(dataBase64, "base64"));
  const items = readIndex(userData).filter((item) => item?.key !== meta.key);
  items.push(meta);
  writeIndex(userData, items);
}

export function libraryDelete(userData: string, key: string): void {
  const items = readIndex(userData);
  const removed = items.find((item) => item?.key === key);
  const kept = items.filter((item) => item?.key !== key);
  writeIndex(userData, kept);
  if (removed?.hash && !kept.some((item) => item?.hash === removed.hash)) {
    try { rmSync(join(libraryDir(userData), "blobs", hashName(removed.hash)), { force: true }); } catch { /* best effort */ }
  }
}

export function librarySetMeta(userData: string, metaJson: string): void {
  const meta = JSON.parse(metaJson) as LibraryMeta;
  if (!meta.key) throw new Error("asset metadata has no key");
  const items = readIndex(userData).filter((item) => item?.key !== meta.key);
  items.push(meta);
  writeIndex(userData, items);
}

function freePath(dir: string, name: string): string {
  const original = join(dir, name);
  if (!existsSync(original)) return original;
  const parsed = parse(name);
  for (let i = 2; i < 1_000_000; i++) {
    const candidate = join(dir, `${parsed.name}-${i}${parsed.ext}`);
    if (!existsSync(candidate)) return candidate;
  }
  return original;
}

export function importDir(userData: string): string {
  const root = join(libraryDir(userData), "import");
  for (const type of TYPES) mkdirSync(join(root, type), { recursive: true });
  const readme = join(root, "READ ME — how to add assets.txt");
  if (!existsSync(readme)) writeFileSync(readme, README);
  return root;
}

export function scanImport(userData: string): ImportFile[] {
  const root = importDir(userData);
  const archive = join(root, "Imported");
  mkdirSync(archive, { recursive: true });
  const result: ImportFile[] = [];
  for (const type of TYPES) {
    const allowed = type === "audio" ? AUDIO_EXTS : IMAGE_EXTS;
    for (const name of readdirSync(join(root, type))) {
      const path = join(root, type, name);
      if (!statSync(path).isFile()) continue;
      const ext = extname(name).slice(1).toLowerCase();
      const mime = MIME[ext];
      if (!allowed.has(ext) || !mime) continue;
      const bytes = readFileSync(path);
      const destination = freePath(archive, basename(name));
      try { renameSync(path, destination); }
      catch { try { writeFileSync(destination, bytes); rmSync(path, { force: true }); } catch { /* rescan later */ } }
      result.push({ type, name, mime, data: bytes.toString("base64") });
    }
  }
  return result;
}
