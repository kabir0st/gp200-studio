import { describe, it, expect } from 'vitest';
import { GP200PresetSchema, EffectSlotSchema } from '@/core/types';

const FULL_PARAMS = Array(15).fill(0);
const FULL_EFFECTS = Array.from({ length: 11 }, (_, i) => ({
  slotIndex: i, effectId: 0, enabled: false, params: FULL_PARAMS,
}));

describe('GP200PresetSchema', () => {
  it('validates a valid preset with 11 effects', () => {
    const result = GP200PresetSchema.safeParse({
      version: '1',
      patchName: 'TestPatch',
      effects: FULL_EFFECTS,
      checksum: 0xab,
    });
    expect(result.success).toBe(true);
  });

  it('akzeptiert "Stone in Love" (13 Zeichen)', () => {
    const result = GP200PresetSchema.safeParse({
      version: '1',
      patchName: 'Stone in Love',
      effects: FULL_EFFECTS,
      checksum: 0,
    });
    expect(result.success).toBe(true);
  });

  it('rejects patchName longer than 16 chars', () => {
    const result = GP200PresetSchema.safeParse({
      version: '1',
      patchName: 'A'.repeat(17),
      effects: FULL_EFFECTS,
      checksum: 0,
    });
    expect(result.success).toBe(false);
  });

  it('rejects effects array with wrong count', () => {
    const result = GP200PresetSchema.safeParse({
      version: '1',
      patchName: 'Test',
      effects: [],
      checksum: 0,
    });
    expect(result.success).toBe(false);
  });

  it('defaults fxLoopSend and fxLoopReturn to 4 when omitted', () => {
    const parsed = GP200PresetSchema.parse({
      version: '1',
      patchName: 'X',
      effects: FULL_EFFECTS,
      checksum: 0,
    });
    expect(parsed.fxLoopSend).toBe(4);
    expect(parsed.fxLoopReturn).toBe(4);
  });

  it('accepts custom fxLoopSend/Return in range 1..10', () => {
    const parsed = GP200PresetSchema.parse({
      version: '1',
      patchName: 'X',
      effects: FULL_EFFECTS,
      checksum: 0,
      fxLoopSend: 1,
      fxLoopReturn: 10,
    });
    expect(parsed.fxLoopSend).toBe(1);
    expect(parsed.fxLoopReturn).toBe(10);
  });

  it('rejects fxLoopSend and fxLoopReturn out of range', () => {
    const base = {
      version: '1', patchName: 'X',
      effects: FULL_EFFECTS,
      checksum: 0,
    };
    expect(() => GP200PresetSchema.parse({ ...base, fxLoopSend: 0 })).toThrow();
    expect(() => GP200PresetSchema.parse({ ...base, fxLoopSend: 11 })).toThrow();
    expect(() => GP200PresetSchema.parse({ ...base, fxLoopReturn: 0 })).toThrow();
    expect(() => GP200PresetSchema.parse({ ...base, fxLoopReturn: 11 })).toThrow();
  });
});

describe('EffectSlotSchema', () => {
  it('validates a valid effect slot with 15 float32 params', () => {
    const result = EffectSlotSchema.safeParse({
      slotIndex: 0,
      effectId: 5,
      enabled: true,
      params: [50.0, 30.5, 0.0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    });
    expect(result.success).toBe(true);
  });

  it('akzeptiert slotIndex 10 (11 Slots total, 0-10)', () => {
    const result = EffectSlotSchema.safeParse({
      slotIndex: 10,
      effectId: 0,
      enabled: false,
      params: FULL_PARAMS,
    });
    expect(result.success).toBe(true);
  });

  it('rejects slotIndex out of range (max 10)', () => {
    const result = EffectSlotSchema.safeParse({
      slotIndex: 11,
      effectId: 0,
      enabled: false,
      params: FULL_PARAMS,
    });
    expect(result.success).toBe(false);
  });

  it('accepts float32 param values (not limited to 0-255)', () => {
    const result = EffectSlotSchema.safeParse({
      slotIndex: 0,
      effectId: 0,
      enabled: true,
      params: [256, -12.5, 0.1, 10000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    });
    expect(result.success).toBe(true);
  });

  it('rejects params with wrong count', () => {
    const result = EffectSlotSchema.safeParse({
      slotIndex: 0,
      effectId: 0,
      enabled: true,
      params: [1, 2, 3],
    });
    expect(result.success).toBe(false);
  });

  it('accepts 15 float32 params (full slot)', () => {
    const params = Array.from({ length: 15 }, (_, i) => i * 6.67);
    const result = EffectSlotSchema.safeParse({
      slotIndex: 0,
      effectId: 0,
      enabled: true,
      params,
    });
    expect(result.success).toBe(true);
  });
});
