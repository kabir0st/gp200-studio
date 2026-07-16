import { describe, it, expect } from 'vitest';
import { BufferGenerator } from '@/core/BufferGenerator';

describe('BufferGenerator', () => {
  it('writes a byte and returns correct buffer', () => {
    const gen = new BufferGenerator(4);
    gen.writeUint8(0, 0xab);
    expect(gen.toUint8Array()[0]).toBe(0xab);
  });

  it('writes an ASCII string (null-padded)', () => {
    const gen = new BufferGenerator(6);
    gen.writeAscii(0, 'GP', 4);
    const arr = gen.toUint8Array();
    expect(arr[0]).toBe(0x47); // 'G'
    expect(arr[1]).toBe(0x50); // 'P'
    expect(arr[2]).toBe(0x00); // null-pad
    expect(arr[3]).toBe(0x00); // null-pad
  });

  it('throws RangeError on out-of-bounds write', () => {
    const gen = new BufferGenerator(2);
    expect(() => gen.writeUint8(5, 0xff)).toThrow(RangeError);
  });

  it('writes a uint16 little-endian correctly', () => {
    const gen = new BufferGenerator(4);
    gen.writeUint16LE(0, 0x1234);
    const arr = gen.toUint8Array();
    expect(arr[0]).toBe(0x34); // low byte first
    expect(arr[1]).toBe(0x12); // high byte second
  });

  it('throws RangeError when writeUint16LE spans past end', () => {
    const gen = new BufferGenerator(3);
    expect(() => gen.writeUint16LE(2, 0x00)).toThrow(RangeError); // only 1 byte left
  });
});
