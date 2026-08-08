import { describe, it, expect } from 'vitest';
import {
  secondsToSamples,
  samplesToSeconds,
  barsForCapture,
  quantizeToBase,
  cycleBars,
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

describe('barsForCapture', () => {
  const base = 96000; // one bar = 2s @ 48k

  it('rounds a slight overrun back down rather than growing the loop', () => {
    // A ringing last chord must not double everyone else's loop.
    expect(barsForCapture(base + 4000, base)).toBe(1);
    expect(barsForCapture(base * 1.4, base)).toBe(1);
  });

  it('rounds a genuine overrun up to the next bar', () => {
    expect(barsForCapture(base * 1.6, base)).toBe(2);
    expect(barsForCapture(base * 2, base)).toBe(2);
    expect(barsForCapture(base * 3.9, base)).toBe(4);
  });

  it('never returns fewer than one bar', () => {
    expect(barsForCapture(1000, base)).toBe(1);
    expect(barsForCapture(0, base)).toBe(1);
  });

  it('returns one bar when no base is established yet', () => {
    expect(barsForCapture(50000, 0)).toBe(1);
  });
});

describe('quantizeToBase', () => {
  const base = 96000; // 2s @ 48k

  it('snaps a near-base capture to exactly one bar', () => {
    expect(quantizeToBase(97000, base)).toEqual({ bars: 1, samples: 96000 });
  });

  it('snaps a ~2x capture to two whole bars', () => {
    expect(quantizeToBase(191000, base)).toEqual({ bars: 2, samples: 192000 });
  });

  it('never returns fewer than one bar', () => {
    expect(quantizeToBase(1000, base)).toEqual({ bars: 1, samples: 96000 });
  });

  it('passes a capture through untouched when it is establishing the base', () => {
    expect(quantizeToBase(50000, 0)).toEqual({ bars: 1, samples: 50000 });
  });
});

describe('cycleBars', () => {
  it('is the widest track present', () => {
    expect(cycleBars([1, 4, 2])).toBe(4);
  });

  it('shrinks back when the widest track is removed', () => {
    // Derived, not a running max — deleting the 4-bar take narrows the loop.
    expect(cycleBars([1, 2])).toBe(2);
  });

  it('is one bar with no tracks at all', () => {
    expect(cycleBars([])).toBe(1);
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
