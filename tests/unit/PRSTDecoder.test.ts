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
    // byte and fell back to default order — the #90 symptom for atypical files.
    const routing = [0xff, 1, 4, 0, 2, 5, 6, 7, 8, 9, 10];
    const decoded = new PRSTDecoder(buildTestBufferWithRouting(routing)).decode();
    // Valid entries kept in file order; the one omitted slot (3) appended last.
    // No block dropped or duplicated — a full 0..10 permutation is guaranteed.
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

  const authorFile = join(process.cwd(), 'prst/63-B American Idiot.prst');
  it.skipIf(!existsSync(authorFile))('reads author "Galtone Studio" from American Idiot.prst', () => {
    const data = new Uint8Array(readFileSync(authorFile));
    const preset = new PRSTDecoder(data).decode();
    expect(preset.patchName).toBe('American Idiot');
    expect(preset.author).toBe('Galtone Studio');
  });
});
