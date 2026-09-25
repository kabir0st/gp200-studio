import { describe, it, expect } from 'vitest';
import { EFFECT_PARAMS, type KnobParam } from '@/core/effectParams';
import { SYNC_BINDS } from '@/core/effectSyncBinds';
import {
  SYNC_NOTES,
  isKnobSynced,
  noteIndex,
  noteLabel,
  noteValue,
  syncSwitchFor,
} from '@/core/tempoSync';

const PURE_DELAY = 184549376;
const SLAPBACK = 184549381;
const DUAL_DELAY = 184549379;

function knob(effectId: number, name: string): KnobParam {
  const found = EFFECT_PARAMS[effectId].find(
    (param): param is KnobParam => param.type === 'knob' && param.name === name,
  );
  if (!found) throw new Error(`no knob ${name} on ${effectId}`);
  return found;
}

const boundKnobs = Object.entries(SYNC_BINDS).flatMap(([code, knobs]) =>
  Object.keys(knobs).map((name) => ({
    effectId: Number(code),
    param: knob(Number(code), name),
  })),
);

describe('SYNC_BINDS', () => {
  // The table is generated from the installed editor's algorithm.xml, which has
  // drifted from the committed effectParams.ts before (idx renumbering). Names
  // are what it is keyed by, so every one of them has to resolve here.
  it('names a real knob and a real Sync switch on every bound effect', () => {
    for (const [code, knobs] of Object.entries(SYNC_BINDS)) {
      const params = EFFECT_PARAMS[Number(code)];
      expect(params, `effect ${code}`).toBeDefined();
      for (const [knobName, switchName] of Object.entries(knobs)) {
        const found = params.find((param) => param.type === 'knob' && param.name === knobName);
        const syncSwitch = params.find(
          (param) => param.type === 'switch' && param.name === switchName,
        );
        expect(found, `${code} ${knobName}`).toBeDefined();
        expect(syncSwitch, `${code} ${switchName}`).toBeDefined();
      }
    }
  });

  it('covers the mod rates and delay times', () => {
    expect(boundKnobs).toHaveLength(49);
    expect(SYNC_BINDS[DUAL_DELAY]).toEqual({ 'Time A': 'Sync A', 'Time B': 'Sync B' });
  });

  it('leaves Slapback unbound: its Sync switch is commented out in the XML', () => {
    expect(syncSwitchFor(SLAPBACK, knob(SLAPBACK, 'Time'))).toBeNull();
  });
});

describe('isKnobSynced', () => {
  const time = knob(PURE_DELAY, 'Time');

  it('follows the bound switch', () => {
    const params = Array<number>(15).fill(0);
    expect(isKnobSynced(PURE_DELAY, time, params)).toBe(false);
    params[3] = 1;
    expect(isKnobSynced(PURE_DELAY, time, params)).toBe(true);
  });

  it('pairs each knob with its own switch on a two-sync effect', () => {
    const timeA = knob(DUAL_DELAY, 'Time A');
    const timeB = knob(DUAL_DELAY, 'Time B');
    const params = Array<number>(15).fill(0);
    params[7] = 1; // Sync B
    expect(isKnobSynced(DUAL_DELAY, timeA, params)).toBe(false);
    expect(isKnobSynced(DUAL_DELAY, timeB, params)).toBe(true);
  });

  it('is false for a knob with no Sync switch', () => {
    expect(isKnobSynced(PURE_DELAY, knob(PURE_DELAY, 'Mix'), [0, 0, 0, 1])).toBe(false);
  });
});

describe('note mapping', () => {
  const time = knob(PURE_DELAY, 'Time'); // 20..4000 ms

  it('puts 1/1 at the minimum and 1/16 at the maximum', () => {
    expect(noteLabel(20, time)).toBe('1/1');
    expect(noteLabel(4000, time)).toBe('1/16');
  });

  it('rounds to the nearest of eleven evenly spaced marks', () => {
    // marks every 398 ms; 500 ms sits nearest mark 1
    expect(noteLabel(500, time)).toBe('1/2');
    expect(noteIndex(20 + 398 * 4.49, time)).toBe(4);
    expect(noteIndex(20 + 398 * 4.51, time)).toBe(5);
  });

  it('stores a note as a value that reads back as the same note, on every bound knob', () => {
    for (const { effectId, param } of boundKnobs) {
      // the note's position is what noteValue takes
      SYNC_NOTES.forEach((note, index) => {
        const stored = noteValue(index, param);
        expect(stored, `${effectId} ${param.name} ${note}`).toBeGreaterThanOrEqual(param.min);
        expect(stored, `${effectId} ${param.name} ${note}`).toBeLessThanOrEqual(param.max);
        expect(noteLabel(stored, param), `${effectId} ${param.name}`).toBe(note);
      });
    }
  });

  it('clamps out-of-range indices and values', () => {
    expect(noteValue(-3, time)).toBe(20);
    expect(noteValue(99, time)).toBe(4000);
    expect(noteIndex(-50, time)).toBe(0);
    expect(noteIndex(9000, time)).toBe(10);
  });
});
