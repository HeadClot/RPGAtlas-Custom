/* RPGAtlas — src/platform/browser/local-storage-driver.ts
   The browser StorageDriver: a thin, synchronous view over window.localStorage
   (Phase 1 Stage D). This is the one place the repositories touch the platform
   storage API; Phase 6 adds IndexedDB- and Tauri-FS-backed drivers alongside
   it. Behavior-frozen: getItem/setItem/removeItem forward verbatim, so quota
   errors from setItem propagate to the caller exactly as they do today (the
   save/options logic already try/catches them). GPL-3.0-or-later. */

import type { StorageDriver } from "../../shared/services";

/** A StorageDriver backed by a Web Storage object (default: window.localStorage).
 *  Forwards verbatim — setItem lets a QuotaExceededError propagate so callers
 *  keep their existing storage-full handling.
 *
 *  The store is resolved LAZILY (per call, not at construction). This matters:
 *  the original inline engine helpers touched `localStorage` only inside
 *  functions, never at module eval, so a bundle loaded in an opaque origin
 *  (e.g. the export smoke test's setContent about:blank, where accessing
 *  `window.localStorage` throws SecurityError) still evaluates cleanly and only
 *  fails if/when storage is actually used — behavior-frozen. */
export class LocalStorageDriver implements StorageDriver {
  private readonly resolve: () => Storage;

  /** Pass an explicit Storage, or omit to lazily use window.localStorage. */
  constructor(store?: Storage) {
    this.resolve = store ? () => store : () => window.localStorage;
  }

  getItem(key: string): string | null {
    return this.resolve().getItem(key);
  }

  setItem(key: string, value: string): void {
    this.resolve().setItem(key, value);
  }

  removeItem(key: string): void {
    this.resolve().removeItem(key);
  }
}

/** The shared browser driver instance over window.localStorage. */
export const localStorageDriver = new LocalStorageDriver();
