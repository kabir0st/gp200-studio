import { describe, it, expect } from 'vitest';
import { describeScope, slotsForScope } from '../../src/core/bulkApply';

describe('slotsForScope', () => {
  it('expands "all" to every slot in order', () => {
    const slots = slotsForScope({ kind: 'all' });
    expect(slots).toHaveLength(256);
    expect(slots[0]).toBe(0);
    expect(slots[255]).toBe(255);
  });

  it('expands a bank range to its 4-slot banks (1-based, inclusive)', () => {
    expect(slotsForScope({ kind: 'banks', fromBank: 1, toBank: 1 })).toEqual([0, 1, 2, 3]);
    expect(slotsForScope({ kind: 'banks', fromBank: 3, toBank: 4 })).toEqual([
      8, 9, 10, 11, 12, 13, 14, 15,
    ]);
    expect(slotsForScope({ kind: 'banks', fromBank: 64, toBank: 64 })).toEqual([
      252, 253, 254, 255,
    ]);
  });

  it('clamps out-of-range banks and swaps reversed bounds', () => {
    expect(slotsForScope({ kind: 'banks', fromBank: -5, toBank: 1 })).toEqual([0, 1, 2, 3]);
    expect(slotsForScope({ kind: 'banks', fromBank: 99, toBank: 64 })).toEqual([
      252, 253, 254, 255,
    ]);
    expect(slotsForScope({ kind: 'banks', fromBank: 2, toBank: 1 })).toEqual(
      slotsForScope({ kind: 'banks', fromBank: 1, toBank: 2 }),
    );
  });
});

describe('describeScope', () => {
  it('summarizes the target set for confirmation UI', () => {
    expect(describeScope({ kind: 'all' })).toBe('all 256 patches');
    expect(describeScope({ kind: 'banks', fromBank: 3, toBank: 3 })).toBe(
      'bank 3 (4 patches)',
    );
    expect(describeScope({ kind: 'banks', fromBank: 7, toBank: 3 })).toBe(
      'banks 3–7 (20 patches)',
    );
  });
});
