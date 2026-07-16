import { describe, it, expect } from 'vitest';
import { createDefaultPreset, MODULE_DEFAULTS } from '@/core/defaultPreset';
import { GP200PresetSchema } from '@/core/types';
import { SLOT_MODULES, getModuleName } from '@/core/effectNames';
import { PRSTEncoder } from '@/core/PRSTEncoder';
import { PRSTDecoder } from '@/core/PRSTDecoder';

describe('createDefaultPreset', () => {
  it('is schema-valid with 11 slots in canonical order', () => {
    const preset = createDefaultPreset();
    expect(() => GP200PresetSchema.parse(preset)).not.toThrow();
    expect(preset.effects.map((e) => e.slotIndex)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('uses each module default effect, mapped to the right module', () => {
    const preset = createDefaultPreset();
    preset.effects.forEach((slot, i) => {
      const module = SLOT_MODULES[i];
      expect(slot.effectId).toBe(MODULE_DEFAULTS[module]);
      // every default id must be a known EFFECT_MAP entry of that module
      // (PRE's default 0 = COMP maps to PRE)
      expect(getModuleName(slot.effectId)).toBe(module);
    });
  });

  it('enables only AMP, CAB and VOL (init-patch behavior)', () => {
    const preset = createDefaultPreset();
    const enabledModules = preset.effects
      .filter((e) => e.enabled)
      .map((e) => SLOT_MODULES[e.slotIndex]);
    expect(enabledModules).toEqual(['AMP', 'CAB', 'VOL']);
  });

  it('round-trips through PRSTEncoder → PRSTDecoder without rawSource', () => {
    const preset = createDefaultPreset();
    expect(preset.rawSource).toBeUndefined();
    const encoded = new Uint8Array(new PRSTEncoder().encode(preset));
    const decoded = new PRSTDecoder(encoded).decode();
    expect(decoded.patchName).toBe('INIT');
    expect(decoded.effects.map((e) => e.effectId)).toEqual(preset.effects.map((e) => e.effectId));
    expect(decoded.effects.map((e) => e.enabled)).toEqual(preset.effects.map((e) => e.enabled));
  });
});
