import { describe, it, expect } from 'vitest';
import { extractModules, extractEffects } from '@/core/extractModules';
import type { GP200Preset } from '@/core/types';

const PARAMS = Array(15).fill(0);

function makePreset(slots: { enabled: boolean; effectId: number }[]): GP200Preset {
  const effects = Array.from({ length: 11 }, (_, i) => ({
    slotIndex: i,
    enabled: slots[i]?.enabled ?? false,
    effectId: slots[i]?.effectId ?? 0,
    params: PARAMS,
  }));
  return { version: '1', patchName: 'Test', effects, checksum: 0, fxLoopSend: 4, fxLoopReturn: 4 };
}

describe('extractModules', () => {
  it('returns unique module names for active effects', () => {
    const preset = makePreset([
      { enabled: true, effectId: 0x03000000 },   // DST (Green OD)
      { enabled: true, effectId: 0x07000001 },   // AMP (Tweedy)
      { enabled: false, effectId: 0x0B000000 },  // DLY (inactive)
      { enabled: true, effectId: 0x0C000000 },   // RVB (Room)
      { enabled: true, effectId: 0x03000004 },   // DST (duplicate)
    ]);
    expect(extractModules(preset)).toEqual(['DST', 'AMP', 'RVB']);
  });

  it('returns empty array for no active effects', () => {
    const preset = makePreset([
      { enabled: false, effectId: 0x03000000 },
    ]);
    expect(extractModules(preset)).toEqual([]);
  });

  it('excludes Unknown modules', () => {
    const preset = makePreset([
      { enabled: true, effectId: 0xFFFFFFFF },   // Unknown
      { enabled: true, effectId: 0x07000001 },   // AMP
    ]);
    expect(extractModules(preset)).toEqual(['AMP']);
  });

  it('handles all module types', () => {
    const preset = makePreset([
      { enabled: true, effectId: 0 },             // PRE (COMP)
      { enabled: true, effectId: 27 },             // NR (Gate 1)
      { enabled: true, effectId: 0x03000000 },     // DST
      { enabled: true, effectId: 0x04000000 },     // MOD
      { enabled: true, effectId: 0x05000000 },     // WAH
      { enabled: true, effectId: 0x06000000 },     // VOL
      { enabled: true, effectId: 0x07000001 },     // AMP (Tweedy)
      { enabled: true, effectId: 0x0A000000 },     // CAB
      { enabled: true, effectId: 0x0B000000 },     // DLY
      { enabled: true, effectId: 0x0C000000 },     // RVB
      { enabled: true, effectId: 0x01000000 },     // PRE (AC Refiner)
    ]);
    const modules = extractModules(preset);
    expect(modules).toContain('PRE');
    expect(modules).toContain('NR');
    expect(modules).toContain('DST');
    expect(modules).toContain('AMP');
    expect(modules).toContain('CAB');
    expect(modules).toContain('DLY');
    expect(modules).toContain('RVB');
  });
});

describe('extractEffects', () => {
  it('returns unique effect names for active effects', () => {
    const preset = makePreset([
      { enabled: true, effectId: 0x03000000 },   // Green OD
      { enabled: true, effectId: 0x07000001 },   // Tweedy
      { enabled: false, effectId: 0x0B000000 },  // Pure (inactive)
    ]);
    const effects = extractEffects(preset);
    expect(effects).toContain('Green OD');
    expect(effects).toContain('Tweedy');
    expect(effects).not.toContain('Pure'); // inactive
  });

  it('returns empty array for no active effects', () => {
    const preset = makePreset([]);
    expect(extractEffects(preset)).toEqual([]);
  });

  it('excludes Unknown effects', () => {
    const preset = makePreset([
      { enabled: true, effectId: 0xFFFFFFFF },
      { enabled: true, effectId: 0x03000000 },
    ]);
    const effects = extractEffects(preset);
    expect(effects).not.toContain('Unknown');
    expect(effects).toContain('Green OD');
  });

  it('deduplicates effects with same name', () => {
    const preset = makePreset([
      { enabled: true, effectId: 0x03000000 },   // Green OD
      { enabled: true, effectId: 0x03000000 },   // Green OD again
    ]);
    const effects = extractEffects(preset);
    expect(effects.filter(e => e === 'Green OD')).toHaveLength(1);
  });
});
