import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  presetNameCacheKey,
  loadCachedNames,
  saveCachedNames,
  TOTAL_SLOTS,
} from '@/core/presetNameCache';

function makeNames(fill: (i: number) => string | null): (string | null)[] {
  return Array.from({ length: TOTAL_SLOTS }, (_v, i) => fill(i));
}

describe('presetNameCacheKey', () => {
  it('combines deviceType and port name', () => {
    expect(presetNameCacheKey(3, 'GP-200')).toBe('gp200:names:3:GP-200');
  });

  it('falls back to "unknown" for a null port name', () => {
    expect(presetNameCacheKey(3, null)).toBe('gp200:names:3:unknown');
  });
});

describe('saveCachedNames / loadCachedNames', () => {
  const key = presetNameCacheKey(3, 'GP-200');

  beforeEach(() => {
    localStorage.clear();
  });

  it('round-trips a full name list', () => {
    const names = makeNames((i) => (i % 2 === 0 ? `Patch ${i}` : null));
    saveCachedNames(key, names);
    expect(loadCachedNames(key)).toEqual(names);
  });

  it('returns null on a cache miss', () => {
    expect(loadCachedNames('gp200:names:9:none')).toBeNull();
  });

  it('rejects a malformed (non-JSON) payload', () => {
    localStorage.setItem(key, 'not json{');
    expect(loadCachedNames(key)).toBeNull();
  });

  it('rejects an array that is the wrong length', () => {
    localStorage.setItem(key, JSON.stringify({ v: 1, updatedAt: 0, names: ['a', 'b'] }));
    expect(loadCachedNames(key)).toBeNull();
  });

  it('rejects entries that are neither string nor null', () => {
    const names: unknown[] = makeNames(() => null);
    names[5] = 42;
    localStorage.setItem(key, JSON.stringify({ v: 1, updatedAt: 0, names }));
    expect(loadCachedNames(key)).toBeNull();
  });

  it('discards a cache written under a different version', () => {
    const names = makeNames(() => 'x');
    localStorage.setItem(key, JSON.stringify({ v: 999, updatedAt: 0, names }));
    expect(loadCachedNames(key)).toBeNull();
  });

  it('does not throw when localStorage.setItem fails (quota/private mode)', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError');
    });
    expect(() => saveCachedNames(key, makeNames(() => 'x'))).not.toThrow();
    spy.mockRestore();
  });

  it('returns null when localStorage.getItem throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('SecurityError');
    });
    expect(loadCachedNames(key)).toBeNull();
    spy.mockRestore();
  });
});
