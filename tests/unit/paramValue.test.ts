import { describe, it, expect } from 'vitest';
import type { KnobParam } from '@/core/effectParams';
import {
  entryText,
  formatValue,
  parseEntry,
  snapValue,
  stepValue,
} from '@/components/board/paramValue';

function knob(name: string, min: number, max: number, step: number, fallback: number): KnobParam {
  return { type: 'knob', name, idx: 0, min, max, step, default: fallback };
}

const DRIVE = knob('Drive', 0, 100, 1, 40);
const RATE = knob('Rate', 0.1, 10, 0.1, 0.5);
const FEEDBACK = knob('Feedback', -100, 100, 1, 20);
const TIME = knob('Time', 20, 4000, 1, 500);

describe('stepValue', () => {
  it('moves a 0..100 knob one value per notch, so 71 reaches 70', () => {
    expect(stepValue(71, DRIVE, -1)).toBe(70);
  });

  it('moves a ±100 knob one value per notch too', () => {
    expect(stepValue(20, FEEDBACK, 1)).toBe(21);
  });

  it('moves a wide knob an even coarse step, and one value when fine', () => {
    // 3980 ms over at most 200 notches
    expect(stepValue(500, TIME, 1)).toBe(520);
    expect(stepValue(520, TIME, 1)).toBe(540);
    expect(stepValue(500, TIME, 1, { fine: true })).toBe(501);
  });

  it('fine-steps a Hz knob by its 0.1 resolution', () => {
    expect(stepValue(0.5, RATE, 1, { fine: true })).toBeCloseTo(0.6);
  });

  it('steps a synced knob one note at a time', () => {
    const quarter = snapValue(20 + 398 * 4, TIME, true);
    expect(formatValue(quarter, TIME, true)).toBe('1/4');
    expect(formatValue(stepValue(quarter, TIME, 1, { synced: true }), TIME, true)).toBe('1/4D');
    expect(formatValue(stepValue(quarter, TIME, -1, { synced: true }), TIME, true)).toBe('1/2T');
  });

  it('stops at the ends', () => {
    expect(stepValue(100, DRIVE, 1, { fine: true })).toBe(100);
    expect(stepValue(4000, TIME, 1, { synced: true })).toBe(4000);
  });
});

describe('snapValue', () => {
  it('snaps a synced drag to the centre of the nearest note', () => {
    expect(snapValue(430, TIME, true)).toBe(418);
  });

  it('otherwise snaps to the step', () => {
    expect(snapValue(430.4, TIME)).toBe(430);
  });
});

describe('formatValue', () => {
  it('reads a synced knob as its note, not its ms', () => {
    expect(formatValue(500, TIME)).toBe('500');
    expect(formatValue(500, TIME, true)).toBe('1/2');
  });

  it('keeps the + on a bipolar knob', () => {
    expect(formatValue(20, FEEDBACK)).toBe('+20');
  });
});

describe('entry text', () => {
  it('starts the field from the bare number', () => {
    expect(entryText(20, FEEDBACK)).toBe('20');
    expect(entryText(0.5, RATE)).toBe('0.5');
  });

  it('parses what people type, clamped and snapped', () => {
    expect(parseEntry('70', DRIVE)).toBe(70);
    expect(parseEntry(' 350ms', TIME)).toBe(350);
    expect(parseEntry('0,55 Hz', RATE)).toBeCloseTo(0.6);
    expect(parseEntry('-35', FEEDBACK)).toBe(-35);
    expect(parseEntry('+35', FEEDBACK)).toBe(35);
    expect(parseEntry('250', DRIVE)).toBe(100);
  });

  it('rejects text with no number in it', () => {
    expect(parseEntry('', DRIVE)).toBeNull();
    expect(parseEntry('loud', DRIVE)).toBeNull();
  });
});
