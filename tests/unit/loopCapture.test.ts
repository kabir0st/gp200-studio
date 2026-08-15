import { describe, it, expect } from 'vitest';
import {
  blendTail,
  snapToZeroCrossing,
  findOnset,
  roundTripSamples,
  dbToGain,
  gainToDb,
  clampRecordSettings,
  DEFAULT_RECORD_SETTINGS,
  SILENCE_FLOOR,
} from '@/core/loopCapture';

describe('blendTail', () => {
  it('leaves the downbeat at full gain and decays the tail over it', () => {
    // The whole point: a loop's first sample must not be attenuated, because
    // that is the transient the loop is built around.
    const body = new Float32Array([1, 0.5, 0.25, 0.1]);
    const tail = new Float32Array([0.4, 0.4, 0.4, 0.4]);
    blendTail(body, tail);
    expect(body[0]).toBeCloseTo(1 + 0.4, 6); // window is exactly 1 at the join
    expect(body[3]).toBeGreaterThan(0.1); // still some tail left
  });

  it('decays monotonically to zero across the blend', () => {
    const body = new Float32Array(8);
    const tail = new Float32Array(8).fill(1);
    blendTail(body, tail);
    for (let i = 1; i < body.length; i++) {
      expect(body[i]).toBeLessThan(body[i - 1]);
    }
    expect(body[0]).toBeCloseTo(1, 6);
    // Raised cosine: zero slope at both ends, so the last sample is nearly out.
    expect(body[body.length - 1]).toBeLessThan(0.05);
  });

  it('blends only as far as the shorter side and reports the count', () => {
    const body = new Float32Array(4);
    expect(blendTail(body, new Float32Array(100))).toBe(4);
    expect(blendTail(body, new Float32Array(0))).toBe(0);
    expect(blendTail(new Float32Array(0), new Float32Array(4))).toBe(0);
  });
});

describe('snapToZeroCrossing', () => {
  it('finds the nearest sign change', () => {
    const samples = new Float32Array([-0.5, -0.2, 0.3, 0.9, 0.4]);
    expect(snapToZeroCrossing(samples, 3, 4)).toBe(2);
  });

  it('prefers a crossing after the index when it is closer', () => {
    const samples = new Float32Array([0.9, 0.8, 0.7, -0.1, -0.5]);
    expect(snapToZeroCrossing(samples, 2, 4)).toBe(3);
  });

  it('falls back to the quietest sample when nothing crosses', () => {
    const samples = new Float32Array([0.5, 0.4, 0.01, 0.4, 0.5]);
    expect(snapToZeroCrossing(samples, 0, 4)).toBe(2);
  });

  it('handles an empty buffer and a zero radius', () => {
    expect(snapToZeroCrossing(new Float32Array(0), 5, 10)).toBe(0);
    expect(snapToZeroCrossing(new Float32Array([0.5, 0.5]), 1, 0)).toBe(1);
  });
});

describe('findOnset', () => {
  it('walks back over the attack ramp instead of cutting into it', () => {
    // Silence, then a ramp into a loud note. A detector firing at the loud
    // sample must not become the loop's first sample , that clips the pick.
    const samples = new Float32Array(40);
    for (let i = 20; i < 40; i++) samples[i] = (i - 20) / 20;
    const onset = findOnset(samples, {
      triggerIndex: 30,
      floor: SILENCE_FLOOR,
      maxBackoff: 30,
      snapRadius: 2,
    });
    expect(onset).toBeLessThanOrEqual(21);
    expect(onset).toBeGreaterThanOrEqual(19);
  });

  it('does not walk back further than the backoff allows', () => {
    const samples = new Float32Array(40).fill(0.5);
    const onset = findOnset(samples, {
      triggerIndex: 30,
      floor: SILENCE_FLOOR,
      maxBackoff: 5,
      snapRadius: 0,
    });
    expect(onset).toBe(25);
  });
});

describe('roundTripSamples', () => {
  it('adds input, output and the user trim', () => {
    const samples = roundTripSamples({
      outputLatencySec: 0.01,
      inputLatencySec: 0.02,
      trimMs: 5,
      sampleRate: 48000,
    });
    expect(samples).toBe(Math.round(0.035 * 48000));
  });

  it('never goes negative, however far the trim is pulled back', () => {
    expect(roundTripSamples({
      outputLatencySec: 0.005,
      inputLatencySec: 0.005,
      trimMs: -150,
      sampleRate: 48000,
    })).toBe(0);
  });
});

describe('dB conversion', () => {
  it('round-trips through gain', () => {
    expect(gainToDb(dbToGain(-34))).toBeCloseTo(-34, 6);
    expect(dbToGain(0)).toBe(1);
    expect(dbToGain(-6)).toBeCloseTo(0.5012, 3);
  });

  it('maps silence to -Infinity rather than NaN', () => {
    expect(gainToDb(0)).toBe(-Infinity);
  });
});

describe('clampRecordSettings', () => {
  it('keeps every field inside its range', () => {
    const next = clampRecordSettings(DEFAULT_RECORD_SETTINGS, {
      latencyTrimMs: 9999,
      tailBlendMs: -50,
      triggerDb: 40,
    });
    expect(next.latencyTrimMs).toBe(150);
    expect(next.tailBlendMs).toBe(0);
    expect(next.triggerDb).toBe(-6);
  });

  it('treats a bar count below one as free running', () => {
    expect(clampRecordSettings(DEFAULT_RECORD_SETTINGS, { recordBars: 0 }).recordBars).toBeNull();
    expect(clampRecordSettings(DEFAULT_RECORD_SETTINGS, { recordBars: 4 }).recordBars).toBe(4);
    expect(clampRecordSettings(DEFAULT_RECORD_SETTINGS, { recordBars: null }).recordBars).toBeNull();
  });

  it('survives junk from an older or corrupted store', () => {
    const next = clampRecordSettings(DEFAULT_RECORD_SETTINGS, {
      latencyTrimMs: Number.NaN,
      triggerDb: Number.POSITIVE_INFINITY,
      autoStart: undefined as unknown as boolean,
    });
    expect(next.latencyTrimMs).toBe(DEFAULT_RECORD_SETTINGS.latencyTrimMs);
    expect(next.triggerDb).toBe(DEFAULT_RECORD_SETTINGS.triggerDb);
    expect(next.autoStart).toBe(false);
  });
});
