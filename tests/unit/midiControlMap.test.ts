import { describe, it, expect } from 'vitest';
import {
  decodeControlChange,
  EXP_CC,
  FS_CC_MAP,
  FS_ON_THRESHOLD,
} from '@/core/midiControlMap';

// NOTE: the CC constants are placeholders pending a USB capture. These tests
// exercise the decode LOGIC against whatever the constants currently are, so
// they keep passing when the captured numbers are filled in — and lock the
// EXP-vs-footswitch routing + on/off threshold behavior against regression.

describe('decodeControlChange', () => {
  it('decodes an EXP-pedal position from its CC', () => {
    expect(decodeControlChange([0xb0, EXP_CC, 100])).toEqual({ kind: 'exp', value: 100 });
    expect(decodeControlChange([0xb0, EXP_CC, 0])).toEqual({ kind: 'exp', value: 0 });
  });

  it('ignores the running MIDI channel in the status nibble', () => {
    expect(decodeControlChange([0xb5, EXP_CC, 64])).toEqual({ kind: 'exp', value: 64 });
  });

  it('decodes a footswitch press/release with the on/off threshold', () => {
    const [cc, fs] = [...FS_CC_MAP.entries()][0];
    expect(decodeControlChange([0xb0, cc, 127])).toEqual({ kind: 'footswitch', fsNumber: fs, state: true });
    expect(decodeControlChange([0xb0, cc, FS_ON_THRESHOLD])).toEqual({ kind: 'footswitch', fsNumber: fs, state: true });
    expect(decodeControlChange([0xb0, cc, FS_ON_THRESHOLD - 1])).toEqual({ kind: 'footswitch', fsNumber: fs, state: false });
  });

  it('returns null for non-Control-Change and unmapped CCs', () => {
    // Pick a CC that is neither EXP nor any mapped footswitch, whatever the
    // (placeholder) constants currently are.
    let unmapped = 0;
    while (unmapped === EXP_CC || FS_CC_MAP.has(unmapped)) unmapped++;
    expect(decodeControlChange([0xf0, 0x21, 0x25])).toBeNull(); // SysEx
    expect(decodeControlChange([0x90, 60, 100])).toBeNull(); // Note On
    expect(decodeControlChange([0xb0, unmapped, 100])).toBeNull(); // unmapped CC
    expect(decodeControlChange([0xb0, EXP_CC])).toBeNull(); // truncated
  });
});
