/* RPGAtlas — Electrobun native path guard.
   Port of the native project-path contract. Keep this module free of window
   APIs so it can be unit-tested and reused by every Bun-side filesystem command. */

import { existsSync, realpathSync, statSync } from "node:fs";
import { dirname, extname, isAbsolute, join, relative, sep } from "node:path";

export type ProjectErrorCode =
  | "FOLDER_EXISTS"
  | "NO_PERMISSION"
  | "DISK_FULL"
  | "MISSING"
  | "NOT_A_PROJECT"
  | "UNSAFE_PATH"
  | "SECOND_INSTANCE"
  | "IO";

export class ProjectError extends Error {
  readonly code: ProjectErrorCode;
  readonly detail?: string;

  constructor(code: ProjectErrorCode, detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = "ProjectError";
    this.code = code;
    this.detail = detail;
  }

  toJSON(): { code: ProjectErrorCode; detail?: string } {
    return this.detail ? { code: this.code, detail: this.detail } : { code: this.code };
  }
}

function isDiskFull(error: NodeJS.ErrnoException): boolean {
  return error.code === "ENOSPC" || error.code === "ERR_FS_FILE_TOO_LARGE" ||
    error.errno === -112 || error.errno === 112 || error.errno === 39;
}

export function mapFsError(error: unknown): ProjectError {
  const e = error as NodeJS.ErrnoException;
  const code: ProjectErrorCode = e?.code === "EEXIST" ? "FOLDER_EXISTS"
    : e?.code === "EACCES" || e?.code === "EPERM" ? "NO_PERMISSION"
      : e?.code === "ENOENT" ? "MISSING"
        : isDiskFull(e) ? "DISK_FULL" : "IO";
  return new ProjectError(code, e?.message || String(error));
}

function reservedDevice(name: string): boolean {
  const stem = name.split(".", 1)[0].toUpperCase();
  return ["CON", "PRN", "AUX", "NUL"].includes(stem) ||
    ((stem.startsWith("COM") || stem.startsWith("LPT")) && /^[1-9]$/.test(stem.slice(3)));
}

export function validateComponent(name: string): void {
  if (!name || name === "." || name === "..") throw new ProjectError("UNSAFE_PATH", "empty or dot segment");
  if (/[\\/:\0]/.test(name) || [...name].some((c) => c.charCodeAt(0) < 32)) {
    throw new ProjectError("UNSAFE_PATH", "separator, colon, NUL, or control character in name");
  }
  if (isAbsolute(name) || name.endsWith(".") || name.endsWith(" ") || reservedDevice(name)) {
    throw new ProjectError("UNSAFE_PATH", "illegal path component");
  }
}

export function canonicalRoot(path: string): string {
  try {
    const resolved = realpathSync.native(path);
    if (!statSync(resolved).isDirectory()) throw new ProjectError("MISSING");
    return resolved;
  } catch (error) {
    if (error instanceof ProjectError) throw error;
    throw mapFsError(error);
  }
}

function deepestExistingAncestor(path: string): string {
  let current = path;
  while (!existsSync(current)) {
    const parent = dirname(current);
    if (parent === current) return current;
    current = parent;
  }
  return current;
}

export function containedJoin(root: string, ...segments: string[]): string {
  for (const segment of segments) validateComponent(segment);
  const target = join(root, ...segments);
  try {
    const ancestor = realpathSync.native(deepestExistingAncestor(target));
    const rel = relative(root, ancestor);
    if (rel === "" || (!rel.startsWith(".." + sep) && rel !== ".." && !isAbsolute(rel))) return target;
  } catch (error) {
    throw mapFsError(error);
  }
  throw new ProjectError("UNSAFE_PATH", "resolved path escaped the project root");
}

export function relativeSegments(value: string): string[] {
  const segments = value.split(/[\\/]+/).filter(Boolean);
  if (!segments.length) throw new ProjectError("UNSAFE_PATH", "empty relative path");
  return segments;
}

export function relativePath(root: string, value: string): string {
  return containedJoin(root, ...relativeSegments(value));
}

export function resolveProjectTarget(target: string): string {
  return extname(target).toLowerCase() === ".rpgatlas"
    ? canonicalRoot(dirname(target))
    : canonicalRoot(target);
}
