import { describe, it, expect } from 'vitest';
import { createZip, crc32 } from '@/core/zipStore';

function u16(bytes: Uint8Array, off: number): number {
  return bytes[off] | (bytes[off + 1] << 8);
}
function u32(bytes: Uint8Array, off: number): number {
  return (bytes[off] | (bytes[off + 1] << 8) | (bytes[off + 2] << 16)) + bytes[off + 3] * 0x1000000;
}

describe('crc32', () => {
  it('matches the known-answer value for "123456789"', () => {
    // The canonical CRC-32 check value (IEEE 802.3 polynomial).
    const data = new TextEncoder().encode('123456789');
    expect(crc32(data)).toBe(0xCBF43926);
  });

  it('returns 0 for empty input', () => {
    expect(crc32(new Uint8Array(0))).toBe(0);
  });
});

describe('createZip', () => {
  const entryA = { name: 'a.prst', data: new Uint8Array([1, 2, 3, 4]) };
  const entryB = { name: 'dir/b.prst', data: new Uint8Array([5, 6]) };

  it('writes a local header per entry with STORE method and correct sizes', () => {
    const zip = createZip([entryA, entryB]);
    // First local header at 0
    expect(u32(zip, 0)).toBe(0x04034B50);
    expect(u16(zip, 8)).toBe(0);                      // method STORE
    expect(u32(zip, 14)).toBe(crc32(entryA.data));
    expect(u32(zip, 18)).toBe(4);                     // compressed size
    expect(u32(zip, 22)).toBe(4);                     // uncompressed size
    expect(u16(zip, 26)).toBe('a.prst'.length);
    // Filename + data follow the 30-byte header
    const name = new TextDecoder().decode(zip.subarray(30, 30 + 6));
    expect(name).toBe('a.prst');
    expect(Array.from(zip.subarray(36, 40))).toEqual([1, 2, 3, 4]);
    // Second local header directly after
    expect(u32(zip, 40)).toBe(0x04034B50);
  });

  it('writes a central directory and EOCD with correct counts and offsets', () => {
    const zip = createZip([entryA, entryB]);
    const eocdOff = zip.length - 22;
    expect(u32(zip, eocdOff)).toBe(0x06054B50);
    expect(u16(zip, eocdOff + 8)).toBe(2);            // entries on disk
    expect(u16(zip, eocdOff + 10)).toBe(2);           // total entries
    const centralOff = u32(zip, eocdOff + 16);
    const centralSize = u32(zip, eocdOff + 12);
    expect(centralOff + centralSize + 22).toBe(zip.length);
    // First central header points back at local header 0
    expect(u32(zip, centralOff)).toBe(0x02014B50);
    expect(u32(zip, centralOff + 42)).toBe(0);
    // Second central header points at the second local header
    const secondCentral = centralOff + 46 + 'a.prst'.length;
    expect(u32(zip, secondCentral)).toBe(0x02014B50);
    expect(u32(zip, secondCentral + 42)).toBe(40);
  });

  it('handles an empty entry list', () => {
    const zip = createZip([]);
    expect(zip.length).toBe(22);
    expect(u32(zip, 0)).toBe(0x06054B50);
    expect(u16(zip, 8)).toBe(0);
  });
});
