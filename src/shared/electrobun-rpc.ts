/* RPGAtlas — typed Electrobun desktop RPC contract. */
/* eslint-disable @typescript-eslint/no-explicit-any */

import type { ElectrobunRPCSchema, RPCSchema } from "electrobun";

export interface DesktopRequests {
  [key: string]: { params: any; response: any };
  save_project: { params: { json: string; suggested: string }; response: string | null };
  save_project_to_path: { params: { path: string; json: string }; response: void };
  open_project: { params: undefined; response: string | null };
  open_playtest: { params: undefined; response: void };
  library_list: { params: undefined; response: string };
  library_read: { params: { key: string }; response: { data: string; mime?: string } | null };
  library_write: { params: { metaJson: string; dataBase64: string }; response: void };
  library_delete: { params: { key: string }; response: void };
  library_set_meta: { params: { metaJson: string }; response: void };
  library_import_dir: { params: undefined; response: string };
  library_reveal_import: { params: undefined; response: void };
  library_scan_import: { params: undefined; response: string };
  project_create: { params: { parentDir: string; name: string; documentJson: string }; response: ProjectBundleRPC };
  project_open: { params: { target: string }; response: ProjectBundleRPC };
  project_save: { params: { root: string; documentJson: string }; response: void };
  recents_list: { params: undefined; response: string };
  recents_touch: { params: { path: string; name: string }; response: void };
  recents_remove: { params: { path: string }; response: void };
  project_reveal: { params: { root: string }; response: void };
  project_asset_index_read: { params: { root: string }; response: string };
  project_asset_index_write: { params: { root: string; json: string }; response: void };
  project_asset_read: { params: { root: string; relPath: string | null; hash: string | null }; response: AssetBlobRPC | null };
  project_asset_write_inplace: { params: { root: string; assetType: string; fileName: string; dataBase64: string }; response: string };
  project_asset_write_cache: { params: { root: string; hash: string; dataBase64: string }; response: void };
  project_asset_delete_cache: { params: { root: string; hash: string }; response: void };
  project_assets_scan: { params: { root: string }; response: string };
  project_ensure_assets_readme: { params: { root: string }; response: void };
  take_launch_path: { params: undefined; response: string | null };
  pick_directory: { params: { title?: string }; response: string | null };
  pick_folder: { params: { title?: string }; response: string | null };
}

export interface DesktopMessages {
  open_project_request: { path: string };
}

export interface ProjectBundleRPC { root: string; name: string; document: string; }
export interface AssetBlobRPC { data: string; mime?: string; }

export const DESKTOP_REQUEST_NAMES = [
  "save_project", "save_project_to_path", "open_project", "open_playtest",
  "library_list", "library_read", "library_write", "library_delete", "library_set_meta",
  "library_import_dir", "library_reveal_import", "library_scan_import",
  "project_create", "project_open", "project_save", "recents_list", "recents_touch",
  "recents_remove", "project_reveal", "project_asset_index_read", "project_asset_index_write",
  "project_asset_read", "project_asset_write_inplace", "project_asset_write_cache",
  "project_asset_delete_cache", "project_assets_scan", "project_ensure_assets_readme",
  "take_launch_path", "pick_directory", "pick_folder",
] as const satisfies readonly (keyof DesktopRequests)[];

export type DesktopRPCSchema = {
  bun: RPCSchema<{ requests: DesktopRequests; messages: Record<never, never> }>;
  webview: RPCSchema<{ requests: Record<never, never>; messages: DesktopMessages }>;
} & ElectrobunRPCSchema;
