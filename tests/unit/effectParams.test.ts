import { describe, it, expect } from 'vitest';
import { EFFECT_PARAMS, getEffectParams } from '@/core/effectParams';

describe('EFFECT_PARAMS', () => {
  it('contains a large number of effects', () => {
    const codes = Object.keys(EFFECT_PARAMS);
    expect(codes.length).toBeGreaterThan(100);
  });

  it('COMP (code 0) has 2 knob params', () => {
    const params = EFFECT_PARAMS[0];
    expect(params).toHaveLength(2);
    expect(params[0]).toMatchObject({ type: 'knob', name: 'Sustain', idx: 0 });
    expect(params[1]).toMatchObject({ type: 'knob', name: 'Volume', idx: 1 });
  });

  it('AC Sim (code 16777217) has Combox param', () => {
    const params = EFFECT_PARAMS[16777217];
    expect(params).toBeDefined();
    const combox = params.find(p => p.type === 'combox');
    expect(combox).toBeDefined();
    expect(combox!.name).toBe('Mode');
    if (combox!.type === 'combox') {
      expect(combox!.options.length).toBeGreaterThan(0);
    }
  });

  it('FAT BB (code 25) has Switch param', () => {
    const params = EFFECT_PARAMS[25];
    expect(params).toBeDefined();
    const sw = params.find(p => p.type === 'switch');
    expect(sw).toBeDefined();
    expect(sw!.name).toBe('Low Cut');
    if (sw!.type === 'switch') {
      expect(sw!.options).toEqual([
        { name: 'OFF', id: 0 },
        { name: 'ON', id: 1 },
      ]);
    }
  });

  it('params are sorted by idx', () => {
    for (const [, params] of Object.entries(EFFECT_PARAMS)) {
      for (let i = 1; i < params.length; i++) {
        expect(params[i].idx).toBeGreaterThanOrEqual(params[i - 1].idx);
      }
    }
  });
});

describe('getEffectParams', () => {
  it('returns params for a known effect', () => {
    const params = getEffectParams(0);
    expect(params).toHaveLength(2);
  });

  it('returns empty array for unknown effect', () => {
    const params = getEffectParams(999999999);
    expect(params).toEqual([]);
  });
});
