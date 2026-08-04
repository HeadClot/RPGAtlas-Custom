/* RPGAtlas — src/editor/importers/mz/zip-read.ts
   Project Compass M1·D: a tiny, dependency-free ZIP reader so the import wizard
   can accept a `.zip` of an RPG Maker project as well as a picked folder. It is
   the mirror of the STORE-method writer in src/editor/export-web.ts, plus DEFLATE
   support via the platform's native `DecompressionStream("deflate-raw")` (present
   in Chromium — the browser + Tauri target — and in Node 18+ where vitest runs).

   Parses the End-of-Central-Directory record, then walks the central directory
   so entry offsets are authoritative (not guessed from local headers). Returns a
   plain `{ path: bytes }` map ready for `objectSource` — asset bytes and all, so
   the same intake path a picked folder uses serves a zip too. Pure (no DOM, no
   editor state); the wizard owns the file-picking UI. GPL-3.0-or-later. */

const SIG_EOCD = 0x06054b50;
const SIG_CENTRAL = 0x02014b50;
const dec = new TextDecoder();

/** Inflate a raw DEFLATE stream (ZIP method 8) using the platform stream API. */
async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream("deflate-raw");
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Read every file entry of a ZIP into a `{ path: bytes }` map. Directory entries
 * (names ending in "/") are skipped. Supports STORE (method 0) and DEFLATE
 * (method 8) — the only methods RPG Maker's own exports and ordinary zip tools
 * produce. Throws a plain-language error when the buffer isn't a valid zip so the
 * wizard can show a friendly message rather than a crash.
 */
export async function readZip(zip: Uint8Array): Promise<Record<string, Uint8Array>> {
  const dv = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);

  // Locate the EOCD by scanning backwards (its trailing comment is usually empty
  // but may be up to 64KB, so bound the scan there).
  let eocd = -1;
  const minStart = Math.max(0, zip.length - 22 - 0xffff);
  for (let i = zip.length - 22; i >= minStart; i--) {
    if (dv.getUint32(i, true) === SIG_EOCD) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("That file isn't a .zip we can read.");

  const count = dv.getUint16(eocd + 10, true);
  let off = dv.getUint32(eocd + 16, true); // central directory start

  const out: Record<string, Uint8Array> = {};
  for (let n = 0; n < count && off + 46 <= zip.length; n++) {
    if (dv.getUint32(off, true) !== SIG_CENTRAL) break;
    const method = dv.getUint16(off + 10, true);
    const compSize = dv.getUint32(off + 20, true);
    const nameLen = dv.getUint16(off + 28, true);
    const extraLen = dv.getUint16(off + 30, true);
    const commentLen = dv.getUint16(off + 32, true);
    const localOff = dv.getUint32(off + 42, true);
    const name = dec.decode(zip.subarray(off + 46, off + 46 + nameLen));

    if (!name.endsWith("/")) {
      // The local header's name/extra lengths can differ from the central one,
      // so read the data start from the local header itself.
      const lNameLen = dv.getUint16(localOff + 26, true);
      const lExtraLen = dv.getUint16(localOff + 28, true);
      const dataStart = localOff + 30 + lNameLen + lExtraLen;
      const comp = zip.subarray(dataStart, dataStart + compSize);
      out[name] = method === 0 ? comp.slice() : await inflateRaw(comp);
    }

    off += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}
