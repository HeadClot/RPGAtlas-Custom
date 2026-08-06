/* RPGAtlas — typed Electrobun project/asset façade. */
/* eslint-disable @typescript-eslint/no-explicit-any */

import type { ProjectErrorCode } from "../../shared/project/project-errors";
import { parseRecents, type Recent } from "../../shared/project/recents";
import type { AssetBlobRPC, ProjectBundleRPC } from "../../shared/electrobun-rpc";

export interface ProjectBundle { root: string; name: string; document: string; }
export interface AssetBlobResult { data: string; mime?: string; }
export interface ScannedFile { type: string; relPath: string; size: number; mtimeMs: number; }

export class ProjectHostError extends Error {
  readonly code: ProjectErrorCode;
  readonly detail?: string;
  constructor(code: ProjectErrorCode, detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = "ProjectHostError";
    this.code = code;
    this.detail = detail;
  }
}

function rpc() {
  const bridge = getBridge();
  if (!bridge) throw new ProjectHostError("IO", "The desktop bridge is unavailable.");
  return bridge.rpc;
}

function getBridge(): Window["__ATLAS_ELECTROBUN__"] {
  return (window as any).__ATLAS_ELECTROBUN__ as Window["__ATLAS_ELECTROBUN__"];
}

function toHostError(error: unknown): ProjectHostError {
  const message = error instanceof Error ? error.message : String(error);
  try {
    const parsed = JSON.parse(message) as { code?: ProjectErrorCode; detail?: string };
    if (parsed?.code) return new ProjectHostError(parsed.code, parsed.detail);
  } catch { /* not a serialized ProjectError */ }
  return new ProjectHostError("IO", message);
}

async function call<T>(fn: () => Promise<T>): Promise<T> {
  try { return await fn(); } catch (error) { throw toHostError(error); }
}

export const projectHost = {
  create(parentDir: string, name: string, documentJson: string): Promise<ProjectBundle> {
    return call(() => rpc().request.project_create({ parentDir, name, documentJson }) as Promise<ProjectBundleRPC>);
  },
  open(target: string): Promise<ProjectBundle> { return call(() => rpc().request.project_open({ target })); },
  save(root: string, documentJson: string): Promise<void> { return call(() => rpc().request.project_save({ root, documentJson })); },
  async recentsList(): Promise<Recent[]> { return parseRecents(await call(() => rpc().request.recents_list())); },
  recentsTouch(path: string, name: string): Promise<void> { return call(() => rpc().request.recents_touch({ path, name })); },
  recentsRemove(path: string): Promise<void> { return call(() => rpc().request.recents_remove({ path })); },
  reveal(root: string): Promise<void> { return call(() => rpc().request.project_reveal({ root })); },
  takeLaunchPath(): Promise<string | null> { return call(() => rpc().request.take_launch_path()); },
  assetIndexRead(root: string): Promise<string> { return call(() => rpc().request.project_asset_index_read({ root })); },
  assetIndexWrite(root: string, json: string): Promise<void> { return call(() => rpc().request.project_asset_index_write({ root, json })); },
  assetRead(root: string, relPath: string | null, hash: string | null): Promise<AssetBlobResult | null> {
    return call(() => rpc().request.project_asset_read({ root, relPath, hash }) as Promise<AssetBlobRPC | null>);
  },
  assetWriteInPlace(root: string, type: string, fileName: string, dataBase64: string): Promise<string> {
    return call(() => rpc().request.project_asset_write_inplace({ root, assetType: type, fileName, dataBase64 }));
  },
  assetWriteCache(root: string, hash: string, dataBase64: string): Promise<void> {
    return call(() => rpc().request.project_asset_write_cache({ root, hash, dataBase64 }));
  },
  assetDeleteCache(root: string, hash: string): Promise<void> { return call(() => rpc().request.project_asset_delete_cache({ root, hash })); },
  async assetsScan(root: string): Promise<ScannedFile[]> {
    const parsed = JSON.parse(await call(() => rpc().request.project_assets_scan({ root })) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  },
  ensureAssetsReadme(root: string): Promise<void> { return call(() => rpc().request.project_ensure_assets_readme({ root })); },
};

export { getBridge };
