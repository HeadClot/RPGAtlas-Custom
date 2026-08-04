/* RPGAtlas — src/platform/browser/idb-asset-store.ts
   The browser AssetStore (Phase 6 Stage A): binary asset library over
   IndexedDB — the blob half of the Phase 1 storage abstraction, breaking the
   localStorage ceiling for imported art/audio. Two object stores so list()
   never copies blobs: "meta" (AssetMeta by key) and "blobs" (Blob by key).
   Every method opens one short transaction; failures reject and the caller
   (asset-library.ts) degrades to shipped-assets-only with a console warning.
   GPL-3.0-or-later (see LICENSE). */

import type { AssetMeta, AssetStore } from "../../shared/services";

const DB_NAME = "rpgatlas_library";
const DB_VERSION = 1;
const META = "meta";
const BLOBS = "blobs";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: "key" });
      if (!db.objectStoreNames.contains(BLOBS)) db.createObjectStore(BLOBS);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("rpgatlas_library open blocked"));
  });
}

function requestPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("transaction aborted"));
  });
}

export class IdbAssetStore implements AssetStore {
  private db: Promise<IDBDatabase> | null = null;

  private open(): Promise<IDBDatabase> {
    // Lazy + memoized: nothing touches IndexedDB until the library is used,
    // and a failed open is retried on the next call (private-mode quirks).
    if (!this.db) {
      this.db = openDb().catch((e) => {
        this.db = null;
        throw e;
      });
    }
    return this.db;
  }

  async list(): Promise<AssetMeta[]> {
    const db = await this.open();
    const tx = db.transaction(META, "readonly");
    const metas = await requestPromise(tx.objectStore(META).getAll() as IDBRequest<AssetMeta[]>);
    return metas || [];
  }

  async get(key: string): Promise<Blob | null> {
    const db = await this.open();
    const tx = db.transaction(BLOBS, "readonly");
    const blob = await requestPromise(tx.objectStore(BLOBS).get(key) as IDBRequest<Blob | undefined>);
    return blob || null;
  }

  async getAllBlobs(): Promise<Map<string, Blob>> {
    // One readonly transaction for the whole store — the library boot used to
    // fire get() per key, and thousands of parallel transactions could kill
    // the renderer outright on a big (oversliced) library.
    const db = await this.open();
    const tx = db.transaction(BLOBS, "readonly");
    const store = tx.objectStore(BLOBS);
    const [keys, blobs] = await Promise.all([
      requestPromise(store.getAllKeys() as IDBRequest<IDBValidKey[]>),
      requestPromise(store.getAll() as IDBRequest<Blob[]>),
    ]);
    const out = new Map<string, Blob>();
    for (let i = 0; i < keys.length; i++) out.set(String(keys[i]), blobs[i]);
    return out;
  }

  async put(meta: AssetMeta, blob: Blob): Promise<void> {
    const db = await this.open();
    const tx = db.transaction([META, BLOBS], "readwrite");
    tx.objectStore(META).put(meta);
    tx.objectStore(BLOBS).put(blob, meta.key);
    await txDone(tx);
  }

  async remove(key: string): Promise<void> {
    const db = await this.open();
    const tx = db.transaction([META, BLOBS], "readwrite");
    tx.objectStore(META).delete(key);
    tx.objectStore(BLOBS).delete(key);
    await txDone(tx);
  }

  async setMeta(meta: AssetMeta): Promise<void> {
    const db = await this.open();
    const tx = db.transaction(META, "readwrite");
    tx.objectStore(META).put(meta);
    await txDone(tx);
  }
}
