import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { SysExCodec } from '@/core/SysExCodec';
import { buildDefaultTail } from '@/core/controlRecords';

/** Build a synthetic 1176-byte decoded preset buffer */
function buildDecodedPreset(name: string, slot: number): Uint8Array {
  const buf = new Uint8Array(1176).fill(0);
  const view = new DataView(buf.buffer);
  // Header: slot at [6:8]
  view.setUint16(6, slot, true);
  // Name at [28:60]
  for (let i = 0; i < name.length && i < 31; i++) {
    buf[28 + i] = name.charCodeAt(i);
  }
  buf[28 + name.length] = 0; // null terminator
  // 11 effect blocks at offset 120, each 72 bytes
  for (let b = 0; b < 11; b++) {
    const base = 120 + b * 72;
    buf[base + 0] = 0x14; buf[base + 1] = 0x00; buf[base + 2] = 0x44; buf[base + 3] = 0x00;
    buf[base + 4] = b;    // slot index
    buf[base + 5] = 1;    // active
    buf[base + 6] = 0x00; buf[base + 7] = 0x0F;
    view.setUint32(base + 8, 0x03000001 + b, true); // effect ID
    // 15 float32 params: param[0] = b * 10.0
    view.setFloat32(base + 12, b * 10.0, true);
  }
  return buf;
}

/** Wrap nibble-encoded bytes into a fake sub=0x18 SysEx message */
function makeChunk(slot: number, offset: number, nibbleData: Uint8Array): Uint8Array {
  const HEADER = [0xF0, 0x21, 0x25, 0x7E, 0x47, 0x50, 0x2D, 0x32, 0x12, 0x18];
  const offLo = offset & 0xFF;
  const offHi = (offset >> 8) & 0xFF;
  const parts = [HEADER, [slot, offLo, offHi], Array.from(nibbleData), [0xF7]];
  return new Uint8Array(parts.flat());
}

/** Build 7 fake sub=0x18 chunks from a 1176-byte decoded buffer */
function buildFakeChunks(decoded: Uint8Array, slot: number): Uint8Array[] {
  const nibble = SysExCodec.nibbleEncode(decoded); // 2352 bytes
  // Real chunk offsets: 0, 313, 626, 1067, 1380, 1821, 2134
  // For testing, split nibble data at these byte offsets into 7 parts
  const chunkNibbleLengths = [370, 370, 370, 370, 370, 370, 132]; // sum = 2352
  const chunkOffsets       = [0,   313, 626, 1067, 1380, 1821, 2134];
  const chunks: Uint8Array[] = [];
  let pos = 0;
  for (let i = 0; i < 7; i++) {
    const nibbleSlice = nibble.slice(pos, pos + chunkNibbleLengths[i]);
    chunks.push(makeChunk(slot, chunkOffsets[i], nibbleSlice));
    pos += chunkNibbleLengths[i];
  }
  return chunks;
}

describe('SysExCodec: nibble encoding', () => {
  it('nibbleDecode: two nibble bytes → one decoded byte', () => {
    // 0x05 0x09 → 0x59
    const input = new Uint8Array([0x05, 0x09]);
    expect(SysExCodec.nibbleDecode(input)).toEqual(new Uint8Array([0x59]));
  });

  it('nibbleEncode: one byte → two nibble bytes', () => {
    const input = new Uint8Array([0x59]);
    expect(SysExCodec.nibbleEncode(input)).toEqual(new Uint8Array([0x05, 0x09]));
  });

  it('nibbleEncode/nibbleDecode round-trip', () => {
    const original = new Uint8Array([0x00, 0x7F, 0xFF, 0x42, 0xAB]);
    expect(SysExCodec.nibbleDecode(SysExCodec.nibbleEncode(original))).toEqual(original);
  });

  it('nibbleDecode ignores trailing odd byte', () => {
    const input = new Uint8Array([0x05, 0x09, 0x03]); // odd length → last byte ignored
    expect(SysExCodec.nibbleDecode(input)).toEqual(new Uint8Array([0x59]));
  });

  it('nibbleEncode all values stay in 0x00–0x0F range', () => {
    const input = new Uint8Array(256).map((_, i) => i);
    const encoded = SysExCodec.nibbleEncode(input);
    for (let i = 0; i < encoded.length; i++) {
      expect(encoded[i]).toBeLessThanOrEqual(0x0F);
    }
  });
});

describe('SysExCodec: slot labels', () => {
  it('slotToLabel: 0 → "1A"', () => expect(SysExCodec.slotToLabel(0)).toBe('1A'));
  it('slotToLabel: 1 → "1B"', () => expect(SysExCodec.slotToLabel(1)).toBe('1B'));
  it('slotToLabel: 3 → "1D"', () => expect(SysExCodec.slotToLabel(3)).toBe('1D'));
  it('slotToLabel: 4 → "2A"', () => expect(SysExCodec.slotToLabel(4)).toBe('2A'));
  it('slotToLabel: 255 → "64D"', () => expect(SysExCodec.slotToLabel(255)).toBe('64D'));
  it('labelToSlot: "1A" → 0', () => expect(SysExCodec.labelToSlot('1A')).toBe(0));
  it('labelToSlot: "64D" → 255', () => expect(SysExCodec.labelToSlot('64D')).toBe(255));
  it('round-trip: slotToLabel → labelToSlot', () => {
    for (let s = 0; s < 256; s++) {
      expect(SysExCodec.labelToSlot(SysExCodec.slotToLabel(s))).toBe(s);
    }
  });
});

describe('SysExCodec: buildReadRequest', () => {
  it('returns a 46-byte SysEx message with correct framing', () => {
    const req = SysExCodec.buildReadRequest(0);
    expect(req.length).toBe(46);
    expect(req[0]).toBe(0xF0);
    expect(req[8]).toBe(0x11);
    expect(req[9]).toBe(0x10);
    expect(req[45]).toBe(0xF7);
  });

  it('slot 0 matches capture exactly', () => {
    const req = SysExCodec.buildReadRequest(0);
    const expected = new Uint8Array([
      0xF0, 0x21, 0x25, 0x7E, 0x47, 0x50, 0x2D, 0x32, 0x11, 0x10,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x04, 0x00,
      0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x01, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0xF7,
    ]);
    expect(req).toEqual(expected);
  });

  it('slot 1: nibble-encoded at [25-26], [37-38], [41-42]', () => {
    const req = SysExCodec.buildReadRequest(1);
    expect(req[25]).toBe(0x00); expect(req[26]).toBe(0x01);
    expect(req[37]).toBe(0x00); expect(req[38]).toBe(0x01);
    expect(req[41]).toBe(0x00); expect(req[42]).toBe(0x01);
  });

  it('slot 254 (0xFE): nibble-encoded as 0F 0E', () => {
    const req = SysExCodec.buildReadRequest(254);
    expect(req[25]).toBe(0x0F); expect(req[26]).toBe(0x0E);
    expect(req[37]).toBe(0x0F); expect(req[38]).toBe(0x0E);
    expect(req[41]).toBe(0x0F); expect(req[42]).toBe(0x0E);
  });

  it('slot 255 (0xFF): nibble-encoded as 0F 0F', () => {
    const req = SysExCodec.buildReadRequest(255);
    expect(req[25]).toBe(0x0F); expect(req[26]).toBe(0x0F);
    expect(req[37]).toBe(0x0F); expect(req[38]).toBe(0x0F);
    expect(req[41]).toBe(0x0F); expect(req[42]).toBe(0x0F);
  });

  it('constants are correct for all slots', () => {
    for (const slot of [0, 1, 127, 254, 255]) {
      const req = SysExCodec.buildReadRequest(slot);
      for (let i = 10; i <= 17; i++) expect(req[i]).toBe(0x00);
      expect(req[18]).toBe(0x04);
      expect(req[22]).toBe(0x01); expect(req[23]).toBe(0x00);
      expect(req[30]).toBe(0x01); expect(req[31]).toBe(0x00);
      expect(req[34]).toBe(0x04);
    }
  });
});

describe('SysExCodec: parseReadChunks', () => {
  it('parses preset name correctly', () => {
    const decoded = buildDecodedPreset('Pretender', 9);
    const chunks = buildFakeChunks(decoded, 9);
    const preset = SysExCodec.parseReadChunks(chunks);
    expect(preset.patchName).toBe('Pretender');
  });

  it('parses 11 effect blocks', () => {
    const decoded = buildDecodedPreset('Test', 0);
    const chunks = buildFakeChunks(decoded, 0);
    const preset = SysExCodec.parseReadChunks(chunks);
    expect(preset.effects).toHaveLength(11);
  });

  it('effect blocks have correct slot indices', () => {
    const decoded = buildDecodedPreset('Test', 0);
    const chunks = buildFakeChunks(decoded, 0);
    const preset = SysExCodec.parseReadChunks(chunks);
    preset.effects.forEach((e, i) => expect(e.slotIndex).toBe(i));
  });

  it('effect blocks have correct enabled flag', () => {
    const decoded = buildDecodedPreset('Test', 0);
    const chunks = buildFakeChunks(decoded, 0);
    const preset = SysExCodec.parseReadChunks(chunks);
    preset.effects.forEach(e => expect(e.enabled).toBe(true));
  });

  it('parses float32 params correctly', () => {
    const decoded = buildDecodedPreset('Test', 0);
    const chunks = buildFakeChunks(decoded, 0);
    const preset = SysExCodec.parseReadChunks(chunks);
    expect(preset.effects[3].params[0]).toBeCloseTo(30.0, 4);
  });

  it('sets checksum to 0 (SysEx has no checksum)', () => {
    const decoded = buildDecodedPreset('Test', 0);
    const chunks = buildFakeChunks(decoded, 0);
    const preset = SysExCodec.parseReadChunks(chunks);
    expect(preset.checksum).toBe(0);
  });

  it('sorts chunks by offset (handles out-of-order delivery)', () => {
    const decoded = buildDecodedPreset('Pretender', 9);
    const chunks = buildFakeChunks(decoded, 9);
    const shuffled = [chunks[6], chunks[2], chunks[0], chunks[4], chunks[1], chunks[5], chunks[3]];
    const preset = SysExCodec.parseReadChunks(shuffled);
    expect(preset.patchName).toBe('Pretender');
  });

  it('applies the routing order bytes (reordered chain)', () => {
    const decoded = buildDecodedPreset('Reordered', 0);
    // DST (2) moved in front of PRE (0): routing = playback order of slotIndexes
    const routing = [2, 0, 1, 3, 4, 5, 6, 7, 8, 9, 10];
    routing.forEach((si, i) => { decoded[108 + i] = si; });
    const preset = SysExCodec.parseReadChunks(buildFakeChunks(decoded, 0));
    expect(preset.effects.map((e) => e.slotIndex)).toEqual(routing);
    // block identity travels with the slot: block 2's effectId is at position 0
    expect(preset.effects[0].effectId).toBe(0x03000001 + 2);
  });

  it('recovers a valid permutation from corrupt routing bytes', () => {
    const decoded = buildDecodedPreset('Corrupt', 0);
    // duplicate 3 and out-of-range 0x7F: keep valid prefix order, append the rest
    const bytes = [3, 3, 0x7F, 1, 0, 2, 4, 5, 6, 7, 8];
    bytes.forEach((b, i) => { decoded[108 + i] = b; });
    const preset = SysExCodec.parseReadChunks(buildFakeChunks(decoded, 0));
    const order = preset.effects.map((e) => e.slotIndex);
    expect([...order].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(order.slice(0, 6)).toEqual([3, 1, 0, 2, 4, 5]);
  });
});

describe('SysExCodec: parsePresetName', () => {
  it('extracts name from first chunk (offset=0)', () => {
    const decoded = buildDecodedPreset('JCM 800', 0);
    const chunks = buildFakeChunks(decoded, 0);
    const firstChunk = chunks[0]; // offset=0
    expect(SysExCodec.parsePresetName(firstChunk)).toBe('JCM 800');
  });
});

// dumps/ is gitignored (real device exports, not committed), so this suite only
// runs on a machine that has them. Same convention as PRSTEncoder.test.ts.
const UPLOAD_FIXTURE = join(process.cwd(), 'dumps/prts/07-D Scotland Kiss.prst');
const HAS_UPLOAD_FIXTURE = existsSync(UPLOAD_FIXTURE);

describe.skipIf(!HAS_UPLOAD_FIXTURE)('SysExCodec: flash upload (buildUploadImage / buildUploadChunks)', () => {
  // Format ground truth: dumps/patch-upload.pcapng (official editor writing
  // a patch to slot 9). Fixture: a real device export (1224 bytes).
  // The read stays lazy: a skipped describe still evaluates its body at
  // collection time, so an unguarded readFileSync here would fail the file.
  const fileBytes = HAS_UPLOAD_FIXTURE
    ? new Uint8Array(readFileSync(UPLOAD_FIXTURE))
    : new Uint8Array();

  it('derives a 1184-byte image: 16-byte preamble + file[0x30 .. len-8]', () => {
    const image = SysExCodec.buildUploadImage(fileBytes);
    expect(image.length).toBe(1184);
    expect(Array.from(image.subarray(0, 16))).toEqual([
      0x00, 0x00, 0x04, 0x00, 0x01, 0x00, 0xff, 0x00,
      0x01, 0x00, 0x04, 0x00, 0xff, 0x00, 0xff, 0x00,
    ]);
    expect(Array.from(image.subarray(16, 20))).toEqual(
      Array.from(fileBytes.subarray(0x30, 0x34)),
    );
    expect(Array.from(image.subarray(21))).toEqual(
      Array.from(fileBytes.subarray(0x35, fileBytes.length - 8)),
    );
  });

  it('blanks the in-file slot-mirror byte to 0xFF (capture: FF even for slot 9)', () => {
    expect(fileBytes[0x34]).toBe(0x1b); // fixture is 07-D = slot 27
    const image = SysExCodec.buildUploadImage(fileBytes);
    expect(image[20]).toBe(0xff);
  });

  it('keeps the patch name at image offset 36 (capture-verified position)', () => {
    const image = SysExCodec.buildUploadImage(fileBytes);
    let name = '';
    for (let i = 36; image[i] !== 0; i++) name += String.fromCharCode(image[i]);
    expect(name).toBe('Scotland Kiss');
  });

  it('frames the image as 7 chunks with 183-byte strides and 7-bit offsets', () => {
    const image = SysExCodec.buildUploadImage(fileBytes);
    const chunks = SysExCodec.buildUploadChunks(image, 9);
    expect(chunks).toHaveLength(7);
    expect(chunks.map((chunk) => chunk.length)).toEqual([380, 380, 380, 380, 380, 380, 186]);
    const offsets = chunks.map((chunk) => chunk[12] * 128 + chunk[11]);
    expect(offsets).toEqual([0, 183, 366, 549, 732, 915, 1098]);
    for (const chunk of chunks) {
      expect(Array.from(chunk.subarray(0, 10))).toEqual([
        0xF0, 0x21, 0x25, 0x7E, 0x47, 0x50, 0x2D, 0x32, 0x12, 0x20,
      ]);
      expect(chunk[10]).toBe(9); // target slot
      expect(chunk[chunk.length - 1]).toBe(0xF7);
      const payload = Array.from(chunk.subarray(13, chunk.length - 1));
      expect(payload.every((nibble) => nibble < 0x10)).toBe(true);
    }
  });

  it('round-trips: reassembled chunk nibbles decode back to the image', () => {
    const image = SysExCodec.buildUploadImage(fileBytes);
    const chunks = SysExCodec.buildUploadChunks(image, 0);
    const nibbles: number[] = [];
    for (const chunk of chunks) {
      for (let i = 13; i < chunk.length - 1; i++) nibbles.push(chunk[i]);
    }
    const decoded = SysExCodec.nibbleDecode(new Uint8Array(nibbles));
    expect(Array.from(decoded)).toEqual(Array.from(image));
  });
});

describe('SysExCodec: handshake builders', () => {
  it('buildIdentityQuery returns exact 22-byte message', () => {
    const msg = SysExCodec.buildIdentityQuery();
    expect(msg).toEqual(new Uint8Array([
      0xF0, 0x21, 0x25, 0x7E, 0x47, 0x50, 0x2D, 0x32,
      0x11, 0x04,
      0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00,
      0xF7,
    ]));
  });

  it('buildEnterEditorMode returns exact 14-byte message', () => {
    const msg = SysExCodec.buildEnterEditorMode();
    expect(msg).toEqual(new Uint8Array([
      0xF0, 0x21, 0x25, 0x7E, 0x47, 0x50, 0x2D, 0x32,
      0x11, 0x12,
      0x00, 0x00, 0x00,
      0xF7,
    ]));
  });

  it('buildStateDumpRequest returns exact 22-byte message', () => {
    const msg = SysExCodec.buildStateDumpRequest();
    expect(msg).toEqual(new Uint8Array([
      0xF0, 0x21, 0x25, 0x7E, 0x47, 0x50, 0x2D, 0x32,
      0x11, 0x04,
      0x00, 0x00, 0x00, 0x00, 0x06, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00,
      0xF7,
    ]));
  });

  it('buildVersionCheck returns exact 34-byte message', () => {
    const msg = SysExCodec.buildVersionCheck();
    expect(msg).toEqual(new Uint8Array([
      0xF0, 0x21, 0x25, 0x7E, 0x47, 0x50, 0x2D, 0x32,
      0x11, 0x0A,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x06, 0x00, 0x00,
      0x0D, 0x04, 0x0F, 0x07, 0x08, 0x0B, 0x00, 0x00, 0x0C, 0x0B, 0x04, 0x05,
      0xF7,
    ]));
  });

  it('buildAssignmentQuery section 0 page 0 block 0 is 70 bytes', () => {
    const msg = SysExCodec.buildAssignmentQuery(0, 0, 0);
    expect(msg.length).toBe(70);
    expect(msg[0]).toBe(0xF0);
    expect(msg[8]).toBe(0x11);
    expect(msg[9]).toBe(0x1C);
    expect(msg[10]).toBe(0x00);
    expect(msg[14]).toBe(0x09);
    expect(msg[22]).toBe(0x00);
    expect(msg[69]).toBe(0xF7);
  });

  it('buildAssignmentQuery increments block byte', () => {
    const msg5 = SysExCodec.buildAssignmentQuery(0, 0, 5);
    expect(msg5[22]).toBe(0x05);
    const msgF = SysExCodec.buildAssignmentQuery(0, 0, 15);
    expect(msgF[22]).toBe(0x0F);
  });

  it('buildAssignmentQuery page 1 sets page byte at [21]', () => {
    const msg = SysExCodec.buildAssignmentQuery(0, 1, 0);
    expect(msg[21]).toBe(0x01);
  });

  it('buildAssignmentQuery section 1 uses different header', () => {
    const msg = SysExCodec.buildAssignmentQuery(1, 0, 0);
    expect(msg[13]).toBe(0x01);
    expect(msg[14]).toBe(0x02);
  });
});

describe('SysExCodec: handshake parsers', () => {
  it('parseIdentityResponse extracts device info from capture', () => {
    const msg = new Uint8Array([
      0xF0, 0x21, 0x25, 0x7E, 0x47, 0x50, 0x2D, 0x32,
      0x12, 0x08,
      0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x00, 0x00,
      0x04, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00,
      0x02, 0x00, 0x00,
      0xF7,
    ]);
    const info = SysExCodec.parseIdentityResponse(msg);
    expect(info.deviceType).toBe(0x04);
    // Identity response bytes [22]/[26] are NOT firmware version (always 1.2 regardless of FW)
    expect(info.firmwareValues).toEqual([]);
  });

  it('parseVersionResponse: all-zero nibble data → accepted', () => {
    const msg = new Uint8Array([
      0xF0, 0x21, 0x25, 0x7E, 0x47, 0x50, 0x2D, 0x32,
      0x12, 0x0A,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x06, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0xF7,
    ]);
    expect(SysExCodec.parseVersionResponse(msg)).toEqual({ accepted: true });
  });

  it('parseVersionResponse: non-zero nibble data → still accepted (any response = compatible)', () => {
    const msg = new Uint8Array([
      0xF0, 0x21, 0x25, 0x7E, 0x47, 0x50, 0x2D, 0x32,
      0x12, 0x0A,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x06, 0x00, 0x00,
      0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0xF7,
    ]);
    expect(SysExCodec.parseVersionResponse(msg)).toEqual({ accepted: true });
  });

  it('parseAssignmentResponse extracts cab name from capture block 0', () => {
    // Exact bytes from capture response (D→H sub=0x1C, block 0)
    const msg = new Uint8Array([
      0xF0, 0x21, 0x25, 0x7E, 0x47, 0x50, 0x2D, 0x32, 0x12, 0x1C,
      0x00, 0x00, 0x00, 0x00, 0x09, 0x01, 0x00, 0x01, 0x08,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x05, 0x09, 0x04, 0x01, 0x02, 0x00,
      0x04, 0x08, 0x05, 0x07, 0x04, 0x01,
      0x05, 0x04, 0x02, 0x00,
      0x03, 0x04, 0x03, 0x01, 0x03, 0x02, 0x02, 0x00,
      0x04, 0x06, 0x04, 0x0E, 0x03, 0x05,
      0x00, 0x00,
      0xF7,
    ]);
    const entry = SysExCodec.parseAssignmentResponse(msg, 0, 0);
    expect(entry.section).toBe(0);
    expect(entry.page).toBe(0);
    expect(entry.block).toBe(0);
    expect(entry.name).toBe('YA HWAT 412 FN5');
  });
});

describe('SysExCodec: parseStateDump', () => {
  it('extracts slot from decoded[8:10] LE16 (verified via captures)', () => {
    // Slot 13 = Bank 04-B. decoded[8]=0x0D, decoded[9]=0x00.
    // Nibble encoding: each byte → 2 nibbles (high, low).
    // decoded[0:10] = [07 10 48 00 00 06 01 00 0D 00] → 20 nibbles
    const nibbles = [
      0x00,0x07, 0x01,0x00, 0x04,0x08, 0x00,0x00, 0x00,0x00,
      0x00,0x06, 0x00,0x01, 0x00,0x00, 0x00,0x0D, 0x00,0x00,
    ];
    const chunk = new Uint8Array([
      0xF0, 0x21, 0x25, 0x7E, 0x47, 0x50, 0x2D, 0x32, 0x12, 0x4E,
      0x06, 0x00, 0x00, // byte[10]=0x06, offset=0
      ...nibbles,
      0xF7,
    ]);
    const result = SysExCodec.parseStateDump([chunk]);
    expect(result.slot).toBe(13);
  });

  it('returns slot 0 for slot 01-A', () => {
    // decoded[0:10] = [07 10 48 00 00 06 01 00 00 00]
    const nibbles = [
      0x00,0x07, 0x01,0x00, 0x04,0x08, 0x00,0x00, 0x00,0x00,
      0x00,0x06, 0x00,0x01, 0x00,0x00, 0x00,0x00, 0x00,0x00,
    ];
    const chunk = new Uint8Array([
      0xF0, 0x21, 0x25, 0x7E, 0x47, 0x50, 0x2D, 0x32, 0x12, 0x4E,
      0x06, 0x00, 0x00,
      ...nibbles,
      0xF7,
    ]);
    const result = SysExCodec.parseStateDump([chunk]);
    expect(result.slot).toBe(0);
  });

  it('defaults to slot 0 when no chunks provided', () => {
    const result = SysExCodec.parseStateDump([]);
    expect(result.slot).toBe(0);
  });

  /** Wrap a decoded TLV stream in a single 0x12/0x4E chunk envelope. */
  function chunkOf(decoded: number[]): Uint8Array {
    const nibbles = SysExCodec.nibbleEncode(Uint8Array.from(decoded));
    return new Uint8Array([
      0xF0, 0x21, 0x25, 0x7E, 0x47, 0x50, 0x2D, 0x32, 0x12, 0x4E,
      0x06, 0x00, 0x00,
      ...nibbles,
      0xF7,
    ]);
  }

  it('walks the TLV table: slot, tuner A4, EQ floats, drum style names', () => {
    // Record layouts from dumps/connection-and-opening-gp200.pcapng
    // (docs/protocol-capture.md §4): [u16 type LE][u16 len LE][payload].
    const eqFloats = [1.0, 40.0, 0.71];
    const eqBytes = [...new Uint8Array(Float32Array.from(eqFloats).buffer)];
    const decoded = [
      // 0x1007 general (len 8 here; slot 13 at payload[4:6])
      0x07, 0x10, 0x08, 0x00, 0x00, 0x06, 0x01, 0x00, 0x0D, 0x00, 0x00, 0x00,
      // 0x1010 tuner: A4 = 440 Hz
      0x10, 0x10, 0x04, 0x00, 0xB8, 0x01, 0x01, 0x00,
      // 0x1004 global EQ: 3 float32 LE
      0x04, 0x10, 0x0C, 0x00, ...eqBytes,
      // 0x000a drum style-group: index 1, "Metal", stale-RAM tail bytes
      0x0A, 0x00, 0x14, 0x00,
      0x01, 0x00, 0x00, 0x00,
      0x4D, 0x65, 0x74, 0x61, 0x6C, 0x00,
      0xF0, 0x21, 0x25, 0x7E, 0x47, 0x50, 0x2D, 0x32, 0x11, 0x04,
    ];
    const result = SysExCodec.parseStateDump([chunkOf(decoded)]);
    expect(result.slot).toBe(13);
    expect(result.tunerA4Hz).toBe(440);
    expect(result.globalEqFloats).toHaveLength(3);
    expect(result.globalEqFloats?.[1]).toBeCloseTo(40.0);
    expect(result.drumStyleNames).toEqual([{ index: 1, name: 'Metal' }]);
    expect(result.records).toHaveLength(4);
  });

  it('stops the TLV walk at an implausible record without losing prior ones', () => {
    const decoded = [
      // valid tuner record
      0x10, 0x10, 0x04, 0x00, 0xB8, 0x01, 0x00, 0x00,
      // truncated record: claims 200-byte payload that isn't there
      0x07, 0x10, 0xC8, 0x00, 0x01, 0x02,
    ];
    const result = SysExCodec.parseStateDump([chunkOf(decoded)]);
    expect(result.tunerA4Hz).toBe(440);
    expect(result.records).toHaveLength(1);
  });

  it('rejects out-of-range tuner values and non-ASCII drum names', () => {
    const decoded = [
      // tuner record claiming 900 Hz (0x0384): implausible, dropped
      0x10, 0x10, 0x04, 0x00, 0x84, 0x03, 0x00, 0x00,
      // drum record whose name bytes are binary garbage: dropped
      0x0A, 0x00, 0x08, 0x00, 0x02, 0x00, 0x00, 0x00, 0x9F, 0x03, 0x01, 0x00,
    ];
    const result = SysExCodec.parseStateDump([chunkOf(decoded)]);
    expect(result.tunerA4Hz).toBeUndefined();
    expect(result.drumStyleNames).toBeUndefined();
    expect(result.records).toHaveLength(2);
  });
});

describe('SysExCodec: buildFrame (generic wire framer)', () => {
  it('frames CMD, 7-bit length, offset, nibbles, F7', () => {
    const payload = new Uint8Array([0x07, 0x20, 0x04, 0x00, 0x01, 0x00, 0x02, 0x00]);
    const msg = SysExCodec.buildFrame(0x12, payload);
    expect(msg.length).toBe(14 + 16);
    expect([...msg.slice(0, 13)]).toEqual([
      0xF0, 0x21, 0x25, 0x7E, 0x47, 0x50, 0x2D, 0x32, 0x12, 0x08, 0x00, 0x00, 0x00,
    ]);
    expect(msg[msg.length - 1]).toBe(0xF7);
    expect(SysExCodec.nibbleDecode(msg.slice(13, msg.length - 1))).toEqual(payload);
  });

  it('splits lengths over 127 across wire[9]/wire[10] (state-dump 846 = 0x4E/6)', () => {
    const msg = SysExCodec.buildFrame(0x12, new Uint8Array(846));
    expect(msg[9]).toBe(0x4E);
    expect(msg[10]).toBe(6);
  });

  it('reproduces buildAuthorName byte-for-byte from its decoded payload', () => {
    const author = SysExCodec.buildAuthorName('Someone');
    const decoded = SysExCodec.nibbleDecode(author.slice(13, author.length - 1));
    expect(SysExCodec.buildFrame(0x12, decoded)).toEqual(author);
  });
});

describe('SysExCodec: patch move frames (exe-derived, unverified)', () => {
  it('encodes TLV 0x2007 {from, to}', () => {
    const msg = SysExCodec.buildPatchMove(3, 260);
    const decoded = SysExCodec.nibbleDecode(msg.slice(13, msg.length - 1));
    expect([...decoded]).toEqual([0x07, 0x20, 0x04, 0x00, 0x03, 0x00, 0x04, 0x01]);
  });

  it('encodes the commit TLV 0x2008 {1, 0}', () => {
    const msg = SysExCodec.buildPatchMoveCommit();
    const decoded = SysExCodec.nibbleDecode(msg.slice(13, msg.length - 1));
    expect([...decoded]).toEqual([0x08, 0x20, 0x04, 0x00, 0x01, 0x00, 0x00, 0x00]);
  });
});

describe('SysExCodec: experimental single-field writes', () => {
  it('buildPatchName mirrors the author frame at field address 0x0B60', () => {
    const name = SysExCodec.buildPatchName('Same Text');
    const author = SysExCodec.buildAuthorName('Same Text');
    expect(name.length).toBe(78);
    const nameDecoded = SysExCodec.nibbleDecode(name.slice(13, 77));
    const authorDecoded = SysExCodec.nibbleDecode(author.slice(13, 77));
    expect(nameDecoded[14]).toBe(0x60);
    expect(authorDecoded[14]).toBe(0x70);
    nameDecoded[14] = 0x70;
    expect(nameDecoded).toEqual(authorDecoded);
  });

  it('buildIrRename is the confirmed 0x1009 query record with CMD 0x12 and a name', () => {
    const msg = SysExCodec.buildIrRename(2, 'My 4x12');
    expect(msg[8]).toBe(0x12);
    expect(msg[9]).toBe(28);
    const decoded = SysExCodec.nibbleDecode(msg.slice(13, msg.length - 1));
    expect([...decoded.slice(0, 8)]).toEqual([0x09, 0x10, 0x18, 0x00, 0x02, 0x00, 0x01, 0x00]);
    expect(String.fromCharCode(...decoded.slice(8, 15))).toBe('My 4x12');
    expect(decoded[15]).toBe(0);
  });
});

describe('SysExCodec: EXP Assignment', () => {
  it('buildExpNavigation produces 62-byte message matching Valeton format', () => {
    // VOL-Volume (block=10, param=0) on EXP1A: must match capture 204352/211645
    const msg = SysExCodec.buildExpNavigation(0, 0, 10, 0);
    expect(msg.length).toBe(62);
    expect(msg[8]).toBe(0x12); // CMD
    expect(msg[9]).toBe(0x18); // sub
    expect(msg[61]).toBe(0xF7);
    // Nibble-decoded byte[2] should be 0x04 (not 0x40; off-by-one analysis was wrong)
    const decoded2 = (msg[13 + 4] << 4) | msg[13 + 5];
    expect(decoded2).toBe(0x04);
    // decoded[13] should be blockIndex=10=0x0A (not 0xA0)
    const decoded13 = (msg[13 + 26] << 4) | msg[13 + 27];
    expect(decoded13).toBe(0x0A);
    // Verify key raw bytes match Valeton capture
    expect(msg[18]).toBe(0x04); // nibble for decoded[2] low nibble
    expect(msg[40]).toBe(0x0A); // nibble for decoded[13] low nibble
  });

  it('buildExpAssignment produces 54-byte message with float32 param', () => {
    // EXP 1 Mode A, Para 1, select param 1 (float=1.0)
    const msg = SysExCodec.buildExpAssignment(0, 0, 0, 1.0);
    expect(msg.length).toBe(54);
    expect(msg[8]).toBe(0x12); // CMD
    expect(msg[9]).toBe(0x14); // sub
    expect(msg[29]).toBe(0x00); // not effect change
    expect(msg[30]).toBe(0x0E); // type=EXP/QA
    expect(msg[38]).toBe(0);   // section=0 (param select)
    expect(msg[39]).toBe(0);   // page=0 (EXP1A)
    expect(msg[40]).toBe(0);   // item=0 (Para 1)
    expect(msg[53]).toBe(0xF7);
    // Nibble-decode the float32 at [41:53]
    const nibbles = msg.slice(41, 53);
    const decoded = new Uint8Array(6);
    for (let i = 0; i < 6; i++) decoded[i] = (nibbles[2*i] << 4) | nibbles[2*i+1];
    expect(decoded[0]).toBe(0x40); // marker
    expect(decoded[1]).toBe(0x0C); // marker
    // decoded[2:6] = float32 LE of 1.0 = 0x3F800000
    const view = new DataView(decoded.buffer);
    expect(view.getFloat32(2, true)).toBeCloseTo(1.0);
  });

  it('buildExpAssignment section=1 encodes max value as float', () => {
    // EXP 2, Para 2, set max=99
    const msg = SysExCodec.buildExpAssignment(1, 2, 1, 99.0);
    expect(msg[38]).toBe(1);   // section=1 (min/max)
    expect(msg[39]).toBe(2);   // page=2 (EXP2)
    expect(msg[40]).toBe(1);   // item=1 (Para 2)
    // Decode float
    const nibbles = msg.slice(41, 53);
    const decoded = new Uint8Array(6);
    for (let i = 0; i < 6; i++) decoded[i] = (nibbles[2*i] << 4) | nibbles[2*i+1];
    const view = new DataView(decoded.buffer);
    expect(view.getFloat32(2, true)).toBeCloseTo(99.0);
  });

  it('buildExpAssignment matches capture bytes for unassign', () => {
    // From capture 200517 pkt 55: sec=0, page=0, item=0, float=0.0
    const msg = SysExCodec.buildExpAssignment(0, 0, 0, 0.0);
    // raw[38:41] should be 00 00 00
    expect(msg[38]).toBe(0);
    expect(msg[39]).toBe(0);
    expect(msg[40]).toBe(0);
    // Nibble-decoded float should be 0.0
    const nibbles = msg.slice(41, 53);
    const decoded = new Uint8Array(6);
    for (let i = 0; i < 6; i++) decoded[i] = (nibbles[2*i] << 4) | nibbles[2*i+1];
    const view = new DataView(decoded.buffer);
    expect(view.getFloat32(2, true)).toBe(0.0);
  });
});

describe('SysExCodec: buildCtrlAssignment', () => {
  const hex = (bytes: Uint8Array) =>
    [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join(' ');

  // Verbatim host→device frames from dumps/ctrl-assignment/*.pcapng (2026-08-08,
  // fw 1.8.0), decoded with scripts/decode-sysex-capture.mjs. dumps/ is
  // gitignored, so the expected bytes are inlined rather than read back.
  const CAPTURES: {
    label: string; ctrlIndex: number; blockMask: number; state: number; expected: string;
  }[] = [
    {
      label: 'ctl-1-unassingn-assign-pre #1 — CTRL 1 cleared',
      ctrlIndex: 0, blockMask: 0x000, state: 1,
      expected: 'f0 21 25 7e 47 50 2d 32 12 14 00 00 00 00 00 00 00 00 04 00 00 00 00 00 00 00 00 00 00 00 0f 00 00 00 08 00 00 00 00 00 01 00 00 00 00 00 00 00 00 00 00 00 00 f7',
    },
    {
      label: 'ctl-1-unassingn-assign-pre #2 — CTRL 1 → PRE (bit 0)',
      ctrlIndex: 0, blockMask: 0x001, state: 1,
      expected: 'f0 21 25 7e 47 50 2d 32 12 14 00 00 00 00 00 00 00 00 04 00 00 00 00 00 00 00 00 00 00 00 0f 00 00 00 08 00 00 00 00 00 01 00 00 00 00 00 01 00 00 00 00 00 00 f7',
    },
    {
      label: 'ctl-1-assign-dist — CTRL 1 → DST (bit 2)',
      ctrlIndex: 0, blockMask: 0x004, state: 1,
      expected: 'f0 21 25 7e 47 50 2d 32 12 14 00 00 00 00 00 00 00 00 04 00 00 00 00 00 00 00 00 00 00 00 0f 00 00 00 08 00 00 00 00 00 01 00 00 00 00 00 04 00 00 00 00 00 00 f7',
    },
    {
      label: 'ctl-8-dist-unassign-assign #1 — CTRL 8 cleared',
      ctrlIndex: 7, blockMask: 0x000, state: 0,
      expected: 'f0 21 25 7e 47 50 2d 32 12 14 00 00 00 00 00 00 00 00 04 00 00 00 00 00 00 00 00 00 00 00 0f 00 00 00 08 00 00 00 07 00 00 00 00 00 00 00 00 00 00 00 00 00 00 f7',
    },
    {
      label: 'ctl-8-dist-unassign-assign #2 — CTRL 8 → DST (bit 2)',
      ctrlIndex: 7, blockMask: 0x004, state: 0,
      expected: 'f0 21 25 7e 47 50 2d 32 12 14 00 00 00 00 00 00 00 00 04 00 00 00 00 00 00 00 00 00 00 00 0f 00 00 00 08 00 00 00 07 00 00 00 00 00 00 00 04 00 00 00 00 00 00 f7',
    },
    {
      label: 'ctl-8-assign-vol — CTRL 8 → VOL (bit 10)',
      ctrlIndex: 7, blockMask: 0x400, state: 0,
      expected: 'f0 21 25 7e 47 50 2d 32 12 14 00 00 00 00 00 00 00 00 04 00 00 00 00 00 00 00 00 00 00 00 0f 00 00 00 08 00 00 00 07 00 00 00 00 00 00 00 00 00 04 00 00 00 00 f7',
    },
  ];

  for (const capture of CAPTURES) {
    it(`matches capture: ${capture.label}`, () => {
      const msg = SysExCodec.buildCtrlAssignment(
        capture.ctrlIndex, capture.blockMask, capture.state,
      );
      expect(hex(msg)).toBe(capture.expected);
    });
  }

  it('is a 54-byte 0x12/0x14 frame carrying the CTRL record type and size', () => {
    const msg = SysExCodec.buildCtrlAssignment(0, 0);
    expect(msg.length).toBe(54);
    expect(msg[8]).toBe(0x12);
    expect(msg[9]).toBe(0x14);
    expect(msg[30]).toBe(0x0F); // TYPE_CTRL — the EXP writer sends 0x0E here
    expect(msg[34]).toBe(0x08); // CTRL payload size
    expect(msg[53]).toBe(0xF7);
  });

  it('nibble-encodes each mask byte high-first across [45..48]', () => {
    // Each mask byte travels as (b >> 4, b & 0xF) — the encoding the official
    // editor uses (fs-1-mod-assign-unassign.pcapng, 2026-08-09). 0xABC
    // exercises every nibble slot: low byte 0xBC -> [45]=0xB, [46]=0xC;
    // high byte 0x0A -> [47]=0x0, [48]=0xA.
    const msg = SysExCodec.buildCtrlAssignment(3, 0xABC, 0);
    expect([msg[45], msg[46], msg[47], msg[48]]).toEqual([0x0B, 0x0C, 0x00, 0x0A]);
    expect(msg.every((byte, i) => i === 0 || i === 53 || byte <= 0x7F)).toBe(true);
  });

  it('puts MOD (bit 7) in the low byte high nibble [45], like the editor', () => {
    // Verbatim mask nibbles from fs-1-mod-assign-unassign.pcapng: the editor
    // assigned MOD on a CTRL 1 that already carried FX LOOP (mask 0x880,
    // frame bytes [45..48] = 08 00 00 08) then removed it (0x800 → 00 00 00 08).
    expect(SysExCodec.buildCtrlAssignment(0, 0x880, 0).slice(45, 49))
      .toEqual(new Uint8Array([0x08, 0x00, 0x00, 0x08]));
    expect(SysExCodec.buildCtrlAssignment(0, 0x800, 0).slice(45, 49))
      .toEqual(new Uint8Array([0x00, 0x00, 0x00, 0x08]));
  });

  it('splits bits 4-6 (NR/CAB/EQ) into the [45] high nibble', () => {
    expect(SysExCodec.buildCtrlAssignment(0, 0x010, 0).slice(45, 49))
      .toEqual(new Uint8Array([0x01, 0x00, 0x00, 0x00])); // NR
    expect(SysExCodec.buildCtrlAssignment(0, 0x020, 0).slice(45, 49))
      .toEqual(new Uint8Array([0x02, 0x00, 0x00, 0x00])); // CAB
    expect(SysExCodec.buildCtrlAssignment(0, 0x040, 0).slice(45, 49))
      .toEqual(new Uint8Array([0x04, 0x00, 0x00, 0x00])); // EQ
  });

  it('keeps bit 11 (FX LOOP) on the wire in confirmed byte [48]', () => {
    const msg = SysExCodec.buildCtrlAssignment(0, 0x800, 0);
    expect([msg[46], msg[47], msg[48], msg[49]]).toEqual([0x0, 0x0, 0x8, 0x0]);
  });

  it('defaults state to 0 when omitted', () => {
    const msg = SysExCodec.buildCtrlAssignment(7, 0x004);
    expect(msg[40]).toBe(0);
    expect(msg[38]).toBe(7);
  });
});

describe('SysExCodec: buildToggleEffect', () => {
  it('returns a 46-byte SysEx with CMD=0x12, sub=0x10', () => {
    const msg = SysExCodec.buildToggleEffect(0, true);
    expect(msg.length).toBe(46);
    expect(msg[0]).toBe(0xF0);
    expect(msg[8]).toBe(0x12);
    expect(msg[9]).toBe(0x10);
    expect(msg[45]).toBe(0xF7);
  });

  it('WAH OFF matches capture (gp200-capture-20260319-100548)', () => {
    const msg = SysExCodec.buildToggleEffect(1, false);
    expect(msg[38]).toBe(1);   // WAH block index
    expect(msg[40]).toBe(0);   // OFF
    // Verify full message against captured bytes
    const expected = new Uint8Array([
      0xF0, 0x21, 0x25, 0x7E, 0x47, 0x50, 0x2D, 0x32, 0x12, 0x10,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x04, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01,
      0x05, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00, 0x01, 0x00,
      0x00, 0x09, 0x0C, 0x00, 0x02, 0xF7,
    ]);
    expect(msg).toEqual(expected);
  });

  it('AMP ON matches capture (gp200-capture-20260319-101538)', () => {
    const msg = SysExCodec.buildToggleEffect(3, true);
    expect(msg[38]).toBe(3);   // AMP block index
    expect(msg[40]).toBe(1);   // ON
    const expected = new Uint8Array([
      0xF0, 0x21, 0x25, 0x7E, 0x47, 0x50, 0x2D, 0x32, 0x12, 0x10,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x04, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01,
      0x05, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00, 0x03, 0x00,
      0x01, 0x09, 0x0C, 0x00, 0x02, 0xF7,
    ]);
    expect(msg).toEqual(expected);
  });

  it('sets block index for all 11 blocks', () => {
    for (let b = 0; b <= 10; b++) {
      const msg = SysExCodec.buildToggleEffect(b, true);
      expect(msg[38]).toBe(b);
      expect(msg[40]).toBe(1);
    }
  });
});

describe('SysExCodec: buildParamChange', () => {
  it('returns a 62-byte SysEx with CMD=0x12, sub=0x18', () => {
    const msg = SysExCodec.buildParamChange(8, 0, 0x0B000004, 50.0);
    expect(msg.length).toBe(62);
    expect(msg[0]).toBe(0xF0);
    expect(msg[8]).toBe(0x12);
    expect(msg[9]).toBe(0x18);
    expect(msg[61]).toBe(0xF7);
  });

  it('nibble-decoded payload has correct block, param, effectId, value', () => {
    // DLY Ping Pong, Mix = 43.0
    const msg = SysExCodec.buildParamChange(8, 0, 0x0B000004, 43.0);
    const nibbles = msg.slice(13, 61);
    const decoded = SysExCodec.nibbleDecode(nibbles);
    expect(decoded.length).toBe(24);
    // Constants
    expect(decoded[2]).toBe(0x04);
    expect(decoded[8]).toBe(0x05);
    expect(decoded[10]).toBe(0x0C);
    // decoded[14:16] = logarithmic display-value field for value 43.0 (#80),
    // no longer a constant 0x6F marker.
    expect(decoded[14]).toBe(0x46);
    expect(decoded[15]).toBe(0x40);
    // Block + param
    expect(decoded[12]).toBe(8);   // DLY
    expect(decoded[13]).toBe(0);   // Mix
    // EffectId LE bytes
    expect(decoded[16]).toBe(0x04);  // variant low byte
    expect(decoded[17]).toBe(0x00);
    expect(decoded[18]).toBe(0x00);
    expect(decoded[19]).toBe(0x0B);  // module type
    // Float value
    const view = new DataView(decoded.buffer, decoded.byteOffset);
    expect(view.getFloat32(20, true)).toBeCloseTo(43.0, 4);
  });

  it('AMP Mess4 LD Gain=50 matches captured structure', () => {
    // capture 102857: Block=3, Param=0, effectId=0x07000055
    const msg = SysExCodec.buildParamChange(3, 0, 0x07000055, 50.0);
    const decoded = SysExCodec.nibbleDecode(msg.slice(13, 61));
    expect(decoded[12]).toBe(3);    // AMP
    expect(decoded[13]).toBe(0);    // Gain
    expect(decoded[16]).toBe(0x55); // variant
    expect(decoded[19]).toBe(0x07); // AMP module
    const view = new DataView(decoded.buffer, decoded.byteOffset);
    expect(view.getFloat32(20, true)).toBeCloseTo(50.0, 4);
  });

  it('nibble encoding round-trips correctly', () => {
    const msg = SysExCodec.buildParamChange(5, 3, 0x0A000010, 75.5);
    const nibbles = msg.slice(13, 61);
    const decoded = SysExCodec.nibbleDecode(nibbles);
    const reEncoded = SysExCodec.nibbleEncode(decoded);
    expect(reEncoded).toEqual(nibbles);
  });
});

describe('SysExCodec: buildReorderEffects', () => {
  it('returns a 78-byte SysEx with CMD=0x12, sub=0x20', () => {
    const msg = SysExCodec.buildReorderEffects([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 4, 4);
    expect(msg.length).toBe(78);
    expect(msg[0]).toBe(0xF0);
    expect(msg[8]).toBe(0x12);
    expect(msg[9]).toBe(0x20);
    expect(msg[77]).toBe(0xF7);
  });

  it('NR↔AMP swap matches capture (gp200-capture-20260319-101714)', () => {
    // Reorder 1: PRE, WAH, BOOST, NR(4), AMP(3), CAB, EQ, MOD, DLY, RVB, VOL
    // Capture shows decoded[14]=0x04, decoded[15]=0x04, so pass send=4, ret=4
    const msg = SysExCodec.buildReorderEffects([0, 1, 2, 4, 3, 5, 6, 7, 8, 9, 10], 4, 4);
    // Exact bytes from USB capture gp200-capture-20260319-101714 Pkt 457 (t=35.9s)
    const expected = new Uint8Array([
      0xF0, 0x21, 0x25, 0x7E, 0x47, 0x50, 0x2D, 0x32, 0x12, 0x20, // [0-9]   header
      0x00, 0x00, 0x00,                                              // [10-12] slot/offset
      0x00, 0x00, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00,              // [13-20] nibble data
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,              // [21-28]
      0x00, 0x08, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00,              // [29-36]
      0x00, 0x00, 0x00, 0x00, 0x00, 0x04, 0x00, 0x04,              // [37-44]
      0x00, 0x00, 0x00, 0x01, 0x00, 0x02, 0x00, 0x04,              // [45-52]
      0x00, 0x03, 0x00, 0x05, 0x00, 0x06, 0x00, 0x07,              // [53-60]
      0x00, 0x08, 0x00, 0x09, 0x00, 0x0A, 0x04, 0x04,              // [61-68]
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,              // [69-76]
      0xF7,                                                          // [77]
    ]);
    expect(msg).toEqual(expected);
  });

  it('DLY↔RVB swap produces correct routing at decoded[16:27]', () => {
    const msg = SysExCodec.buildReorderEffects([0, 1, 2, 4, 3, 5, 6, 7, 9, 8, 10], 4, 4);
    const decoded = SysExCodec.nibbleDecode(msg.slice(13, 77));
    expect(Array.from(decoded.slice(16, 27))).toEqual([0, 1, 2, 4, 3, 5, 6, 7, 9, 8, 10]);
    expect(decoded[27]).toBe(0x44); // terminator
  });

  it('default order has sequential indices', () => {
    const msg = SysExCodec.buildReorderEffects([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 4, 4);
    const decoded = SysExCodec.nibbleDecode(msg.slice(13, 77));
    expect(Array.from(decoded.slice(16, 27))).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});

describe('SysExCodec: buildReorderEffects with SEND/RETURN', () => {
  it('places send and ret at decoded[14] and [15]', () => {
    const order = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const msg = SysExCodec.buildReorderEffects(order, 5, 9);
    const nibble = msg.slice(13, msg.length - 1);
    const decoded = SysExCodec.nibbleDecode(nibble);
    expect(decoded[14]).toBe(5);
    expect(decoded[15]).toBe(9);
    for (let i = 0; i < 11; i++) expect(decoded[16 + i]).toBe(order[i]);
  });

  it('keeps the existing flag byte decoded[27]=0x44 for reorder', () => {
    const msg = SysExCodec.buildReorderEffects([0,1,2,3,4,5,6,7,8,9,10], 4, 4);
    const decoded = SysExCodec.nibbleDecode(msg.slice(13, msg.length - 1));
    expect(decoded[27]).toBe(0x44);
  });
});

describe('SysExCodec: buildAuthorName', () => {
  it('produces 78-byte SysEx with correct structure', () => {
    const msg = SysExCodec.buildAuthorName('Manuel');
    expect(msg.length).toBe(78);
    expect(msg[0]).toBe(0xF0);
    expect(msg[8]).toBe(0x12); // CMD
    expect(msg[9]).toBe(0x20); // sub
    expect(msg[77]).toBe(0xF7);
  });

  it('encodes author name at decoded[16]', () => {
    const msg = SysExCodec.buildAuthorName('Manuel');
    const decoded = SysExCodec.nibbleDecode(msg.slice(13, 77));
    expect(decoded[8]).toBe(0x09); // msg type: author
    expect(decoded[16]).toBe('M'.charCodeAt(0));
    expect(decoded[17]).toBe('a'.charCodeAt(0));
    expect(decoded[18]).toBe('n'.charCodeAt(0));
    expect(decoded[19]).toBe('u'.charCodeAt(0));
    expect(decoded[20]).toBe('e'.charCodeAt(0));
    expect(decoded[21]).toBe('l'.charCodeAt(0));
    expect(decoded[22]).toBe(0); // null terminated
  });

  it('truncates author to 16 chars', () => {
    const msg = SysExCodec.buildAuthorName('A'.repeat(20));
    const decoded = SysExCodec.nibbleDecode(msg.slice(13, 77));
    for (let i = 0; i < 16; i++) expect(decoded[16 + i]).toBe('A'.charCodeAt(0));
  });
});

describe('SysExCodec: buildStyleName', () => {
  it('produces 62-byte SysEx with correct structure', () => {
    const msg = SysExCodec.buildStyleName('Green Day');
    expect(msg.length).toBe(62);
    expect(msg[0]).toBe(0xF0);
    expect(msg[8]).toBe(0x12);
    expect(msg[9]).toBe(0x18);
    expect(msg[61]).toBe(0xF7);
  });

  it('encodes style name at decoded[8]', () => {
    const msg = SysExCodec.buildStyleName('Rock');
    const decoded = SysExCodec.nibbleDecode(msg.slice(13, 61));
    expect(decoded[0]).toBe(0x03); // style header
    expect(decoded[1]).toBe(0x20);
    expect(decoded[8]).toBe('R'.charCodeAt(0));
    expect(decoded[9]).toBe('o'.charCodeAt(0));
    expect(decoded[10]).toBe('c'.charCodeAt(0));
    expect(decoded[11]).toBe('k'.charCodeAt(0));
    expect(decoded[12]).toBe(0);
  });
});

describe('SysExCodec: buildNote', () => {
  it('produces 126-byte SysEx with correct structure', () => {
    const msg = SysExCodec.buildNote('TestNote');
    expect(msg.length).toBe(126);
    expect(msg[0]).toBe(0xF0);
    expect(msg[8]).toBe(0x12);
    expect(msg[9]).toBe(0x38);
    expect(msg[125]).toBe(0xF7);
  });

  it('encodes note text at decoded[16]', () => {
    const msg = SysExCodec.buildNote('TestNote');
    const decoded = SysExCodec.nibbleDecode(msg.slice(13, 125));
    expect(decoded[8]).toBe(0x0B); // msg type: note
    expect(decoded[16]).toBe('T'.charCodeAt(0));
    expect(decoded[17]).toBe('e'.charCodeAt(0));
    expect(decoded[18]).toBe('s'.charCodeAt(0));
    expect(decoded[19]).toBe('t'.charCodeAt(0));
    expect(decoded[20]).toBe('N'.charCodeAt(0));
    expect(decoded[21]).toBe('o'.charCodeAt(0));
    expect(decoded[22]).toBe('t'.charCodeAt(0));
    expect(decoded[23]).toBe('e'.charCodeAt(0));
    expect(decoded[24]).toBe(0);
  });
});

describe('SysExCodec: buildEffectChange', () => {
  it('produces 54-byte raw SysEx with correct envelope', () => {
    const msg = SysExCodec.buildEffectChange(0, 0x00000001); // COMP4
    expect(msg.length).toBe(54);
    expect(msg[0]).toBe(0xF0);
    expect(msg[8]).toBe(0x12); // CMD=SET
    expect(msg[9]).toBe(0x14); // sub=EFFECT_CHANGE
    expect(msg[53]).toBe(0xF7);
  });

  it('encodes block index at byte[38]', () => {
    const msg = SysExCodec.buildEffectChange(5, 0x0A000010); // CAB block
    expect(msg[38]).toBe(5);
  });

  it('encodes module type at byte[52]', () => {
    // DST module (0x03)
    expect(SysExCodec.buildEffectChange(0, 0x03000001)[52]).toBe(0x03);
    // AMP module (0x07)
    expect(SysExCodec.buildEffectChange(3, 0x07000055)[52]).toBe(0x07);
    // CAB module (0x0A)
    expect(SysExCodec.buildEffectChange(5, 0x0A000010)[52]).toBe(0x0A);
    // SnapTone (0x0F)
    expect(SysExCodec.buildEffectChange(3, 0x0F000000)[52]).toBe(0x0F);
  });

  it('encodes variant as nibble pair at bytes[45:46]', () => {
    // COMP4 = variant 1 → [45]=0x00, [46]=0x01
    const msg1 = SysExCodec.buildEffectChange(0, 0x00000001);
    expect(msg1[45]).toBe(0x00);
    expect(msg1[46]).toBe(0x01);

    // AC Boost = variant 0x0A → [45]=0x00, [46]=0x0A
    const msg2 = SysExCodec.buildEffectChange(0, 0x0000000A);
    expect(msg2[45]).toBe(0x00);
    expect(msg2[46]).toBe(0x0A);

    // Variant 0x7C (max known CAB) → [45]=0x07, [46]=0x0C
    const msg3 = SysExCodec.buildEffectChange(5, 0x0A00007C);
    expect(msg3[45]).toBe(0x07);
    expect(msg3[46]).toBe(0x0C);
  });

  it('uses bottom 8 bits of effectId as variant', () => {
    // Ensure consistent with response parsing: effectId = (module<<24) | variant
    const msg = SysExCodec.buildEffectChange(2, 0x04000003); // MOD Chorus
    const variant = (msg[45] << 4) | msg[46];
    expect(variant).toBe(3);
    expect(msg[52]).toBe(0x04); // MOD module
  });
});

describe('SysExCodec: global settings writes (0x12/0x08 family)', () => {
  // Expected frames are VERBATIM from the dumps/ captures (protocol doc §0.2).
  function hex(bytes: Uint8Array): string {
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(' ');
  }

  it('buildFsMode reproduces the fs-template-change capture frames', () => {
    expect(hex(SysExCodec.buildFsMode(2))).toBe(
      'f0 21 25 7e 47 50 2d 32 12 08 00 00 00 00 08 01 00 00 04 00 00 01 08 00 00 00 02 00 00 f7',
    );
    expect(SysExCodec.buildFsMode(0)[26]).toBe(0);
    expect(SysExCodec.buildFsMode(1)[26]).toBe(1);
  });

  it('buildAutoCabMatch reproduces the auto-cab-match capture frames', () => {
    expect(hex(SysExCodec.buildAutoCabMatch(true))).toBe(
      'f0 21 25 7e 47 50 2d 32 12 08 00 00 00 00 08 01 00 00 04 00 00 02 04 00 00 00 01 00 00 f7',
    );
    expect(SysExCodec.buildAutoCabMatch(false)[26]).toBe(0);
  });

  it('buildFsTarget reproduces the FS1 TAP sweep frame (action Bank = 0x11)', () => {
    expect(hex(SysExCodec.buildFsTarget(1, 'tap', 0x11))).toBe(
      'f0 21 25 7e 47 50 2d 32 12 08 00 00 00 00 0f 01 00 00 04 00 00 00 01 00 00 00 00 01 01 f7',
    );
  });

  it('buildFsTarget encodes the record index as (fs-1)*2 + hold', () => {
    // FS-Tap-None-Set-1-8 capture: FS8 tap → record 0x0e, value None
    expect(hex(SysExCodec.buildFsTarget(8, 'tap', 0x00))).toBe(
      'f0 21 25 7e 47 50 2d 32 12 08 00 00 00 00 0f 01 00 00 04 00 00 00 01 00 00 00 0e 00 00 f7',
    );
    // fs-1-hold-all-changes capture: FS1 hold → record 1, action Looper 0x05
    expect(hex(SysExCodec.buildFsTarget(1, 'hold', 0x05))).toBe(
      'f0 21 25 7e 47 50 2d 32 12 08 00 00 00 00 0f 01 00 00 04 00 00 00 01 00 00 00 01 00 05 f7',
    );
  });

  it('buildFsCombo reproduces the fs-combination-set-none capture frames', () => {
    expect(hex(SysExCodec.buildFsCombo(3, 0x00))).toBe(
      'f0 21 25 7e 47 50 2d 32 12 08 00 00 00 00 0f 01 00 00 04 00 00 00 01 00 00 01 03 00 00 f7',
    );
  });

  it('nibbles action ids above 0x0f across bytes [27],[28]', () => {
    const msg = SysExCodec.buildFsTarget(3, 'tap', 0x1a); // CTRL 8
    expect(msg[27]).toBe(0x01);
    expect(msg[28]).toBe(0x0a);
  });
});

describe('SysExCodec: buildPatchSetting', () => {
  it('produces 46-byte raw SysEx for volume', () => {
    const msg = SysExCodec.buildPatchSetting(0x00, 50); // VOL=50
    expect(msg.length).toBe(46);
    expect(msg[0]).toBe(0xF0);
    expect(msg[8]).toBe(0x12);
    expect(msg[9]).toBe(0x10);
    expect(msg[38]).toBe(0x00); // target=VOL
    expect(msg[45]).toBe(0xF7);
  });

  it('encodes value as nibble pair at bytes[41:42]', () => {
    const msg = SysExCodec.buildPatchSetting(0x00, 0x32); // VOL=50
    expect(msg[41]).toBe(0x03); // high nibble
    expect(msg[42]).toBe(0x02); // low nibble
  });

  it('sets PAN-left markers for value > 127', () => {
    const msg = SysExCodec.buildPatchSetting(0x06, 200); // PAN=200 (left)
    expect(msg[43]).toBe(0x0F);
    expect(msg[44]).toBe(0x0F);
  });

  it('handles tempo > 255', () => {
    const msg = SysExCodec.buildPatchSetting(0x01, 300); // Tempo=300 BPM
    const value = (msg[43] << 12) | (msg[44] << 8) | (msg[41] << 4) | msg[42];
    expect(value).toBe(300);
  });
});

describe('SysExCodec: author in read/write chunks', () => {
  it('parsePresetFromDecoded reads author from decoded[44:60]', () => {
    // Build a minimal decoded payload (912+ bytes)
    const decoded = new Uint8Array(920).fill(0);
    // Name at [28:44]
    'TestName'.split('').forEach((c, i) => { decoded[28 + i] = c.charCodeAt(0); });
    // Author at [44:60]
    'TestAuthor'.split('').forEach((c, i) => { decoded[44 + i] = c.charCodeAt(0); });
    // Effect blocks at [120:912], which need markers
    for (let b = 0; b < 11; b++) {
      const base = 120 + b * 72;
      decoded[base] = 0x14; decoded[base + 2] = 0x44;
      decoded[base + 4] = b;
    }
    const preset = SysExCodec.parsePresetFromDecoded(decoded);
    expect(preset.patchName).toBe('TestName');
    expect(preset.author).toBe('TestAuthor');
  });

  // Bounds-check regression tests. parsePresetFromDecoded must never throw on
  // truncated or empty device responses; it returns a valid preset with empty
  // fields and 11 disabled effect slots. These tests lock the behavior in so a
  // future refactor can't remove the length guards without failing CI.
  it('parsePresetFromDecoded handles empty buffer without throwing', () => {
    const preset = SysExCodec.parsePresetFromDecoded(new Uint8Array(0), 'Fallback');
    expect(preset.patchName).toBe('Fallback');
    expect(preset.author).toBeUndefined();
    expect(preset.effects).toHaveLength(11);
    expect(preset.effects.every((e) => e.enabled === false && e.effectId === 0)).toBe(true);
  });

  it('parsePresetFromDecoded handles buffer too short for name', () => {
    // 20 bytes, not enough for the name read at decoded[28..43]
    const preset = SysExCodec.parsePresetFromDecoded(new Uint8Array(20));
    expect(preset.patchName).toBe('');
    expect(preset.effects).toHaveLength(11);
  });

  it('parsePresetFromDecoded handles buffer with name but no author', () => {
    // 44 bytes, enough for name, not for author
    const decoded = new Uint8Array(44);
    'Nm'.split('').forEach((c, i) => { decoded[28 + i] = c.charCodeAt(0); });
    const preset = SysExCodec.parsePresetFromDecoded(decoded);
    expect(preset.patchName).toBe('Nm');
    expect(preset.author).toBeUndefined();
    expect(preset.effects.every((e) => e.effectId === 0)).toBe(true);
  });

  it('parsePresetFromDecoded handles partial effect blocks', () => {
    // 200 bytes, enough for name+author, but only ~1 partial effect block
    // Loop must not read DataView past the end
    const decoded = new Uint8Array(200);
    const preset = SysExCodec.parsePresetFromDecoded(decoded);
    expect(preset.effects).toHaveLength(11);
    // All effects should be safe defaults because base+72 > length for every b
    expect(preset.effects.every((e) => e.effectId === 0 && !e.enabled)).toBe(true);
  });

  it('parsePresetFromDecoded reads exactly 912 bytes (minimum full payload)', () => {
    // 912 bytes is the minimum for all 11 blocks: 120 + 11*72 = 912
    const decoded = new Uint8Array(912);
    for (let b = 0; b < 11; b++) {
      const base = 120 + b * 72;
      decoded[base + 4] = b;
      decoded[base + 5] = 1; // enabled
    }
    const preset = SysExCodec.parsePresetFromDecoded(decoded);
    expect(preset.effects).toHaveLength(11);
    expect(preset.effects.every((e) => e.enabled)).toBe(true);
  });

});

describe('SysExCodec: fxLoop parse', () => {
  it('reads SEND from decoded[106] and RETURN from decoded[107]', () => {
    const buf = buildDecodedPreset('Test', 0);
    buf[106] = 0x03;
    buf[107] = 0x09;
    const chunks = buildFakeChunks(buf, 0);
    const preset = SysExCodec.parseReadChunks(chunks);
    expect(preset.fxLoopSend).toBe(3);
    expect(preset.fxLoopReturn).toBe(9);
  });

  it('clamps out-of-range fxLoop values to default 4', () => {
    const buf = buildDecodedPreset('Test', 0);
    buf[106] = 0x00; // out of range
    buf[107] = 0xFF; // out of range
    const chunks = buildFakeChunks(buf, 0);
    const preset = SysExCodec.parseReadChunks(chunks);
    expect(preset.fxLoopSend).toBe(4);
    expect(preset.fxLoopReturn).toBe(4);
  });
});

describe('SysExCodec: buildFxLoopMove', () => {
  // Capture: scripts/gp200-capture-20260518-075745.pcap, host->dev pkt 43
  // Raw payload after F0..GP-2..CMD..SUB..3-byte pad (= msg.slice(13, -1)):
  // 64 nibble bytes that decode to:
  //   00 00 04 00 00 00 51 00 08 00 10 00 51 00 05 05 00 01 02 03 04 05 06 07 08 09 0a 08 00 00 00 00
  const CAPTURE_1_PAYLOAD = new Uint8Array([
    0x00,0x00,0x00,0x00,0x00,0x04,0x00,0x00,0x00,0x00,0x00,0x00,0x05,0x01,0x00,0x00,
    0x00,0x08,0x00,0x00,0x01,0x00,0x00,0x00,0x05,0x01,0x00,0x00,0x00,0x05,0x00,0x05,
    0x00,0x00,0x00,0x01,0x00,0x02,0x00,0x03,0x00,0x04,0x00,0x05,0x00,0x06,0x00,0x07,
    0x00,0x08,0x00,0x09,0x00,0x0a,0x00,0x08,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
  ]);

  it("matches capture pkt 43 byte-for-byte (SEND=5, RETURN=5, kind='send')", () => {
    const msg = SysExCodec.buildFxLoopMove(
      [0,1,2,3,4,5,6,7,8,9,10],
      5, 5,
      'send',
    );
    // Strip envelope (F0..CMD..SUB..3-byte pad → 13 bytes) and trailing F7
    const payload = msg.slice(13, msg.length - 1);
    expect(payload).toEqual(CAPTURE_1_PAYLOAD);
  });

  it("sets decoded[27]=0xBA when kind='return'", () => {
    const msg = SysExCodec.buildFxLoopMove(
      [0,1,2,3,4,5,6,7,8,9,10],
      1, 9,
      'return',
    );
    const decoded = SysExCodec.nibbleDecode(msg.slice(13, msg.length - 1));
    expect(decoded[27]).toBe(0xBA);
    expect(decoded[14]).toBe(1);
    expect(decoded[15]).toBe(9);
  });

  it('total SysEx length is 78 bytes (matches Reorder envelope)', () => {
    const msg = SysExCodec.buildFxLoopMove([0,1,2,3,4,5,6,7,8,9,10], 4, 4, 'send');
    expect(msg.length).toBe(78);
    expect(msg[0]).toBe(0xF0);
    expect(msg[77]).toBe(0xF7);
  });
});


/**
 * Param Change display-value field (decoded[14:16]): #80.
 *
 * Decoding the real Valeton knob-sweep capture (gp200-capture-20260412-143552.pcap,
 * 1086 param writes) showed decoded[14:16] is NOT a constant 0x6F "marker"; it is a
 * logarithmic display-value field that the device reads for the *first* parameter of a
 * block. The fit, verified across params 1/5/6 and value range 0..19929 (±1 LSB):
 *
 *   u16 = round(16367 + 16 * log2(value)) ; decoded[14]=u16&0xFF, decoded[15]=u16>>8
 *   value <= 0  ->  u16 = 0
 *
 * Hardcoding 0x6F (~value 256 on this scale, which the device remaps toward 0) is why
 * param 0 of every effect landed at 0 while params 1-14 (read from float32 at [20:24])
 * were correct.
 */
function decodeParamMessage(msg: Uint8Array): Uint8Array {
  // header is 13 bytes, trailing 0xF7; the rest is nibble-encoded payload
  return SysExCodec.nibbleDecode(msg.slice(13, msg.length - 1));
}

describe('SysExCodec: param-change display-value field (#80)', () => {
  it('encodeDisplayValue matches captured Valeton values', () => {
    expect(Array.from(SysExCodec.encodeDisplayValue(0))).toEqual([0x00, 0x00]);
    expect(Array.from(SysExCodec.encodeDisplayValue(27))).toEqual([0x3b, 0x40]);
    expect(Array.from(SysExCodec.encodeDisplayValue(100))).toEqual([0x59, 0x40]);
    expect(Array.from(SysExCodec.encodeDisplayValue(56))).toEqual([0x4c, 0x40]);
  });

  it('encodeDisplayValue falls back to 0x0000 for non-positive values', () => {
    expect(Array.from(SysExCodec.encodeDisplayValue(-3))).toEqual([0x00, 0x00]);
    expect(Array.from(SysExCodec.encodeDisplayValue(0))).toEqual([0x00, 0x00]);
  });

  it('buildParamChange writes the display-value field at decoded[14:16], not a 0x6F marker', () => {
    const msg = SysExCodec.buildParamChange(0, 0, 0x00000003, 27);
    const dec = decodeParamMessage(msg);
    expect(dec[13]).toBe(0);         // param index preserved
    expect(dec[14]).toBe(0x3b);      // display-value low byte (was hardcoded 0x6F)
    expect(dec[15]).toBe(0x40);      // display-value high byte (was 0x00)
    expect(new DataView(dec.buffer).getFloat32(20, true)).toBe(27); // float32 still set
  });
});

describe('SysExCodec: buildNameReadRequest', () => {
  it('is identical to buildReadRequest except sub=0x20', () => {
    const full = SysExCodec.buildReadRequest(0x3E);
    const nameOnly = SysExCodec.buildNameReadRequest(0x3E);
    expect(nameOnly.length).toBe(full.length);
    expect(nameOnly[8]).toBe(0x11);
    expect(nameOnly[9]).toBe(0x20);
    for (let i = 0; i < full.length; i++) {
      if (i === 9) continue;
      expect(nameOnly[i]).toBe(full[i]);
    }
    expect(nameOnly[nameOnly.length - 1]).toBe(0xF7);
  });

  it('nibble-encodes the slot at [25-26], [37-38], [41-42]', () => {
    const msg = SysExCodec.buildNameReadRequest(0xFE);
    for (const off of [25, 37, 41]) {
      expect(msg[off]).toBe(0x0F);
      expect(msg[off + 1]).toBe(0x0E);
    }
  });
});

describe('SysExCodec: control records in device dumps', () => {
  it('attaches CTRL/EXP assignments when the dump carries tail records', () => {
    const decoded = buildDecodedPreset('CtrlPreset', 9);
    // Tail records at dump offset 0x388 (file 0x3B0 − 0x28). A 1176-byte
    // dump fits all records but not the 6-byte footer, so mirror that.
    const ctrl = Array.from({ length: 8 }, (_, ctrlIndex) => ({ ctrlIndex, blockMask: 0 }));
    ctrl[4] = { ctrlIndex: 4, blockMask: 0x83 };
    const tail = buildDefaultTail(undefined, ctrl);
    decoded.set(tail.subarray(0, 1176 - 0x388), 0x388);
    const preset = SysExCodec.parsePresetFromDecoded(decoded);
    expect(preset.ctrlAssignments).toBeDefined();
    expect(preset.ctrlAssignments![4].blockMask).toBe(0x83);
    expect(preset.expAssignments![0].blockIndex).toBe(10);
  });

  it('leaves assignments absent for a dump without tail records', () => {
    const decoded = buildDecodedPreset('NoCtrl', 3);
    const preset = SysExCodec.parsePresetFromDecoded(decoded);
    expect(preset.ctrlAssignments).toBeUndefined();
    expect(preset.expAssignments).toBeUndefined();
  });

  it('survives a full chunked read round-trip', () => {
    const decoded = buildDecodedPreset('Chunky', 12);
    const ctrl = Array.from({ length: 8 }, (_, ctrlIndex) => ({ ctrlIndex, blockMask: 0 }));
    ctrl[0] = { ctrlIndex: 0, blockMask: 0x7FF };
    const tail = buildDefaultTail(undefined, ctrl);
    decoded.set(tail.subarray(0, 1176 - 0x388), 0x388);
    const preset = SysExCodec.parseReadChunks(buildFakeChunks(decoded, 12));
    expect(preset.ctrlAssignments![0].blockMask).toBe(0x7FF);
  });
});
