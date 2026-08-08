import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { PRSTEncoder } from '@/core/PRSTEncoder';
import { PRSTDecoder, PRST_MAGIC } from '@/core/PRSTDecoder';
import type { GP200Preset } from '@/core/types';

function loadRealFixture(name: string): Uint8Array | null {
  const p = join(process.cwd(), 'planung', name);
  return existsSync(p) ? new Uint8Array(readFileSync(p)) : null;
}

/** A preset with 11 effect slots; the real GP-200 format always has exactly 11 */
const EMPTY_PARAMS = Array(15).fill(0);
const samplePreset: GP200Preset = {
  version: '1',
  patchName: 'MyPatch',
  effects: Array.from({ length: 11 }, (_, i) => ({
    slotIndex: i,
    effectId: 0,
    enabled: false,
    params: EMPTY_PARAMS,
  })),
  checksum: 0,
  fxLoopSend: 4,
  fxLoopReturn: 4,
};

describe('PRSTEncoder', () => {
  it('schreibt den Magic-Header "TSRP"', () => {
    const encoder = new PRSTEncoder();
    const buf = encoder.encode(samplePreset);
    const arr = new Uint8Array(buf);
    const magic = String.fromCharCode(arr[0], arr[1], arr[2], arr[3]);
    expect(magic).toBe(PRST_MAGIC);
  });

  it('erzeugt genau 1224 Bytes', () => {
    const encoder = new PRSTEncoder();
    expect(encoder.encode(samplePreset).byteLength).toBe(1224);
  });

  it('encode -> decode ergibt das gleiche Preset (round-trip)', () => {
    const encoder = new PRSTEncoder();
    const buf = new Uint8Array(encoder.encode(samplePreset));
    const decoder = new PRSTDecoder(buf);
    const decoded = decoder.decode();
    expect(decoded.patchName).toBe(samplePreset.patchName);
    expect(decoded.version).toBe(samplePreset.version);
    // Checksum: verify decoded value matches recomputed sum(bytes[0:0x4C6]) & 0xFFFF
    let expectedSum = 0;
    for (let i = 0; i < 0x4C6; i++) expectedSum += buf[i];
    expect(decoded.checksum).toBe(expectedSum & 0xFFFF);
    expect(decoded.effects).toHaveLength(11);
    expect(decoded.effects[0].enabled).toBe(false);
    expect(decoded.effects[0].slotIndex).toBe(0);
    expect(decoded.effects[0].params).toHaveLength(15);
  });

  it('round-trips author field', () => {
    const preset: GP200Preset = { ...samplePreset, author: 'TestAuthor' };
    const encoder = new PRSTEncoder();
    const buf = new Uint8Array(encoder.encode(preset));
    const decoded = new PRSTDecoder(buf).decode();
    expect(decoded.author).toBe('TestAuthor');
  });

  it('round-trips preset without author', () => {
    const encoder = new PRSTEncoder();
    const buf = new Uint8Array(encoder.encode(samplePreset));
    const decoded = new PRSTDecoder(buf).decode();
    expect(decoded.author).toBeUndefined();
  });

  it('writes author at offset 0x54', () => {
    const preset: GP200Preset = { ...samplePreset, author: 'Me' };
    const encoder = new PRSTEncoder();
    const buf = new Uint8Array(encoder.encode(preset));
    expect(buf[0x54]).toBe('M'.charCodeAt(0));
    expect(buf[0x55]).toBe('e'.charCodeAt(0));
    expect(buf[0x56]).toBe(0); // null terminated
  });

  it('round-trips a real 1224-byte .prst (decode → encode → byte-compare)', () => {
    const original = loadRealFixture('57-A Stone in Love.prst');
    if (!original) return; // fixture not checked out on this host
    expect(original.byteLength).toBe(1224);
    const preset = new PRSTDecoder(original).decode();
    const encoded = new Uint8Array(new PRSTEncoder().encode(preset));

    // Routing + effect blocks + controller assignments must survive
    // round-trip. The trailing 2 bytes (checksum) are recomputed, so we
    // stop one byte short of OFFSET_CHECKSUM (0x4C6).
    for (let i = 0x8C; i < 0x4C6; i++) {
      if (encoded[i] !== original[i]) {
        throw new Error(
          `byte diff at 0x${i.toString(16)}: original=${original[i]} encoded=${encoded[i]}`,
        );
      }
    }
  });

  it('round-trips the firmware version byte (0x15)', () => {
    const buf = new Uint8Array(1224);
    buf[0x00] = 0x54; buf[0x01] = 0x53; buf[0x02] = 0x52; buf[0x03] = 0x50;
    buf[0x15] = 0x05;
    for (let slot = 0; slot < 11; slot++) {
      const base = 0xa0 + slot * 0x48;
      buf[base] = 0x14; buf[base + 2] = 0x44;
      buf[base + 4] = slot;
    }
    const preset = new PRSTDecoder(buf).decode();
    expect(preset.version).toBe('5');
    const encoded = new Uint8Array(new PRSTEncoder().encode(preset));
    expect(encoded[0x15]).toBe(0x05);
  });

  it('writes the 0x0F block marker at offset +6 (not +7) on all 11 blocks', () => {
    // Regression: the synthetic (no-rawSource) path used to write the marker at
    // base+7, producing `00 0F` where real Valeton files have `0F 00`. That
    // malformed every effect-block header and the official GP-200 editor
    // rejected the file. See dumps/prts/*.prst: block+6 is always 0x0F, block+7 0x00.
    const bytes = new Uint8Array(new PRSTEncoder().encode(samplePreset));
    for (let i = 0; i < 11; i++) {
      const base = 0xa0 + i * 0x48;
      expect(bytes[base + 6]).toBe(0x0f);
      expect(bytes[base + 7]).toBe(0x00);
    }
  });

  it('writes the MRAP pointer (0x20 = 0x28) so the Valeton editor can load it', () => {
    // Regression: the synthetic path left 0x20 at 0x00. Real files store the
    // MRAP block offset (0x28) there and the official editor follows it, so a
    // zero made from-scratch exports unloadable. The decoder ignores 0x20.
    const view = new DataView(new PRSTEncoder().encode(samplePreset));
    expect(view.getUint32(0x20, true)).toBe(0x28);
  });

  it('writes the target slot index to 0x34 (and mirrors 0x90 for synthetic presets)', () => {
    // 01-C = (1-1)*4 + 2 = slot 2. Genuine files carry this at 0x34; the Valeton
    // editor uses it to place the patch on the device, so a 0 lands it on 01-A.
    const bytes = new Uint8Array(new PRSTEncoder().encode({ ...samplePreset, slotIndex: 2 }));
    expect(bytes[0x34]).toBe(2);
    expect(bytes[0x90]).toBe(2); // synthetic: mirror written
    // Omitted slotIndex leaves 0x34 at 0 (unchanged legacy behaviour).
    const noSlot = new Uint8Array(new PRSTEncoder().encode(samplePreset));
    expect(noSlot[0x34]).toBe(0);
  });

  it('round-trips slotIndex through decode → encode', () => {
    const buf = new Uint8Array(new PRSTEncoder().encode({ ...samplePreset, slotIndex: 42 }));
    const decoded = new PRSTDecoder(buf).decode();
    expect(decoded.slotIndex).toBe(42);
  });

  it('round-trips float32 param values', () => {
    const preset: GP200Preset = {
      ...samplePreset,
      effects: samplePreset.effects.map((slot, i) => ({
        ...slot,
        params: i === 0
          ? [50.0, 25.5, 100.0, 0.0, -12.0, 0.1, 0, 0, 0, 0, 0, 0, 0, 0, 0]
          : EMPTY_PARAMS,
      })),
    };
    const encoder = new PRSTEncoder();
    const buf = new Uint8Array(encoder.encode(preset));
    const decoder = new PRSTDecoder(buf);
    const decoded = decoder.decode();
    const params = decoded.effects[0].params;
    expect(params[0]).toBeCloseTo(50.0, 5);
    expect(params[1]).toBeCloseTo(25.5, 5);
    expect(params[2]).toBeCloseTo(100.0, 5);
    expect(params[3]).toBeCloseTo(0.0, 5);
    expect(params[4]).toBeCloseTo(-12.0, 5);
    expect(params[5]).toBeCloseTo(0.1, 5);
  });

  it('writes fxLoopSend/Return to bytes 0x92/0x93', () => {
    const preset: GP200Preset = {
      version: '1',
      patchName: 'X',
      effects: Array.from({ length: 11 }, (_, i) => ({
        slotIndex: i, effectId: 0, enabled: false, params: Array(15).fill(0),
      })),
      checksum: 0,
      fxLoopSend: 2,
      fxLoopReturn: 8,
    };
    const ab = new PRSTEncoder().encode(preset);
    const bytes = new Uint8Array(ab);
    expect(bytes[0x92]).toBe(2);
    expect(bytes[0x93]).toBe(8);
  });

  it('preserves fxLoopSend/Return through encode→decode round-trip', () => {
    const preset: GP200Preset = {
      version: '1',
      patchName: 'X',
      effects: Array.from({ length: 11 }, (_, i) => ({
        slotIndex: i, effectId: 0, enabled: false, params: Array(15).fill(0),
      })),
      checksum: 0,
      fxLoopSend: 5,
      fxLoopReturn: 9,
    };
    const ab = new PRSTEncoder().encode(preset);
    const decoded = new PRSTDecoder(new Uint8Array(ab)).decode();
    expect(decoded.fxLoopSend).toBe(5);
    expect(decoded.fxLoopReturn).toBe(9);
  });

  it('writes fxLoopSend/Return for rawSource-based preset (user edit)', () => {
    // Encode a synthetic preset first, then re-decode and re-encode with edited
    // fxLoop values. This exercises the rawSource path (the second encode has
    // rawSource set from the first decode).
    const initial = new PRSTEncoder().encode({
      version: '1',
      patchName: 'X',
      effects: Array.from({ length: 11 }, (_, i) => ({
        slotIndex: i, effectId: 0, enabled: false, params: Array(15).fill(0),
      })),
      checksum: 0,
      fxLoopSend: 4,
      fxLoopReturn: 4,
    });
    const decoded = new PRSTDecoder(new Uint8Array(initial)).decode();
    expect(decoded.rawSource).toBeDefined(); // confirm we're on the rawSource path
    // User edits SEND/RETURN
    const edited = { ...decoded, fxLoopSend: 3, fxLoopReturn: 9 };
    const reencoded = new Uint8Array(new PRSTEncoder().encode(edited));
    expect(reencoded[0x92]).toBe(3);
    expect(reencoded[0x93]).toBe(9);
  });
});

describe('PRSTEncoder: controller/EXP assignment records', () => {
  const fixtureDir = join(process.cwd(), 'dumps/prts');
  const fixturePath = join(fixtureDir, '01-A Start Pedal.prst');
  function loadCommitted(): Uint8Array {
    return new Uint8Array(readFileSync(fixturePath));
  }

  const REAL_EXPORTS = [
    '01-A Start Pedal.prst',
    '01-C litte wing drive.prst',
    '06-B Radio Cat.prst',
    '07-D Scotland Kiss.prst',
  ];
  for (const name of REAL_EXPORTS) {
    const filePath = join(fixtureDir, name);
    it.skipIf(!existsSync(filePath))(
      `untouched decode → encode of "${name}" stays byte-exact including the controls tail`,
      () => {
        const original = new Uint8Array(readFileSync(filePath));
        const preset = new PRSTDecoder(original).decode();
        const encoded = new Uint8Array(new PRSTEncoder().encode(preset));
        expect(Array.from(encoded)).toEqual(Array.from(original));
      },
    );
  }

  it.skipIf(!existsSync(fixturePath))(
    'flipping one CTRL bit changes only the mask byte (checksum unchanged mod 256 window)',
    () => {
      const original = loadCommitted();
      const preset = new PRSTDecoder(original).decode();
      const ctrl = preset.ctrlAssignments!.map((assignment) => ({ ...assignment }));
      // CTRL 2 (index 1) is 0x040 (EQ) in the fixture, so switch to AMP (0x08)
      ctrl[1] = { ctrlIndex: 1, blockMask: 0x08 };
      const encoded = new Uint8Array(
        new PRSTEncoder().encode({ ...preset, ctrlAssignments: ctrl }),
      );
      const diffs: number[] = [];
      for (let i = 0; i < original.length; i++) {
        if (encoded[i] !== original[i]) diffs.push(i);
      }
      // mask low byte + recomputed checksum byte(s)
      expect(diffs.length).toBeGreaterThanOrEqual(2);
      expect(diffs.length).toBeLessThanOrEqual(3);
      expect(diffs[0]).toBeGreaterThanOrEqual(0x460);
      expect(diffs[0]).toBeLessThan(0x4C0);
      for (const off of diffs.slice(1)) {
        expect(off).toBeGreaterThanOrEqual(0x4C6);
      }
      // and the flip survives a re-decode
      const reDecoded = new PRSTDecoder(encoded).decode();
      expect(reDecoded.ctrlAssignments![1].blockMask).toBe(0x08);
      expect(reDecoded.ctrlAssignments![4].blockMask).toBe(0x100);
    },
  );

  it('synthetic preset (no rawSource) emits the canonical default controls tail', () => {
    const encoded = new Uint8Array(new PRSTEncoder().encode(samplePreset));
    const reDecoded = new PRSTDecoder(encoded).decode();
    expect(reDecoded.ctrlAssignments).toBeDefined();
    expect(reDecoded.ctrlAssignments!.every((assignment) => assignment.blockMask === 0))
      .toBe(true);
    // Default EXP wiring: EXP1-A Para1 → VOL block, EXP1-B Para1 → WAH param 3
    expect(reDecoded.expAssignments![0].blockIndex).toBe(10);
    const modeB = reDecoded.expAssignments!.find(
      (assignment) => assignment.page === 1 && assignment.item === 0,
    );
    expect(modeB!.blockIndex).toBe(1);
    expect(modeB!.paramIndex).toBe(3);
  });

  it('treats a short rawSource (factory 1176-byte file) as synthetic', () => {
    // Regression: the rawSource COPY was guarded by `byteLength >= 1224` but
    // every later branch keyed off `Boolean(preset.rawSource)`. A 1176-byte
    // factory file therefore got no base bytes copied, yet still skipped header
    // seeding and block padding and took the patch-in-place controls-tail
    // branch — which walked an all-zero buffer and bailed. The export came out
    // with no TSRP magic, a zero MRAP pointer and an all-zero tail.
    const shortRaw = new Uint8Array(1176);
    const ctrl = Array.from({ length: 8 }, (_, ctrlIndex) => ({ ctrlIndex, blockMask: 0 }));
    ctrl[2] = { ctrlIndex: 2, blockMask: 0x145 };
    const encoded = new Uint8Array(
      new PRSTEncoder().encode({ ...samplePreset, rawSource: shortRaw, ctrlAssignments: ctrl }),
    );

    expect(String.fromCharCode(...encoded.subarray(0, 4))).toBe(PRST_MAGIC);
    const view = new DataView(encoded.buffer, encoded.byteOffset, encoded.byteLength);
    expect(view.getUint32(0x20, true)).toBe(0x28);

    const reDecoded = new PRSTDecoder(encoded).decode();
    expect(reDecoded.ctrlAssignments).toBeDefined();
    expect(reDecoded.ctrlAssignments![2].blockMask).toBe(0x145);
  });

  it('synthetic preset honors explicit ctrlAssignments', () => {
    const ctrl = Array.from({ length: 8 }, (_, ctrlIndex) => ({ ctrlIndex, blockMask: 0 }));
    ctrl[5] = { ctrlIndex: 5, blockMask: 0x201 };
    const encoded = new Uint8Array(
      new PRSTEncoder().encode({ ...samplePreset, ctrlAssignments: ctrl }),
    );
    const reDecoded = new PRSTDecoder(encoded).decode();
    expect(reDecoded.ctrlAssignments![5].blockMask).toBe(0x201);
  });

  it.skipIf(!existsSync(fixturePath))(
    'edited patch volume/pan/tempo survive a round-trip on a real file',
    () => {
      const original = loadCommitted();
      const preset = new PRSTDecoder(original).decode();
      const encoded = new Uint8Array(
        new PRSTEncoder().encode({ ...preset, patchVolume: 88, patchPan: -12, patchTempo: 165 }),
      );
      const reDecoded = new PRSTDecoder(encoded).decode();
      expect(reDecoded.patchVolume).toBe(88);
      expect(reDecoded.patchPan).toBe(-12);
      expect(reDecoded.patchTempo).toBe(165);
    },
  );
});
