import { describe, it, expect } from 'vitest';
import {
  computePeaks,
  peaksFromChannels,
  bucketsForBars,
  PEAKS_PER_BAR,
} from '@/core/waveformPeaks';

/** A ramp 0..1 across `n` samples , predictable per-bucket maxima. */
function ramp(n: number): Float32Array {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = i / (n - 1);
  return out;
}

describe('computePeaks', () => {
  it('returns exactly the requested bucket count', () => {
    expect(computePeaks(ramp(1000), 64).peaks).toHaveLength(64);
  });

  it('takes the loudest magnitude in each bucket, not an average', () => {
    // 100 samples, 2 buckets: the second half's max is the final sample (1.0),
    // an average would report ~0.75.
    const { peaks, max } = computePeaks(ramp(100), 2);
    expect(peaks[1]).toBeCloseTo(1, 5);
    expect(max).toBeCloseTo(1, 5);
  });

  it('reports magnitude, so a negative-going transient still shows', () => {
    const samples = new Float32Array([0, 0, -0.9, 0]);
    expect(computePeaks(samples, 1).peaks[0]).toBeCloseTo(0.9, 5);
  });

  it('never lets a lone transient fall between buckets', () => {
    // One spike in a long silent buffer must survive the reduction, which is
    // exactly what stride-sampling instead of a full scan would lose.
    const samples = new Float32Array(10_000);
    samples[7777] = 1;
    const { peaks, max } = computePeaks(samples, 32);
    expect(max).toBe(1);
    expect(peaks.filter((p) => p > 0)).toHaveLength(1);
  });

  it('covers the final sample in the last bucket', () => {
    const samples = new Float32Array(999);
    samples[998] = 1;
    expect(computePeaks(samples, 10).max).toBe(1);
  });

  it('handles empty input and a zero bucket count', () => {
    expect(computePeaks(new Float32Array(0), 8)).toEqual({
      peaks: new Float32Array(8),
      max: 0,
    });
    expect(computePeaks(ramp(100), 0).peaks).toHaveLength(0);
  });
});

describe('peaksFromChannels', () => {
  it('passes a mono channel straight through', () => {
    const mono = ramp(200);
    expect(peaksFromChannels([mono], 16)).toEqual(computePeaks(mono, 16));
  });

  it('takes the max across channels so a hard-panned import is full height', () => {
    const silent = new Float32Array(100);
    const loud = new Float32Array(100).fill(1);
    expect(peaksFromChannels([loud, silent], 4).max).toBe(1);
  });

  it('does not cancel out-of-phase channels the way a sum would', () => {
    const positive = new Float32Array(100).fill(0.8);
    const negative = new Float32Array(100).fill(-0.8);
    expect(peaksFromChannels([positive, negative], 4).max).toBeCloseTo(0.8, 5);
  });

  it('returns silence for no channels', () => {
    expect(peaksFromChannels([], 8).max).toBe(0);
  });
});

describe('bucketsForBars', () => {
  it('scales detail with the bar count', () => {
    expect(bucketsForBars(1)).toBe(PEAKS_PER_BAR);
    expect(bucketsForBars(4)).toBe(PEAKS_PER_BAR * 4);
  });

  it('clamps a very long import so the reduction stays bounded', () => {
    expect(bucketsForBars(500)).toBe(PEAKS_PER_BAR * 32);
  });

  it('never drops below one bar of detail', () => {
    expect(bucketsForBars(0)).toBe(PEAKS_PER_BAR);
  });
});
