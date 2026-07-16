import { describe, it, expect } from 'vitest';
import {
  slugifyAmpName,
  listAmpCategories,
  findAmpCategoryBySlug,
} from '@/core/ampCategories';

describe('slugifyAmpName', () => {
  it.each([
    ['Marshall® JCM800', 'marshall-jcm800'],
    ["Fender® '65 Twin Reverb", 'fender-65-twin-reverb'],
    ['Mesa/Boogie® Dual Rectifier® (Modern mode)', 'mesa-boogie-dual-rectifier-modern-mode'],
    ['VOX® AC30HW (Drive)', 'vox-ac30hw-drive'],
    ['Peavey® 6505 4x12" cabinet', 'peavey-6505-4x12-cabinet'],
  ])('slugifies %s -> %s', (input, expected) => {
    expect(slugifyAmpName(input)).toBe(expected);
  });
});

describe('listAmpCategories', () => {
  const cats = listAmpCategories();

  it('returns a non-empty list', () => {
    expect(cats.length).toBeGreaterThan(10);
  });

  it('each entry has slug, realName, at least one valetonName', () => {
    for (const c of cats) {
      expect(c.slug).toMatch(/^[a-z0-9-]+$/);
      expect(c.realName.length).toBeGreaterThan(0);
      expect(c.valetonNames.length).toBeGreaterThan(0);
    }
  });

  it('no duplicate slugs', () => {
    const slugs = cats.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});

describe('findAmpCategoryBySlug', () => {
  it('returns undefined for unknown slug', () => {
    expect(findAmpCategoryBySlug('totally-fake-amp-xyz')).toBeUndefined();
  });

  it('finds a known slug (first entry from listAmpCategories)', () => {
    const cats = listAmpCategories();
    const first = cats[0];
    const found = findAmpCategoryBySlug(first.slug);
    expect(found).toEqual(first);
  });
});
