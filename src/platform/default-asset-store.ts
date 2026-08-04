/* RPGAtlas — src/platform/default-asset-store.ts
   Picks this session's AssetStore (Phase 6 Stage A): Tauri FS commands under
   the desktop wrapper (both the editor and playtest windows share the same
   app-data library), IndexedDB in the browser, null when neither is usable
   (the library degrades to shipped assets only). Dynamic imports keep each
   driver out of the other platform's bundle path. GPL-3.0-or-later. */

/* eslint-disable @typescript-eslint/no-explicit-any */

import type { AssetStore } from "../shared/services";

export async function createDefaultAssetStore(): Promise<AssetStore | null> {
  try {
    if (typeof window === "undefined") return null;
    if ((window as any).__TAURI__) {
      const m = await import("./tauri/fs-asset-store");
      return new m.FsAssetStore();
    }
    if (window.indexedDB) {
      const m = await import("./browser/idb-asset-store");
      return new m.IdbAssetStore();
    }
  } catch (e) {
    console.warn("[library] no asset store available", e);
  }
  return null;
}
