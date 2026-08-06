/* RPGAtlas — Electrobun per-project asset filesystem service. */

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync, rmSync } from "node:fs";
import { basename, extname, join, parse } from "node:path";
import { atomicWrite, ASSETS_DIR, ASSETS_README_NAME, ensureAssetsReadme } from "./project";
import { canonicalRoot, containedJoin, mapFsError, ProjectError, relativePath } from "./path-guard";

const TYPES = ["characters", "facesets", "enemies", "tilesets", "audio"] as const;
const IMAGE_EXTS = new Set(["png", "webp", "jpg", "jpeg"]);
const AUDIO_EXTS = new Set(["ogg", "mp3", "wav", "m4a", "flac"]);
const MIME: Record<string, string> = {
  png: "image/png", webp: "image/webp", jpg: "image/jpeg", jpeg: "image/jpeg",
  ogg: "audio/ogg", mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4", flac: "audio/flac",
};

export interface AssetBlob { data: string; mime?: string; }
export interface ScannedFile { type: string; relPath: string; size: number; mtimeMs: number; }
export interface ImportFile { type: string; name: string; mime: string; data: string; }

const decode = (value: string): Buffer => {
  try { return Buffer.from(value, "base64"); } catch (error) { throw new ProjectError("IO", String(error)); }
};
const encode = (value: Uint8Array): string => Buffer.from(value).toString("base64");

export function safeHash(hash: string): string {
  if (!hash || !/^[0-9a-f]+$/i.test(hash)) throw new ProjectError("UNSAFE_PATH", "invalid blob hash");
  return hash.toLowerCase();
}

export function assetIndexRead(root: string): string {
  const path = containedJoin(canonicalRoot(root), ".atlas", "library.json");
  try { return readFileSync(path, "utf8"); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "[]";
    throw mapFsError(error);
  }
}

export function assetIndexWrite(root: string, json: string): void {
  const canonical = canonicalRoot(root);
  mkdirSync(containedJoin(canonical, ".atlas"), { recursive: true });
  atomicWrite(containedJoin(canonical, ".atlas", "library.json"), json);
}

export function assetRead(root: string, relPathValue: string | null, hash: string | null): AssetBlob | null {
  const canonical = canonicalRoot(root);
  let path: string;
  let mime: string | undefined;
  if (relPathValue) {
    path = relativePath(canonical, relPathValue);
    mime = MIME[extname(path).slice(1).toLowerCase()];
  } else if (hash) {
    path = containedJoin(canonical, ".atlas", "cache", safeHash(hash));
  } else throw new ProjectError("IO", "no relPath or hash");
  try { return { data: encode(readFileSync(path)), ...(mime ? { mime } : {}) }; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw mapFsError(error); }
}

function freePath(dir: string, fileName: string): string {
  const original = join(dir, fileName);
  if (!existsSync(original)) return original;
  const parsed = parse(fileName);
  for (let i = 2; i < 1_000_000; i++) {
    const candidate = join(dir, `${parsed.name}-${i}${parsed.ext}`);
    if (!existsSync(candidate)) return candidate;
  }
  return original;
}

export function assetWriteInPlace(root: string, type: string, fileName: string, dataBase64: string): string {
  if (!TYPES.includes(type as typeof TYPES[number])) throw new ProjectError("UNSAFE_PATH", "unknown asset type");
  const canonical = canonicalRoot(root);
  const dir = containedJoin(canonical, ASSETS_DIR, type);
  containedJoin(canonical, ASSETS_DIR, type, fileName);
  mkdirSync(dir, { recursive: true });
  const selected = freePath(dir, fileName);
  const leaf = basename(selected);
  writeFileSync(containedJoin(canonical, ASSETS_DIR, type, leaf), decode(dataBase64));
  return `${ASSETS_DIR}/${type}/${leaf}`;
}

export function assetWriteCache(root: string, hash: string, dataBase64: string): void {
  const canonical = canonicalRoot(root);
  const cache = containedJoin(canonical, ".atlas", "cache");
  mkdirSync(cache, { recursive: true });
  writeFileSync(containedJoin(canonical, ".atlas", "cache", safeHash(hash)), decode(dataBase64));
}

export function assetDeleteCache(root: string, hash: string): void {
  rmSync(containedJoin(canonicalRoot(root), ".atlas", "cache", safeHash(hash)), { force: true });
}

export function assetsScan(root: string): ScannedFile[] {
  const canonical = canonicalRoot(root);
  const out: ScannedFile[] = [];
  for (const type of TYPES) {
    const dir = containedJoin(canonical, ASSETS_DIR, type);
    if (!existsSync(dir)) continue;
    const allowed = type === "audio" ? AUDIO_EXTS : IMAGE_EXTS;
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (!statSync(path).isFile()) continue;
      const ext = extname(name).slice(1).toLowerCase();
      if (!allowed.has(ext) || name === ASSETS_README_NAME) continue;
      const meta = statSync(path);
      out.push({ type, relPath: `${ASSETS_DIR}/${type}/${name}`, size: meta.size, mtimeMs: meta.mtimeMs });
    }
  }
  return out;
}

export function ensureReadme(root: string): void { ensureAssetsReadme(root); }
