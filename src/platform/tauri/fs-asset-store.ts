/* RPGAtlas — src/platform/tauri/fs-asset-store.ts
   The desktop AssetStore (Phase 6 Stage A): binary asset library over app-data
   files via the Tauri library_* commands (src-tauri/src/lib.rs) — the same
   custom-invoke pattern host.js established. Layout on disk:
   <app-data>/library/index.json (the AssetMeta list) + blobs/<sha-hash> files.
   IPC carries base64; blobs rebuild their MIME from meta.mime. Only the boot
   wiring constructs this (gated on window.__TAURI__), so browser builds never
   touch it. GPL-3.0-or-later (see LICENSE). */

/* eslint-disable @typescript-eslint/no-explicit-any */

import type { AssetMeta, AssetStore } from "../../shared/services";

function invoke(cmd: string, args?: Record<string, unknown>): Promise<any> {
  return (window as any).__TAURI__.core.invoke(cmd, args);
}

function base64ToBlob(base64: string, mime?: string): Blob {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], mime ? { type: mime } : undefined);
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  // Chunked to keep the argument list under engine limits on big files.
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

export class FsAssetStore implements AssetStore {
  async list(): Promise<AssetMeta[]> {
    const json: string = await invoke("library_list");
    const parsed = JSON.parse(json || "[]");
    return Array.isArray(parsed) ? parsed : [];
  }

  async get(key: string): Promise<Blob | null> {
    const res: { data: string; mime?: string } | null = await invoke("library_read", { key });
    if (!res || !res.data) return null;
    return base64ToBlob(res.data, res.mime || undefined);
  }

  async put(meta: AssetMeta, blob: Blob): Promise<void> {
    await invoke("library_write", {
      metaJson: JSON.stringify(meta),
      dataBase64: await blobToBase64(blob),
    });
  }

  async remove(key: string): Promise<void> {
    await invoke("library_delete", { key });
  }

  async setMeta(meta: AssetMeta): Promise<void> {
    await invoke("library_set_meta", { metaJson: JSON.stringify(meta) });
  }
}
