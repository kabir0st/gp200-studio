import type { CtrlAssignment, ExpAssignment } from './types';

/**
 * TLV record walker for the .prst "controls" tail, the region between the
 * last effect block (0x3B0) and the checksum (0x4C6) that stores EXP pedal
 * and CTRL footswitch assignments. Layout hex-verified against real device
 * exports (dumps/prts/*.prst, firmware 1.8.0):
 *
 *   0x3B0  8 zero bytes (padding)
 *   0x3B8  9 × 16-byte EXP records:  header 0C 00 0C 00 (type 0x000C, size 12)
 *          payload: [slotId u8 = page<<4|item][blockIndex u8, FF=unassigned]
 *                   [paramIndex u16 LE][max f32 LE][min f32 LE]
 *   0x448  3 × 8-byte unknown records: header 10 00 04 00 (type 0x0010, size 4)
 *          payload: [id u8][value u8][0000]; semantics unknown (fixtures:
 *          FF FF 0B); round-tripped opaquely, never modeled.
 *   0x460  8 × 12-byte CTRL records: header 0F 00 08 00 (type 0x000F, size 8)
 *          payload: [ctrlIndex u8 0–7][state u8 0/1][2 bytes uninitialized]
 *                   [blockMask u16 LE][2 bytes uninitialized]
 *          bit n of blockMask = fixed block n (0=PRE..10=VOL); bit 11 also
 *          appears in real exports (unmodeled, kept verbatim; possibly the
 *          FX loop). The state byte is the CTRL's saved toggle position, not
 *          an enable gate (masks are honored with state 0). The two 2-byte
 *          windows and the mask's high nibble carry uninitialized firmware
 *          memory (repeating strides, ASCII fragments) and must round-trip
 *          untouched. Layout hex-verified against real device exports
 *          (dumps/prts/*.prst); an earlier capture misread the mask at
 *          payload+1, lighting phantom PRE/DLY/RVB/VOL pedals.
 *   0x4C0  footer C0 04 00 00 00 00, then the BE16 checksum at 0x4C6.
 *
 * Shared by PRSTDecoder, PRSTEncoder, and SysExCodec (device dumps use the
 * same layout shifted -0x28) so the codecs can't drift apart. All functions
 * are defensive: malformed tails yield `undefined`, never a throw; factory
 * 1176-byte files have an unknown tail layout and must keep decoding.
 */

/** File offset where the controls tail begins (after the 11th effect block). */
export const CONTROL_RECORDS_FILE_OFFSET = 0x3B0;
/** Device state/read dumps mirror the file layout shifted -0x28. */
export const CONTROL_RECORDS_DUMP_OFFSET = 0x388;

const TYPE_EXP = 0x000C;
const TYPE_UNKNOWN10 = 0x0010;
const TYPE_CTRL = 0x000F;
const HEADER_SIZE = 4;
const EXP_PAYLOAD_SIZE = 12;
const CTRL_PAYLOAD_SIZE = 8;
const UNKNOWN10_PAYLOAD_SIZE = 4;
const EXP_RECORD_COUNT = 9;
const CTRL_RECORD_COUNT = 8;

export interface ParsedControlRecords {
  exp: ExpAssignment[];
  ctrl: CtrlAssignment[];
}

function readU16LE(bytes: Uint8Array, off: number): number {
  return bytes[off] | (bytes[off + 1] << 8);
}

function readF32LE(bytes: Uint8Array, off: number): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset + off, 4);
  return view.getFloat32(0, true);
}

function writeU16LE(bytes: Uint8Array, off: number, value: number): void {
  bytes[off] = value & 0xFF;
  bytes[off + 1] = (value >> 8) & 0xFF;
}

function writeF32LE(bytes: Uint8Array, off: number, value: number): void {
  const view = new DataView(bytes.buffer, bytes.byteOffset + off, 4);
  view.setFloat32(0, value, true);
}

interface RecordPosition {
  type: number;
  payloadOffset: number;
  payloadSize: number;
}

/**
 * Walk the record stream from startOffset. Skips leading zero padding, reads
 * [type u16 LE][size u16 LE][payload] until an unknown type, the footer, or
 * the end of the buffer. Returns undefined when the stream is malformed
 * (truncated payload, size mismatch for a known type).
 */
function walkRecords(bytes: Uint8Array, startOffset: number): RecordPosition[] | undefined {
  const positions: RecordPosition[] = [];
  let off = startOffset;
  // Skip leading zero padding (8 bytes in real files; tolerate any even amount).
  while (off + 1 < bytes.length && bytes[off] === 0 && bytes[off + 1] === 0) {
    off += 2;
    if (off - startOffset > 32) return undefined; // padding runaway, not a record stream
  }
  const EXPECTED_SIZE: Record<number, number> = {
    [TYPE_EXP]: EXP_PAYLOAD_SIZE,
    [TYPE_CTRL]: CTRL_PAYLOAD_SIZE,
    [TYPE_UNKNOWN10]: UNKNOWN10_PAYLOAD_SIZE,
  };
  while (off + HEADER_SIZE <= bytes.length) {
    const type = readU16LE(bytes, off);
    const size = readU16LE(bytes, off + 2);
    const expected = EXPECTED_SIZE[type];
    if (expected === undefined) break; // footer (0x04C0) or anything unrecognized
    if (size !== expected) return undefined;
    if (off + HEADER_SIZE + size > bytes.length) return undefined;
    positions.push({ type, payloadOffset: off + HEADER_SIZE, payloadSize: size });
    off += HEADER_SIZE + size;
  }
  return positions;
}

/**
 * Parse EXP + CTRL assignments from a controls tail. Returns undefined when
 * the region doesn't contain the expected record counts (unknown firmware
 * layout, factory files); callers then leave the preset fields absent and
 * rely on rawSource passthrough.
 */
export function parseControlRecords(
  bytes: Uint8Array,
  startOffset: number,
): ParsedControlRecords | undefined {
  if (startOffset >= bytes.length) return undefined;
  const positions = walkRecords(bytes, startOffset);
  if (!positions) return undefined;

  const exp: ExpAssignment[] = [];
  const ctrl: CtrlAssignment[] = [];
  for (const record of positions) {
    if (record.type === TYPE_EXP) {
      const p = record.payloadOffset;
      const slotId = bytes[p];
      const page = (slotId >> 4) & 0x0F;
      const item = slotId & 0x0F;
      if (page > 2 || item > 2) return undefined; // structural: stream misaligned
      // Value tolerance: keep the raw block byte as-is. 0..10 = a modeled
      // block, 0xFF = unassigned (null), 11..254 = an unmodeled/special target
      // (e.g. EXP → Patch Volume). Previously any 11..254 aborted the WHOLE
      // parse, silently dropping every EXP *and* CTRL assignment, so a single
      // special EXP target made the footswitch panel read "nothing assigned."
      const rawBlock = bytes[p + 1];
      const blockIndex: number | null = rawBlock === 0xFF ? null : rawBlock;
      exp.push({
        page,
        item,
        blockIndex,
        paramIndex: readU16LE(bytes, p + 2),
        max: readF32LE(bytes, p + 4),
        min: readF32LE(bytes, p + 8),
      });
    } else if (record.type === TYPE_CTRL) {
      const p = record.payloadOffset;
      const ctrlIndex = bytes[p];
      if (ctrlIndex > 7) return undefined; // structural: stream misaligned
      // Mask lives at payload+4 (payload+1 is the saved toggle state, +2..3
      // uninitialized memory). Strip the high nibble — it carries garbage in
      // real exports — but keep bit 11, which the device does write.
      const blockMask = readU16LE(bytes, p + 4) & 0x0FFF;
      ctrl.push({ ctrlIndex, blockMask });
    }
    // TYPE_UNKNOWN10: opaque, intentionally skipped.
  }
  if (exp.length !== EXP_RECORD_COUNT || ctrl.length !== CTRL_RECORD_COUNT) return undefined;
  return { exp, ctrl };
}

/**
 * Overwrite the assignment payload fields of an existing record stream in
 * place (rawSource-based encoding). Only the modeled fields change; record
 * headers, unknown 0x0010 records, and the footer keep their original bytes.
 * Returns false when the stream can't be walked or any requested assignment
 * found no matching record; callers then know the export dropped modeled
 * data and can fall back / warn instead of silently losing assignments.
 */
export function applyControlRecords(
  target: Uint8Array,
  startOffset: number,
  exp: ExpAssignment[] | undefined,
  ctrl: CtrlAssignment[] | undefined,
): boolean {
  if (!exp && !ctrl) return true;
  const positions = walkRecords(target, startOffset);
  if (!positions) return false;

  const expBySlot = new Map<number, ExpAssignment>();
  for (const assignment of exp ?? []) {
    expBySlot.set((assignment.page << 4) | assignment.item, assignment);
  }
  const ctrlByIndex = new Map<number, CtrlAssignment>();
  for (const assignment of ctrl ?? []) {
    ctrlByIndex.set(assignment.ctrlIndex, assignment);
  }

  for (const record of positions) {
    const p = record.payloadOffset;
    if (record.type === TYPE_EXP) {
      const assignment = expBySlot.get(target[p]);
      if (!assignment) continue;
      let rawBlock = 0xFF;
      if (assignment.blockIndex !== null) rawBlock = assignment.blockIndex;
      target[p + 1] = rawBlock;
      writeU16LE(target, p + 2, assignment.paramIndex);
      writeF32LE(target, p + 4, assignment.max);
      writeF32LE(target, p + 8, assignment.min);
      expBySlot.delete(target[p]);
    } else if (record.type === TYPE_CTRL) {
      const assignment = ctrlByIndex.get(target[p]);
      if (!assignment) continue;
      // Write only the 12 mask bits at payload+4; the state byte (+1), the
      // uninitialized windows (+2..3, +6..7), and the mask's garbage high
      // nibble keep their device-written bytes so exports stay byte-exact.
      target[p + 4] = assignment.blockMask & 0xFF;
      target[p + 5] = (target[p + 5] & 0xF0) | ((assignment.blockMask >> 8) & 0x0F);
      ctrlByIndex.delete(target[p]);
    }
  }
  return expBySlot.size === 0 && ctrlByIndex.size === 0;
}

/** Device-default EXP assignments observed in every fw 1.8.0 export:
 *  EXP1 Mode A Para 1 = VOL block (10) param 0, EXP1 Mode B Para 1 = WAH
 *  block (1) param 3, everything else unassigned, range 0..100. */
export function defaultExpAssignments(): ExpAssignment[] {
  const assignments: ExpAssignment[] = [];
  for (let page = 0; page <= 2; page++) {
    for (let item = 0; item <= 2; item++) {
      let blockIndex: number | null = null;
      let paramIndex = 0;
      if (page === 0 && item === 0) blockIndex = 10;
      if (page === 1 && item === 0) {
        blockIndex = 1;
        paramIndex = 3;
      }
      assignments.push({ page, item, blockIndex, paramIndex, min: 0, max: 100 });
    }
  }
  return assignments;
}

export function defaultCtrlAssignments(): CtrlAssignment[] {
  return Array.from({ length: CTRL_RECORD_COUNT }, (_, ctrlIndex) => ({
    ctrlIndex,
    blockMask: 0,
  }));
}

/**
 * Build the full canonical controls tail (0x3B0..0x4C5 region, 278 bytes)
 * for synthetic presets that have no rawSource. Matches the fw 1.8.0 export
 * byte-for-byte when called with defaults.
 */
export function buildDefaultTail(
  exp?: ExpAssignment[],
  ctrl?: CtrlAssignment[],
): Uint8Array {
  const expAssignments = exp ?? defaultExpAssignments();
  const ctrlAssignments = ctrl ?? defaultCtrlAssignments();
  const size =
    8 +
    EXP_RECORD_COUNT * (HEADER_SIZE + EXP_PAYLOAD_SIZE) +
    3 * (HEADER_SIZE + UNKNOWN10_PAYLOAD_SIZE) +
    CTRL_RECORD_COUNT * (HEADER_SIZE + CTRL_PAYLOAD_SIZE) +
    6;
  const tail = new Uint8Array(size);
  let off = 8; // leading zero padding

  const expBySlot = new Map<number, ExpAssignment>();
  for (const assignment of expAssignments) {
    expBySlot.set((assignment.page << 4) | assignment.item, assignment);
  }
  for (let page = 0; page <= 2; page++) {
    for (let item = 0; item <= 2; item++) {
      const slotId = (page << 4) | item;
      writeU16LE(tail, off, TYPE_EXP);
      writeU16LE(tail, off + 2, EXP_PAYLOAD_SIZE);
      const assignment = expBySlot.get(slotId);
      tail[off + 4] = slotId;
      let rawBlock = 0xFF;
      let paramIndex = 0;
      let max = 100;
      let min = 0;
      if (assignment) {
        if (assignment.blockIndex !== null) rawBlock = assignment.blockIndex;
        paramIndex = assignment.paramIndex;
        max = assignment.max;
        min = assignment.min;
      }
      tail[off + 5] = rawBlock;
      writeU16LE(tail, off + 6, paramIndex);
      writeF32LE(tail, off + 8, max);
      writeF32LE(tail, off + 12, min);
      off += HEADER_SIZE + EXP_PAYLOAD_SIZE;
    }
  }

  // Three unknown 0x0010 records: constant values from every observed export.
  const UNKNOWN10_VALUES = [0xFF, 0xFF, 0x0B];
  for (let id = 0; id < UNKNOWN10_VALUES.length; id++) {
    writeU16LE(tail, off, TYPE_UNKNOWN10);
    writeU16LE(tail, off + 2, UNKNOWN10_PAYLOAD_SIZE);
    tail[off + 4] = id;
    tail[off + 5] = UNKNOWN10_VALUES[id];
    off += HEADER_SIZE + UNKNOWN10_PAYLOAD_SIZE;
  }

  const ctrlByIndex = new Map<number, CtrlAssignment>();
  for (const assignment of ctrlAssignments) {
    ctrlByIndex.set(assignment.ctrlIndex, assignment);
  }
  for (let ctrlIndex = 0; ctrlIndex < CTRL_RECORD_COUNT; ctrlIndex++) {
    writeU16LE(tail, off, TYPE_CTRL);
    writeU16LE(tail, off + 2, CTRL_PAYLOAD_SIZE);
    tail[off + 4] = ctrlIndex;
    // state byte (+5) and the two unknown windows (+6..7, +10..11) stay zero;
    // a clean device save writes zeros there too.
    writeU16LE(tail, off + 8, ctrlByIndex.get(ctrlIndex)?.blockMask ?? 0);
    off += HEADER_SIZE + CTRL_PAYLOAD_SIZE;
  }

  // Footer: C0 04 00 00 00 00
  tail[off] = 0xC0;
  tail[off + 1] = 0x04;
  return tail;
}
