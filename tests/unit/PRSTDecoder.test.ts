import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { PRSTDecoder, PRST_MAGIC } from '@/core/PRSTDecoder';

/** Builds a minimal valid test buffer matching the real .prst format */
function buildTestBuffer(): Uint8Array {
  const buf = new Uint8Array(1224).fill(0);
  // Magic "TSRP" at 0x00
  buf[0x00] = 0x54; buf[0x01] = 0x53; buf[0x02] = 0x52; buf[0x03] = 0x50;
  // Version at 0x15
  buf[0x15] = 0x01;
  // Patch name at 0x44
  'TestPatch'.split('').forEach((c, i) => { buf[0x44 + i] = c.charCodeAt(0); });
  // 11 effect blocks: marker 14 00 44 00 + slot index + bypass
  for (let slot = 0; slot < 11; slot++) {
    const base = 0xa0 + slot * 0x48;
    buf[base + 0] = 0x14; buf[base + 1] = 0x00; buf[base + 2] = 0x44; buf[base + 3] = 0x00;
    buf[base + 4] = slot;  // slot index
    buf[base + 5] = 0x00;  // bypassed
  }
  return buf;
}

/** Builds a test buffer with explicit routing-order bytes at 0x94..0x9E */
function buildTestBufferWithRouting(routing: number[]): Uint8Array {
  const buf = buildTestBuffer();
  for (let i = 0; i < 11; i++) buf[0x94 + i] = routing[i] ?? 0;
  return buf;
}

/** Builds a buffer with known float32 param values at slot 0 */
function buildTestBufferWithParams(): Uint8Array {
  const buf = buildTestBuffer();
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  // Write float32 LE values into slot 0 params (offset 0xa0 + 0x0c = 0xac)
  const base = 0xa0 + 0x0c;
  view.setFloat32(base + 0, 50.0, true);
  view.setFloat32(base + 4, 25.5, true);
  view.setFloat32(base + 8, 100.0, true);
  return buf;
}

describe('PRSTDecoder', () => {
  it('PRST_MAGIC ist "TSRP"', () => {
    expect(PRST_MAGIC).toBe('TSRP');
  });

  it('erkennt den Magic-Header', () => {
    const buf = buildTestBuffer();
    const decoder = new PRSTDecoder(buf);
    expect(decoder.hasMagic()).toBe(true);
  });

  it('hasMagic() gibt false zurueck bei leerem Buffer', () => {
    const empty = new Uint8Array(1224).fill(0);
    const decoder = new PRSTDecoder(empty);
    expect(decoder.hasMagic()).toBe(false);
  });

  it('liest den Patch-Namen', () => {
    const buf = buildTestBuffer();
    const decoder = new PRSTDecoder(buf);
    expect(decoder.decode().patchName).toBe('TestPatch');
  });

  it('reads author from offset 0x54', () => {
    const buf = buildTestBuffer();
    'TestAuthor'.split('').forEach((c, i) => { buf[0x54 + i] = c.charCodeAt(0); });
    const decoder = new PRSTDecoder(buf);
    const preset = decoder.decode();
    expect(preset.author).toBe('TestAuthor');
  });

  it('returns undefined author when empty', () => {
    const buf = buildTestBuffer();
    const decoder = new PRSTDecoder(buf);
    const preset = decoder.decode();
    expect(preset.author).toBeUndefined();
  });

  it('wirft bei ungueltigem Magic', () => {
    const bad = new Uint8Array(1224).fill(0);
    const decoder = new PRSTDecoder(bad);
    expect(() => decoder.decode()).toThrow('magic header not found');
  });

  it('wirft bei falscher Dateigroesse', () => {
    const tooSmall = new Uint8Array(100).fill(0);
    tooSmall[0] = 0x54; tooSmall[1] = 0x53; tooSmall[2] = 0x52; tooSmall[3] = 0x50;
    const decoder = new PRSTDecoder(tooSmall);
    expect(() => decoder.decode()).toThrow('expected 1224 or 1176 bytes');
  });

  it('akzeptiert 1176 Bytes (Factory Preset)', () => {
    const factory = new Uint8Array(1176).fill(0);
    factory[0] = 0x54; factory[1] = 0x53; factory[2] = 0x52; factory[3] = 0x50;
    factory[0x15] = 0x01;
    for (let slot = 0; slot < 11; slot++) {
      const base = 0xa0 + slot * 0x48;
      factory[base] = 0x14; factory[base + 2] = 0x44;
      factory[base + 4] = slot;
    }
    const decoder = new PRSTDecoder(factory);
    // Should not throw on size (might throw on checksum range if out of bounds)
    expect(decoder.hasMagic()).toBe(true);
  });

  it('dekodiert 11 Effect-Slots mit 15 float32 params', () => {
    const buf = buildTestBuffer();
    const decoder = new PRSTDecoder(buf);
    const preset = decoder.decode();
    expect(preset.effects).toHaveLength(11);
    preset.effects.forEach((e, i) => {
      expect(e.slotIndex).toBe(i);
      expect(e.enabled).toBe(false);
      expect(e.params).toHaveLength(15);
    });
  });

  it('reads float32 param values correctly', () => {
    const buf = buildTestBufferWithParams();
    const decoder = new PRSTDecoder(buf);
    const preset = decoder.decode();
    const params = preset.effects[0].params;
    expect(params[0]).toBeCloseTo(50.0, 5);
    expect(params[1]).toBeCloseTo(25.5, 5);
    expect(params[2]).toBeCloseTo(100.0, 5);
    // Remaining params should be 0
    for (let i = 3; i < 15; i++) {
      expect(params[i]).toBe(0);
    }
  });

  it('reads fxLoopSend / fxLoopReturn from offset 0x92 / 0x93', () => {
    const buf = buildTestBuffer();
    buf[0x92] = 0x03;
    buf[0x93] = 0x07;
    const decoded = new PRSTDecoder(buf).decode();
    expect(decoded.fxLoopSend).toBe(3);
    expect(decoded.fxLoopReturn).toBe(7);
  });

  it('falls back to default 4 when fxLoop bytes are out of range', () => {
    const buf = buildTestBuffer();
    buf[0x92] = 0x00; // out of range
    buf[0x93] = 0x0F; // out of range
    const decoded = new PRSTDecoder(buf).decode();
    expect(decoded.fxLoopSend).toBe(4);
    expect(decoded.fxLoopReturn).toBe(4);
  });

  it('keeps a full valid routing permutation intact', () => {
    const routing = [10, 1, 4, 2, 3, 5, 0, 6, 7, 8, 9];
    const decoded = new PRSTDecoder(buildTestBufferWithRouting(routing)).decode();
    expect(decoded.effects.map((e) => e.slotIndex)).toEqual(routing);
  });

  it('recovers a partial routing order when one byte is corrupt, instead of collapsing to default order (#90)', () => {
    // A valid reorder [3,1,4,0,2,5,6,7,8,9,10] but position 0 is corrupted to 0xFF.
    // The old all-or-nothing check discarded the WHOLE reorder on a single bad
    // byte and fell back to default order: the #90 symptom for atypical files.
    const routing = [0xff, 1, 4, 0, 2, 5, 6, 7, 8, 9, 10];
    const decoded = new PRSTDecoder(buildTestBufferWithRouting(routing)).decode();
    // Valid entries kept in file order; the one omitted slot (3) appended last.
    // No block dropped or duplicated: a full 0..10 permutation is guaranteed.
    expect(decoded.effects.map((e) => e.slotIndex)).toEqual([1, 4, 0, 2, 5, 6, 7, 8, 9, 10, 3]);
  });

  it('recovers partial routing that has a duplicate byte', () => {
    // Position 10 duplicates slot 9; slot 10 is therefore missing and appended.
    const routing = [1, 4, 0, 2, 3, 5, 6, 7, 8, 9, 9];
    const decoded = new PRSTDecoder(buildTestBufferWithRouting(routing)).decode();
    expect(decoded.effects.map((e) => e.slotIndex)).toEqual([1, 4, 0, 2, 3, 5, 6, 7, 8, 9, 10]);
  });

  it('falls back to default order when the routing region is entirely invalid', () => {
    const routing = new Array(11).fill(0xff);
    const decoded = new PRSTDecoder(buildTestBufferWithRouting(routing)).decode();
    expect(decoded.effects.map((e) => e.slotIndex)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});

describe('PRSTDecoder mit echten .prst Dateien', () => {
  const fixtures = [
    { file: 'planung/36-C CHUGG.prst',          name: 'CHUGG' },
    { file: 'planung/57-A Stone in Love.prst',   name: 'Stone in Love' },
    { file: 'planung/ZZ-WokeUp.prst',            name: 'ZZ-WokeUp' },
  ];

  for (const { file, name } of fixtures) {
    const filePath = join(process.cwd(), file);
    it.skipIf(!existsSync(filePath))(`dekodiert "${name}" ohne Fehler`, () => {
      const data = new Uint8Array(readFileSync(filePath));
      const decoder = new PRSTDecoder(data);
      expect(decoder.hasMagic()).toBe(true);
      const preset = decoder.decode();
      expect(preset.patchName).toBe(name);
      expect(preset.effects).toHaveLength(11);
      preset.effects.forEach((e) => {
        expect(e.params).toHaveLength(15);
      });
    });
  }

  const deviceExport = join(process.cwd(), 'dumps/prts/01-A Start Pedal.prst');
  it.skipIf(!existsSync(deviceExport))('decodes a device export without an author', () => {
    const data = new Uint8Array(readFileSync(deviceExport));
    const preset = new PRSTDecoder(data).decode();
    expect(preset.patchName).toBe('Start Pedal');
    expect(preset.author).toBeUndefined();
  });
});

describe('PRSTDecoder: controller/EXP assignment records', () => {
  const fixturePath = join(process.cwd(), 'dumps/prts/01-A Start Pedal.prst');

  it.skipIf(!existsSync(fixturePath))('decodes CTRL footswitch masks from a real file', () => {
    const data = new Uint8Array(readFileSync(fixturePath));
    const preset = new PRSTDecoder(data).decode();
    expect(preset.ctrlAssignments).toBeDefined();
    const masks = preset.ctrlAssignments!.map((assignment) => assignment.blockMask);
    expect(masks).toEqual([0x001, 0x040, 0x004, 0x080, 0x100, 0x200, 0x000, 0x800]);
  });

  it.skipIf(!existsSync(fixturePath))('decodes EXP assignments from a real file', () => {
    const data = new Uint8Array(readFileSync(fixturePath));
    const preset = new PRSTDecoder(data).decode();
    expect(preset.expAssignments).toHaveLength(9);
    expect(preset.expAssignments![0]).toEqual(
      { page: 0, item: 0, blockIndex: 10, paramIndex: 0, max: 100, min: 0 },
    );
  });

  it('leaves assignment fields absent when the tail is unrecognized', () => {
    const buf = buildTestBuffer(); // tail is all zeros, not a record stream
    const preset = new PRSTDecoder(buf).decode();
    expect(preset.ctrlAssignments).toBeUndefined();
    expect(preset.expAssignments).toBeUndefined();
  });
});

describe('PRSTDecoder: per-patch VOL/PAN/TEMPO', () => {
  const scotlandKiss = join(process.cwd(), 'dumps/prts/07-D Scotland Kiss.prst');
  const startPedal = join(process.cwd(), 'dumps/prts/01-A Start Pedal.prst');

  it.skipIf(!existsSync(scotlandKiss))('decodes patch volume/pan/tempo from a real file', () => {
    const data = new Uint8Array(readFileSync(scotlandKiss));
    const preset = new PRSTDecoder(data).decode();
    expect(preset.patchVolume).toBe(50);
    // 0x3C used to be read as pan, which is why this once expected 5. That byte
    // is the style tag (5 = Rock); pan lives at 0x3A and this patch is centred.
    expect(preset.patchPan).toBe(0);
    expect(preset.patchStyle).toBe(5);
    expect(preset.patchTempo).toBe(120);
  });

  it.skipIf(!existsSync(startPedal))('decodes a non-default patch volume', () => {
    const data = new Uint8Array(readFileSync(startPedal));
    const preset = new PRSTDecoder(data).decode();
    expect(preset.patchVolume).toBe(46);
  });
});

describe('PRSTDecoder: pre-name u16 metadata block', () => {
  /** 0x36..0x43 is seven consecutive u16 LE fields; write one of them. */
  function withMeta(fields: Partial<Record<'tempo' | 'volume' | 'pan' | 'style' | 'fxMode', number>>) {
    const buf = buildTestBuffer();
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    if (fields.tempo !== undefined) view.setUint16(0x36, fields.tempo, true);
    if (fields.volume !== undefined) view.setUint16(0x38, fields.volume, true);
    if (fields.pan !== undefined) view.setUint16(0x3A, fields.pan & 0xFFFF, true);
    if (fields.style !== undefined) view.setUint16(0x3C, fields.style, true);
    if (fields.fxMode !== undefined) view.setUint16(0x42, fields.fxMode, true);
    return buf;
  }

  it('reads pan from 0x3A as a signed 16-bit value', () => {
    expect(new PRSTDecoder(withMeta({ pan: 25 })).decode().patchPan).toBe(25);
    expect(new PRSTDecoder(withMeta({ pan: -50 })).decode().patchPan).toBe(-50);
    expect(new PRSTDecoder(withMeta({ pan: 0 })).decode().patchPan).toBe(0);
  });

  it('does not mistake the style tag at 0x3C for pan', () => {
    const preset = new PRSTDecoder(withMeta({ style: 5, pan: 0 })).decode();
    expect(preset.patchStyle).toBe(5);
    expect(preset.patchPan).toBe(0);
  });

  it('clamps an out-of-range pan to centre rather than failing the decode', () => {
    expect(new PRSTDecoder(withMeta({ pan: 900 })).decode().patchPan).toBe(0);
  });

  it('reads the FX-loop mode at 0x42, defaulting anything unknown to parallel', () => {
    expect(new PRSTDecoder(withMeta({ fxMode: 1 })).decode().fxLoopMode).toBe(1);
    expect(new PRSTDecoder(withMeta({ fxMode: 0 })).decode().fxLoopMode).toBe(0);
    expect(new PRSTDecoder(withMeta({ fxMode: 7 })).decode().fxLoopMode).toBe(0);
  });

  it('reads the 40-byte note at 0x64 and leaves an empty note absent', () => {
    const buf = buildTestBuffer();
    '4CM for my Marshall'.split('').forEach((c, i) => { buf[0x64 + i] = c.charCodeAt(0); });
    expect(new PRSTDecoder(buf).decode().patchNote).toBe('4CM for my Marshall');
    expect(new PRSTDecoder(buildTestBuffer()).decode().patchNote).toBeUndefined();
  });

  it('keeps an FX-loop position of 11 instead of resetting it to 4', () => {
    const buf = buildTestBuffer();
    buf[0x92] = 11;
    buf[0x93] = 11;
    const preset = new PRSTDecoder(buf).decode();
    expect(preset.fxLoopSend).toBe(11);
    expect(preset.fxLoopReturn).toBe(11);
  });

  it('still falls back to 4 for a genuinely out-of-range FX-loop position', () => {
    const buf = buildTestBuffer();
    buf[0x92] = 12;
    buf[0x93] = 0;
    const preset = new PRSTDecoder(buf).decode();
    expect(preset.fxLoopSend).toBe(4);
    expect(preset.fxLoopReturn).toBe(4);
  });
});

describe('PRSTDecoder: committed device export', () => {
  const webExport = join(process.cwd(), 'web-export.prst');

  it.skipIf(!existsSync(webExport))('reads it as a centred Rock patch, not pan 5', () => {
    const preset = new PRSTDecoder(new Uint8Array(readFileSync(webExport))).decode();
    expect(preset.patchName).toBe('littedrive2');
    expect(preset.patchPan).toBe(0);
    expect(preset.patchStyle).toBe(5);
    expect(preset.patchVolume).toBe(86);
    expect(preset.patchTempo).toBe(120);
  });
});
