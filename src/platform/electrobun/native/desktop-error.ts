import type { ProjectErrorCode } from "./path-guard";

export function serializeDesktopError(error: unknown): { code: ProjectErrorCode | "IO"; detail?: string } {
  const e = error as { code?: ProjectErrorCode; detail?: string; message?: string };
  if (e && typeof e.code === "string") return { code: e.code, ...(e.detail ? { detail: e.detail } : {}) };
  return { code: "IO", ...(e?.message ? { detail: e.message } : { detail: String(error) }) };
}
