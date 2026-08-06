/* RPGAtlas — legacy app-data AssetStore over Electrobun RPC. */

import type { AssetMeta, AssetStore } from "../../shared/services";
import { getBridge } from "./project-host";

function rpc() {
  const bridge = getBridge();
  if (!bridge) throw new Error("The desktop bridge is unavailable.");
  return bridge.rpc;
}

function base64ToBlob(base64: string, mime?: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], mime ? { type: mime } : undefined);
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export class FsAssetStore implements AssetStore {
  async list(): Promise<AssetMeta[]> { const parsed = JSON.parse(await rpc().request.library_list() || "[]"); return Array.isArray(parsed) ? parsed : []; }
  async get(key: string): Promise<Blob | null> { const result = await rpc().request.library_read({ key }); return result?.data ? base64ToBlob(result.data, result.mime) : null; }
  async put(meta: AssetMeta, blob: Blob): Promise<void> { await rpc().request.library_write({ metaJson: JSON.stringify(meta), dataBase64: await blobToBase64(blob) }); }
  async remove(key: string): Promise<void> { await rpc().request.library_delete({ key }); }
  async setMeta(meta: AssetMeta): Promise<void> { await rpc().request.library_set_meta({ metaJson: JSON.stringify(meta) }); }
}
