import { describe, it, expect } from 'vitest';
import {
  secondsToSamples,
  samplesToSeconds,
  quantizeToMaster,
  nextBoundary,
  loopIndex,
  playhead,
} from '@/core/looperTransport';

describe('sample/second conversion', () => {
  it('round-trips a whole-sample duration', () => {
    expect(secondsToSamples(2, 48000)).toBe(96000);
    expect(samplesToSeconds(96000, 48000)).toBe(2);
  });

  it('rounds fractional samples and guards a zero rate', () => {
    expect(secondsToSamples(1.00001, 48000)).toBe(48000);
    expect(samplesToSeconds(100, 0)).toBe(0);
  });
});

describe('quantizeToMaster', () => {
  const master = 96000; // 2s @ 48k

  it('snaps a near-master capture to exactly one loop', () => {
    expect(quantizeToMaster(97000, master)).toEqual({ loops: 1, samples: 96000 });
  });

  it('snaps a ~2x capture to two whole loops', () => {
    expect(quantizeToMaster(191000, master)).toEqual({ loops: 2, samples: 192000 });
  });

  it('never returns fewer than one loop', () => {
    expect(quantizeToMaster(1000, master)).toEqual({ loops: 1, samples: 96000 });
  });

  it('falls back safely when there is no master yet', () => {
    expect(quantizeToMaster(50000, 0)).toEqual({ loops: 1, samples: 50000 });
  });
});

describe('nextBoundary', () => {
  it('returns a time strictly after now that lands on a boundary', () => {
    const start = 10;
    const dur = 2;
    const now = 13; // 1.5 loops in
    const boundary = nextBoundary(now, start, dur);
    expect(boundary).toBe(14); // start + 2 whole loops
    expect(boundary).toBeGreaterThan(now);
    expect((boundary - start) % dur).toBeCloseTo(0, 9);
  });

  it('returns the start when now precedes the transport', () => {
    expect(nextBoundary(5, 10, 2)).toBe(10);
  });

  it('stays on the current boundary when already aligned', () => {
    expect(nextBoundary(14, 10, 2)).toBe(14);
  });
});

describe('loopIndex', () => {
  it('counts whole loops since the start', () => {
    expect(loopIndex(10, 10, 2)).toBe(0);
    expect(loopIndex(13, 10, 2)).toBe(1);
    expect(loopIndex(16.5, 10, 2)).toBe(3);
  });
});

describe('playhead', () => {
  it('wraps 0..1 across a loop and clamps before the start', () => {
    expect(playhead(5, 10, 2)).toBe(0);
    expect(playhead(10, 10, 2)).toBe(0);
    expect(playhead(11, 10, 2)).toBeCloseTo(0.5, 9);
    expect(playhead(13.9, 10, 2)).toBeCloseTo(0.95, 9);
  });

  it('resets to ~0 at the next boundary', () => {
    expect(playhead(14, 10, 2)).toBeCloseTo(0, 9);
  });
});
