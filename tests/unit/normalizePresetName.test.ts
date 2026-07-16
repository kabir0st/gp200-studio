import { describe, it, expect } from 'vitest';
import { normalizePresetName } from '@/core/normalizePresetName';

describe('normalizePresetName', () => {
  const cases: Array<[string, string]> = [
    ['05-D Metallica', 'Metallica'],
    ['63-A American Idiot', 'American Idiot'],
    ['3-B Clean', 'Clean'],
    ['01-A Cold Gin', 'Cold Gin'],
    ['Metallica', 'Metallica'],
    ['05-DAwesome', '05-DAwesome'],
    ['05-E Weird', '05-E Weird'],
    ['  05-D Metallica  ', 'Metallica'],
  ];

  for (const [input, expected] of cases) {
    it(`"${input}" -> "${expected}"`, () => {
      expect(normalizePresetName(input)).toBe(expected);
    });
  }

  it('is idempotent', () => {
    for (const [input] of cases) {
      const once = normalizePresetName(input);
      const twice = normalizePresetName(once);
      expect(twice).toBe(once);
    }
  });
});
