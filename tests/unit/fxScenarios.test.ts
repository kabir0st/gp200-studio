import { describe, it, expect } from 'vitest';
import {
  FX_SCENARIOS,
  applyFxScenario,
  findFxScenario,
  matchFxScenario,
} from '@/core/fxScenarios';
import type { GP200Preset } from '@/core/types';

const AMP_BLOCK = 3;
const CAB_BLOCK = 5;

function presetWith(overrides: Partial<GP200Preset> = {}): GP200Preset {
  return {
    version: '1',
    patchName: 'Test',
    effects: Array.from({ length: 11 }, (_, i) => ({
      slotIndex: i,
      effectId: 0,
      enabled: true,
      params: Array(15).fill(0),
    })),
    checksum: 0,
    fxLoopSend: 4,
    fxLoopReturn: 7,
    fxLoopMode: 0,
    patchVolume: 50,
    patchPan: 0,
    patchStyle: 0,
    patchTempo: 120,
    ...overrides,
  } as GP200Preset;
}

const enabledOf = (preset: GP200Preset, block: number) =>
  preset.effects.find((slot) => slot.slotIndex === block)!.enabled;

describe('fxScenarios', () => {
  it('the 4CM scenario goes serial and steps the amp and cab out of the way', () => {
    const applied = applyFxScenario(presetWith(), findFxScenario('preamp')!);
    expect(applied.fxLoopMode).toBe(1);
    expect(enabledOf(applied, AMP_BLOCK)).toBe(false);
    expect(enabledOf(applied, CAB_BLOCK)).toBe(false);
  });

  it('the power-amp scenario keeps the modelled amp but drops the cab', () => {
    const applied = applyFxScenario(
      presetWith({ fxLoopMode: 1 }),
      findFxScenario('power-amp')!,
    );
    expect(applied.fxLoopMode).toBe(0);
    expect(enabledOf(applied, AMP_BLOCK)).toBe(true);
    expect(enabledOf(applied, CAB_BLOCK)).toBe(false);
  });

  it('the direct scenario turns both back on', () => {
    const off = presetWith({
      effects: presetWith().effects.map((slot) =>
        slot.slotIndex === AMP_BLOCK || slot.slotIndex === CAB_BLOCK
          ? { ...slot, enabled: false }
          : slot),
    });
    const applied = applyFxScenario(off, findFxScenario('direct')!);
    expect(enabledOf(applied, AMP_BLOCK)).toBe(true);
    expect(enabledOf(applied, CAB_BLOCK)).toBe(true);
  });

  it('leaves SEND/RETURN chain positions alone', () => {
    const before = presetWith({ fxLoopSend: 2, fxLoopReturn: 9 });
    for (const scenario of FX_SCENARIOS) {
      const applied = applyFxScenario(before, scenario);
      expect(applied.fxLoopSend).toBe(2);
      expect(applied.fxLoopReturn).toBe(9);
    }
  });

  it('does not mutate the preset it is given', () => {
    const before = presetWith();
    const snapshot = JSON.stringify(before);
    applyFxScenario(before, findFxScenario('preamp')!);
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it('touches no block other than AMP and CAB', () => {
    const before = presetWith();
    const applied = applyFxScenario(before, findFxScenario('preamp')!);
    for (const slot of applied.effects) {
      if (slot.slotIndex === AMP_BLOCK || slot.slotIndex === CAB_BLOCK) continue;
      expect(slot).toEqual(before.effects.find((s) => s.slotIndex === slot.slotIndex));
    }
  });

  it('round-trips through matchFxScenario', () => {
    for (const scenario of FX_SCENARIOS) {
      const applied = applyFxScenario(presetWith(), scenario);
      expect(matchFxScenario(applied)?.id).toBe(scenario.id);
    }
  });

  it('matches nothing once the user hand-edits away from every scenario', () => {
    // Serial with the cab still on is not a shape any scenario describes.
    const odd = applyFxScenario(presetWith(), findFxScenario('preamp')!);
    const handEdited = {
      ...odd,
      effects: odd.effects.map((slot) =>
        slot.slotIndex === CAB_BLOCK ? { ...slot, enabled: true } : slot),
    };
    expect(matchFxScenario(handEdited)).toBeUndefined();
  });
});
