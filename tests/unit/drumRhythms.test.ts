import { describe, it, expect } from 'vitest';
import { DRUM_RHYTHMS, groupDrumRhythms } from '../../src/core/drumRhythms';

describe('DRUM_RHYTHMS', () => {
  it('has exactly 100 entries with contiguous indexes matching positions', () => {
    expect(DRUM_RHYTHMS).toHaveLength(100);
    DRUM_RHYTHMS.forEach((rhythm, index) => {
      expect(rhythm.index).toBe(index);
    });
  });

  it('has a well-formed time signature on every entry', () => {
    for (const rhythm of DRUM_RHYTHMS) {
      expect(rhythm.signature).toMatch(/^\d+\/\d+$/);
      expect(rhythm.name.length).toBeGreaterThan(0);
    }
  });

  it('spot-checks entries against the extracted gp2-controller table', () => {
    expect(DRUM_RHYTHMS[0]).toEqual({ index: 0, name: 'Classic Rock 1', signature: '4/4' });
    expect(DRUM_RHYTHMS[8]).toEqual({ index: 8, name: 'Hard Rock 3', signature: '3/4' });
    expect(DRUM_RHYTHMS[42]).toEqual({ index: 42, name: 'Shuffle', signature: '3/4' });
    expect(DRUM_RHYTHMS[78]).toEqual({ index: 78, name: 'Polka', signature: '2/4' });
    expect(DRUM_RHYTHMS[99]).toEqual({ index: 99, name: '8/9', signature: '8/9' });
  });
});

describe('groupDrumRhythms', () => {
  it('covers all 100 rhythms exactly once', () => {
    const groups = groupDrumRhythms();
    const seenIndexes = new Set<number>();
    for (const group of groups) {
      for (const rhythm of group.rhythms) {
        expect(seenIndexes.has(rhythm.index)).toBe(false);
        seenIndexes.add(rhythm.index);
      }
    }
    expect(seenIndexes.size).toBe(100);
  });

  it('collapses numbered variants into one family', () => {
    const groups = groupDrumRhythms();
    const classicRock = groups.find((group) => group.label === 'Classic Rock');
    expect(classicRock).toBeDefined();
    expect(classicRock!.rhythms.map((rhythm) => rhythm.index)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('leaves slash-suffixed names intact instead of mangling them', () => {
    const groups = groupDrumRhythms();
    const labels = groups.map((group) => group.label);
    expect(labels).toContain('Rock 5/4');
    expect(labels).toContain('Shuffle 3/4');
    expect(labels).toContain('4/4');
    expect(labels).not.toContain('Rock 5/');
  });
});
