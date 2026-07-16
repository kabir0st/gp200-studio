import { describe, it, expect } from 'vitest';
import { EFFECT_MAP, getEffectName, getModuleName, getEffectsByModule, MODULE_COLORS } from '@/core/effectNames';

describe('EFFECT_MAP', () => {
  it('contains 305 unique effect codes', () => {
    expect(Object.keys(EFFECT_MAP)).toHaveLength(305);
  });

  it('maps COMP to code 0 (PRE)', () => {
    expect(EFFECT_MAP[0]).toEqual({ name: 'COMP', module: 'PRE' });
  });

  it('maps UK 800 to code 117440565 / 0x07000035 (AMP)', () => {
    expect(EFFECT_MAP[117440565]).toEqual({ name: 'UK 800', module: 'AMP' });
  });

  it('maps Room to code 201326592 / 0x0C000000 (RVB)', () => {
    expect(EFFECT_MAP[201326592]).toEqual({ name: 'Room', module: 'RVB' });
  });

  it('maps Hall to code 201326593 / 0x0C000001 (RVB)', () => {
    expect(EFFECT_MAP[201326593]).toEqual({ name: 'Hall', module: 'RVB' });
  });

  it('maps Pure to code 184549376 / 0x0B000000 (DLY)', () => {
    expect(EFFECT_MAP[184549376]).toEqual({ name: 'Pure', module: 'DLY' });
  });

  it('maps Volume to code 100663299 / 0x06000003 (VOL)', () => {
    expect(EFFECT_MAP[100663299]).toEqual({ name: 'Volume', module: 'VOL' });
  });

  it('maps Green OD to code 50331648 / 0x03000000 (DST)', () => {
    expect(EFFECT_MAP[50331648]).toEqual({ name: 'Green OD', module: 'DST' });
  });

  it('maps V-Wah to code 83886081 / 0x05000001 (WAH)', () => {
    expect(EFFECT_MAP[83886081]).toEqual({ name: 'V-Wah', module: 'WAH' });
  });

  it('maps Guitar EQ 1 to code 16777269 / 0x01000035 (EQ)', () => {
    expect(EFFECT_MAP[16777269]).toEqual({ name: 'Guitar EQ 1', module: 'EQ' });
  });

  it('maps A-Chorus to code 67108864 / 0x04000000 (MOD)', () => {
    expect(EFFECT_MAP[67108864]).toEqual({ name: 'A-Chorus', module: 'MOD' });
  });

  it('maps Gate 1 to code 27 (NR)', () => {
    expect(EFFECT_MAP[27]).toEqual({ name: 'Gate 1', module: 'NR' });
  });

  it('maps SnapTone AMP to code 251658240 / 0x0F000000', () => {
    expect(EFFECT_MAP[251658240]).toEqual({ name: 'SnapTone', module: 'AMP' });
  });

  it('maps User IR to code 168820736 / 0x0A100000 (CAB)', () => {
    expect(EFFECT_MAP[168820736]).toEqual({ name: 'User IR', module: 'CAB' });
  });
});

describe('getEffectName', () => {
  it('returns name for known effect codes', () => {
    expect(getEffectName(0)).toBe('COMP');
    expect(getEffectName(117440565)).toBe('UK 800');
    expect(getEffectName(201326592)).toBe('Room');
    expect(getEffectName(184549376)).toBe('Pure');
  });

  it('returns "Unknown (0xHEX)" for unmapped codes', () => {
    expect(getEffectName(0x99999999)).toBe('Unknown (0x99999999)');
  });

  it('formats unknown codes with zero-padded uppercase hex', () => {
    expect(getEffectName(255)).toBe('Unknown (0x000000FF)');
    expect(getEffectName(0xABCD1234)).toBe('Unknown (0xABCD1234)');
  });
});

describe('getModuleName', () => {
  it('returns module for known effect codes', () => {
    expect(getModuleName(0)).toBe('PRE');
    expect(getModuleName(117440565)).toBe('AMP');
    expect(getModuleName(201326592)).toBe('RVB');
    expect(getModuleName(100663299)).toBe('VOL');
    expect(getModuleName(83886081)).toBe('WAH');
    expect(getModuleName(16777269)).toBe('EQ');
    expect(getModuleName(67108864)).toBe('MOD');
    expect(getModuleName(27)).toBe('NR');
    expect(getModuleName(167772160)).toBe('CAB');
    expect(getModuleName(184549376)).toBe('DLY');
    expect(getModuleName(50331648)).toBe('DST');
  });

  it('returns "Unknown" for unmapped codes', () => {
    expect(getModuleName(0x99999999)).toBe('Unknown');
    expect(getModuleName(0xFFFFFFFF)).toBe('Unknown');
  });
});

describe('getEffectsByModule', () => {
  it('returns DST effects sorted by name', () => {
    const dstEffects = getEffectsByModule('DST');
    expect(dstEffects.length).toBeGreaterThan(5);
    expect(dstEffects.find(e => e.name === 'Green OD')).toBeDefined();
    // Check sorted
    for (let i = 1; i < dstEffects.length; i++) {
      expect(dstEffects[i].name.localeCompare(dstEffects[i - 1].name)).toBeGreaterThanOrEqual(0);
    }
  });

  it('returns AMP effects', () => {
    const ampEffects = getEffectsByModule('AMP');
    expect(ampEffects.length).toBeGreaterThan(10);
    expect(ampEffects.find(e => e.name === 'UK 800')).toBeDefined();
  });

  it('returns empty array for unknown module', () => {
    expect(getEffectsByModule('NONEXISTENT')).toEqual([]);
  });

  it('each effect has effectId and name', () => {
    const cabEffects = getEffectsByModule('CAB');
    for (const e of cabEffects) {
      expect(typeof e.effectId).toBe('number');
      expect(typeof e.name).toBe('string');
      expect(e.name.length).toBeGreaterThan(0);
    }
  });
});

describe('MODULE_COLORS', () => {
  const expectedModules = ['PRE', 'WAH', 'DST', 'AMP', 'NR', 'CAB', 'EQ', 'MOD', 'DLY', 'RVB', 'VOL'];

  it('has colors for all 11 module types', () => {
    for (const mod of expectedModules) {
      expect(MODULE_COLORS[mod]).toBeDefined();
    }
  });

  it('each module color has accent, accentDim, glow', () => {
    for (const mod of expectedModules) {
      const colors = MODULE_COLORS[mod];
      expect(colors.accent).toMatch(/^#[0-9a-f]{6}$/i);
      expect(colors.accentDim).toMatch(/^#[0-9a-f]{6}$/i);
      expect(colors.glow).toMatch(/^rgba\(/);
    }
  });
});
