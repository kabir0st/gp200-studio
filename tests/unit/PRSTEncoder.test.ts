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

/** A preset with 11 effect slots — the real GP-200 format always has exactly 11 */
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
    // fxLoop values — this exercises the rawSource path (the second encode has
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
