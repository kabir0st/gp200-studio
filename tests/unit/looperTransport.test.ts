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
  barSecondsFromTempo,
  frameAtTime,
  boundaryForPress,
  cyclePhaseSurvives,
  anchorFromCapture,
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
    // Derived, not a running max , deleting the 4-bar take narrows the loop.
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

describe('barSecondsFromTempo', () => {
  it('gives one 4/4 bar at 120 BPM as two seconds', () => {
    expect(barSecondsFromTempo(120, 4)).toBeCloseTo(2, 9);
  });

  it('follows the signature: 3/4 is three quarter-note beats', () => {
    expect(barSecondsFromTempo(120, 3)).toBeCloseTo(1.5, 9);
  });

  it('guards nonsense tempos instead of returning Infinity', () => {
    expect(barSecondsFromTempo(0, 4)).toBe(0);
    expect(barSecondsFromTempo(120, 0)).toBe(0);
  });
});

describe('frameAtTime', () => {
  it('converts a scheduled time to the frame the worklet compares against', () => {
    expect(frameAtTime(1.5, 48000)).toBe(72000);
  });

  it('rounds to the nearest frame and clamps below zero', () => {
    expect(frameAtTime(1 + 0.6 / 48000, 48000)).toBe(48001);
    expect(frameAtTime(-3, 48000)).toBe(0);
  });
});

describe('boundaryForPress', () => {
  // A 2 s cycle anchored at 10, with a 40 ms output leg. The player hears the
  // downbeat at 12.04, so a press "just before" it sits at ~12.02 on the
  // scheduling clock , already past it.
  const anchor = 10;
  const cycle = 2;
  const out = 0.04;

  it('catches the downbeat the player is reaching for, not the next one', () => {
    expect(boundaryForPress(12.02, out, anchor, cycle)).toBeCloseTo(12, 9);
    // nextBoundary alone is exactly the bug: a whole cycle late.
    expect(nextBoundary(12.02, anchor, cycle)).toBeCloseTo(14, 9);
  });

  it('still arms the next downbeat from the middle of a cycle', () => {
    expect(boundaryForPress(13, out, anchor, cycle)).toBeCloseTo(14, 9);
  });

  it('ignores a negative reported latency', () => {
    expect(boundaryForPress(13, -1, anchor, cycle)).toBeCloseTo(14, 9);
  });
});

describe('cyclePhaseSurvives', () => {
  it('keeps a track whose length divides both widths', () => {
    expect(cyclePhaseSurvives(1, 1, 2)).toBe(true);
    expect(cyclePhaseSurvives(1, 2, 4)).toBe(true);
    expect(cyclePhaseSurvives(2, 4, 8)).toBe(true);
    // shrinking back down, which is what an undo does
    expect(cyclePhaseSurvives(1, 2, 1)).toBe(true);
  });

  it('relaunches a track whose tiling was, or becomes, a partial repeat', () => {
    expect(cyclePhaseSurvives(3, 4, 8)).toBe(false);
    expect(cyclePhaseSurvives(4, 4, 6)).toBe(false);
  });

  it('fails toward relaunching on nonsense bar counts', () => {
    expect(cyclePhaseSurvives(1, 0, 2)).toBe(false);
    expect(cyclePhaseSurvives(0, 1, 2)).toBe(false);
    expect(cyclePhaseSurvives(1, 1, 0)).toBe(false);
  });
});

describe('anchorFromCapture', () => {
  it('places the grid a full round trip before the captured head', () => {
    expect(anchorFromCapture(48000, 48000, 0.01, 0.02)).toBeCloseTo(0.97, 9);
  });
});
