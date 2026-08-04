/* RPGAtlas — src/build-manifest.ts
   Typed surface for the shared build manifest, for new TypeScript code.

   The authoritative runtime data lives in js/build-manifest.mjs (plain ESM, no
   dependencies) so it can be consumed by browser modules and Node tooling alike.
   That file is intentionally excluded from the TS program (js/ is legacy JS).
   New TS code should import the manifest at runtime and treat it as
   ManifestShape; this module documents the contract. GPL-3.0-or-later. */

export interface ManifestShape {
  /** Ordered sources inlined into a single-file standalone game export. */
  readonly STANDALONE_EXPORT_FILES: readonly string[];
  /** Top-level files/dirs making up the complete runtime frontend. */
  readonly FRONTEND_INCLUDE: readonly string[];
  /** The two HTML entry points Vite builds. */
  readonly HTML_ENTRIES: readonly string[];
  /** Directories Vite passes through byte-identical. */
  readonly PASSTHROUGH_DIRS: readonly string[];
}

/** Relative specifier of the authoritative manifest module (from repo root). */
export const MANIFEST_MODULE = "js/build-manifest.mjs";
