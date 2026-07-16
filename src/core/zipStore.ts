/**
 * Minimal STORE-only (no compression) ZIP writer for bundling bulk .prst
 * exports into a single download. Framework-agnostic on purpose — a full
 * JSZip dependency is overkill for "concatenate N small binary files", and
 * firing 256 separate downloads trips popup blocking.
 *
 * Layout per the PKWARE APPNOTE: [local header + data]×N, then the central
 * directory, then the end-of-central-directory record. All fields LE.
 */

export interface ZipEntry {
  /** Path inside the archive. Encoded as UTF-8 (flag bit 11 set). */
  name: string;
  data: Uint8Array;
}

const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      if (c & 1) c = 0xEDB88320 ^ (c >>> 1);
      else c = c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc = CRC_TABLE[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

const LOCAL_HEADER_SIZE = 30;
const CENTRAL_HEADER_SIZE = 46;
const EOCD_SIZE = 22;
/** version 2.0 — STORE needs nothing newer */
const VERSION = 20;
/** general-purpose flag: bit 11 = UTF-8 filenames */
const FLAG_UTF8 = 0x0800;

export function createZip(entries: ZipEntry[]): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder();
  const encoded = entries.map((entry) => ({
    nameBytes: encoder.encode(entry.name),
    data: entry.data,
    crc: crc32(entry.data),
    offset: 0,
  }));

  let localSize = 0;
  for (const file of encoded) {
    localSize += LOCAL_HEADER_SIZE + file.nameBytes.length + file.data.length;
  }
  let centralSize = 0;
  for (const file of encoded) {
    centralSize += CENTRAL_HEADER_SIZE + file.nameBytes.length;
  }

  const out = new Uint8Array(localSize + centralSize + EOCD_SIZE);
  const view = new DataView(out.buffer);
  let pos = 0;

  // Local file headers + data
  for (const file of encoded) {
    file.offset = pos;
    view.setUint32(pos, 0x04034B50, true);            // local header signature
    view.setUint16(pos + 4, VERSION, true);
    view.setUint16(pos + 6, FLAG_UTF8, true);
    view.setUint16(pos + 8, 0, true);                 // method 0 = STORE
    view.setUint16(pos + 10, 0, true);                // mod time (zeroed — deterministic)
    view.setUint16(pos + 12, 0, true);                // mod date
    view.setUint32(pos + 14, file.crc, true);
    view.setUint32(pos + 18, file.data.length, true); // compressed size (= raw for STORE)
    view.setUint32(pos + 22, file.data.length, true); // uncompressed size
    view.setUint16(pos + 26, file.nameBytes.length, true);
    view.setUint16(pos + 28, 0, true);                // extra field length
    pos += LOCAL_HEADER_SIZE;
    out.set(file.nameBytes, pos);
    pos += file.nameBytes.length;
    out.set(file.data, pos);
    pos += file.data.length;
  }

  // Central directory
  const centralStart = pos;
  for (const file of encoded) {
    view.setUint32(pos, 0x02014B50, true);            // central header signature
    view.setUint16(pos + 4, VERSION, true);           // version made by
    view.setUint16(pos + 6, VERSION, true);           // version needed
    view.setUint16(pos + 8, FLAG_UTF8, true);
    view.setUint16(pos + 10, 0, true);                // method 0 = STORE
    view.setUint16(pos + 12, 0, true);                // mod time
    view.setUint16(pos + 14, 0, true);                // mod date
    view.setUint32(pos + 16, file.crc, true);
    view.setUint32(pos + 20, file.data.length, true);
    view.setUint32(pos + 24, file.data.length, true);
    view.setUint16(pos + 28, file.nameBytes.length, true);
    view.setUint16(pos + 30, 0, true);                // extra length
    view.setUint16(pos + 32, 0, true);                // comment length
    view.setUint16(pos + 34, 0, true);                // disk number
    view.setUint16(pos + 36, 0, true);                // internal attrs
    view.setUint32(pos + 38, 0, true);                // external attrs
    view.setUint32(pos + 42, file.offset, true);      // local header offset
    pos += CENTRAL_HEADER_SIZE;
    out.set(file.nameBytes, pos);
    pos += file.nameBytes.length;
  }

  // End of central directory
  view.setUint32(pos, 0x06054B50, true);              // EOCD signature
  view.setUint16(pos + 4, 0, true);                   // this disk
  view.setUint16(pos + 6, 0, true);                   // central-dir disk
  view.setUint16(pos + 8, encoded.length, true);      // entries on this disk
  view.setUint16(pos + 10, encoded.length, true);     // total entries
  view.setUint32(pos + 12, centralSize, true);        // central-dir size
  view.setUint32(pos + 16, centralStart, true);       // central-dir offset
  view.setUint16(pos + 20, 0, true);                  // comment length

  return out;
}
