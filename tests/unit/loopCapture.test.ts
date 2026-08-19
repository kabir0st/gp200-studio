import { describe, it, expect } from 'vitest';
import {
  blendTail,
  snapToZeroCrossing,
  findOnset,
  roundTripSamples,
  planCapture,
  resolveHead,
  capturedFrames,
  guardPreRollFrames,
  LATENCY_TRIM_MAX_MS,
  dbToGain,
  gainToDb,
  clampRecordSettings,
  softClipCurve,
  DEFAULT_RECORD_SETTINGS,
  SOFT_CLIP_KNEE,
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
  it('adds the input and output legs the device reports', () => {
    const samples = roundTripSamples({
      outputLatencySec: 0.01,
      inputLatencySec: 0.02,
      sampleRate: 48000,
    });
    expect(samples).toBe(Math.round(0.03 * 48000));
  });

  it('never goes negative', () => {
    expect(roundTripSamples({
      outputLatencySec: -0.005,
      inputLatencySec: 0.001,
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

describe('masterLevel', () => {
  it('defaults below unity, because stacked takes sum', () => {
    expect(DEFAULT_RECORD_SETTINGS.masterLevel).toBeGreaterThan(0);
    expect(DEFAULT_RECORD_SETTINGS.masterLevel).toBeLessThan(1);
  });

  it('clamps into 0..1 and survives a settings blob written before it existed', () => {
    const loud = clampRecordSettings(DEFAULT_RECORD_SETTINGS, { masterLevel: 4 });
    expect(loud.masterLevel).toBe(1);
    const silent = clampRecordSettings(DEFAULT_RECORD_SETTINGS, { masterLevel: -2 });
    expect(silent.masterLevel).toBe(0);
    // An older persisted blob has no masterLevel at all; the merge must not
    // leave the master gain node holding undefined.
    const legacy = clampRecordSettings(DEFAULT_RECORD_SETTINGS, {
      masterLevel: undefined as unknown as number,
    });
    expect(legacy.masterLevel).toBe(DEFAULT_RECORD_SETTINGS.masterLevel);
  });

  it('keeps a level the user actually picked', () => {
    expect(clampRecordSettings(DEFAULT_RECORD_SETTINGS, { masterLevel: 0.42 }).masterLevel)
      .toBeCloseTo(0.42, 6);
  });
});

describe('softClipCurve', () => {
  /** Read the curve at a given input level, the way a WaveShaper would. */
  const at = (curve: Float32Array, input: number): number => {
    const index = Math.round(((input + 1) / 2) * (curve.length - 1));
    return curve[Math.max(0, Math.min(curve.length - 1, index))];
  };

  it('is bit-transparent below the knee', () => {
    const curve = softClipCurve();
    for (const level of [0, 0.1, 0.3, SOFT_CLIP_KNEE - 0.05]) {
      expect(at(curve, level)).toBeCloseTo(level, 3);
      expect(at(curve, -level)).toBeCloseTo(-level, 3);
    }
  });

  it('never lets the mix exceed full scale', () => {
    const curve = softClipCurve();
    for (const sample of curve) expect(Math.abs(sample)).toBeLessThanOrEqual(1);
    // The endpoint is the ceiling for any input at all: a WaveShaper clamps
    // out-of-range input to it, which is what stops four stacked takes from
    // hard-clipping on the way to the speakers.
    expect(at(curve, 1)).toBeLessThan(1);
    expect(at(curve, 1)).toBeGreaterThan(SOFT_CLIP_KNEE);
  });

  it('rises monotonically, so the bend cannot fold the waveform back on itself', () => {
    const curve = softClipCurve();
    for (let index = 1; index < curve.length; index++) {
      expect(curve[index]).toBeGreaterThanOrEqual(curve[index - 1]);
    }
  });

  it('is odd-symmetric, so it adds no even-order harmonics or DC', () => {
    const curve = softClipCurve();
    for (const level of [0.2, 0.7, 0.95]) {
      expect(at(curve, level)).toBeCloseTo(-at(curve, -level), 6);
    }
  });
});

describe('planCapture', () => {
  const RATE = 48000;
  const BASE = RATE * 2; // one 2 s bar
  const IN = 0.01;
  const OUT = 0.02;

  function grid(trimMs: number, patch: Record<string, unknown> = {}) {
    return planCapture({
      mode: 'grid',
      startFrame: RATE * 10, // a downbeat at t = 10 s
      sampleRate: RATE,
      inputLatencySec: IN,
      outputLatencySec: OUT,
      trimMs,
      againstPlayback: true,
      baseSamples: BASE,
      recordBars: null,
      tailBlendMs: 220,
      ...patch,
    });
  }

  it('puts the loop point a full round trip plus the trim past the downbeat', () => {
    expect(grid(0).loopHeadFrame).toBe(RATE * 10 + Math.round(0.03 * RATE));
    expect(grid(30).loopHeadFrame).toBe(RATE * 10 + Math.round(0.06 * RATE));
    expect(grid(-30).loopHeadFrame).toBe(RATE * 10);
  });

  it('arms a guard ahead of the loop point, so the trim never costs audio', () => {
    // This is the bug: at any trim, the capture window still opens far enough
    // ahead of the loop point that the head can be found inside it.
    for (const trim of [0, 30, 150, -30, -150]) {
      const plan = grid(trim);
      expect(plan.guardFrames).toBeGreaterThan(0);
      expect(plan.armFrame).toBe(plan.loopHeadFrame - plan.guardFrames);
      expect(plan.armFrame).toBeGreaterThanOrEqual(0);
      // the entire trim range fits inside the guard
      expect(plan.guardFrames).toBeGreaterThanOrEqual(
        Math.abs(Math.round((trim / 1000) * RATE)),
      );
    }
  });

  it('keeps a free take exactly the gap between the two presses, whatever the trim', () => {
    // Head is at `loopHeadFrame`; stopRecord pushes the stop edge by the same
    // `offsetFrames`, so the trim cancels between the two edges.
    const pressStop = RATE * 14;
    for (const trim of [0, 30, -100]) {
      const plan = grid(trim);
      const stopFrame = pressStop + plan.offsetFrames;
      expect(stopFrame - plan.loopHeadFrame).toBe(pressStop - RATE * 10);
    }
  });

  it('keeps a fixed-length take exactly recordBars long, whatever the trim', () => {
    for (const trim of [0, 30, -100]) {
      const plan = grid(trim, { recordBars: 2 });
      // the worklet body covers the guard as well as the music
      expect(plan.bodyFrames).toBe(plan.guardFrames + BASE * 2);
      const head = resolveHead(plan.loopHeadFrame, plan.armFrame);
      expect(capturedFrames(plan.bodyFrames, plan.bodyFrames, head)).toBe(BASE * 2);
    }
  });

  it('absorbs a late worklet start into the head instead of rotating the take', () => {
    const plan = grid(30, { recordBars: 2 });
    const late = 512; // the worklet could not honour the whole guard
    const head = resolveHead(plan.loopHeadFrame, plan.armFrame + late);
    expect(head).toBe(plan.guardFrames - late);
    // Over-long by exactly the shortfall, which quantizeToBase rounds back.
    expect(capturedFrames(plan.bodyFrames, plan.bodyFrames, head)).toBe(BASE * 2 + late);
  });

  it('ignores the trim and the output leg when nothing is playing to follow', () => {
    // A take with no reference cannot be "late" against anything, so charging
    // it an output leg or a trim would only rotate it against its own grid.
    const now = planCapture({
      mode: 'now',
      startFrame: RATE * 10,
      sampleRate: RATE,
      inputLatencySec: IN,
      outputLatencySec: OUT,
      trimMs: 30,
      againstPlayback: false,
      baseSamples: null,
      recordBars: null,
      tailBlendMs: 220,
    });
    expect(now.offsetFrames).toBe(Math.round(IN * RATE));
    expect(now.guardFrames).toBe(0);
    expect(now.armFrame).toBe(now.loopHeadFrame);
  });

  it('grid-arms without the output leg when everything is stopped', () => {
    const plan = grid(30, { againstPlayback: false });
    expect(plan.offsetFrames).toBe(Math.round(IN * RATE));
  });

  it('keeps enough tail to cover the guard the head may move across', () => {
    const plan = grid(0);
    expect(plan.tailFrames).toBeGreaterThanOrEqual(
      Math.round(0.22 * RATE) + plan.guardFrames,
    );
  });
});

describe('guardPreRollFrames', () => {
  it('covers the whole trim range when the bar is long enough', () => {
    expect(guardPreRollFrames(48000, 48000 * 2))
      .toBe(Math.round((LATENCY_TRIM_MAX_MS / 1000) * 48000));
  });

  it('caps at a quarter bar, so a fast locked tempo cannot misround a take', () => {
    // 240 BPM, one beat per bar => 0.25 s. A flat 150 ms guard here would push
    // the capture past half a bar and quantizeToBase would call it two bars.
    const base = Math.round(0.25 * 48000);
    expect(guardPreRollFrames(48000, base)).toBe(Math.floor(base / 4));
  });

  it('falls back to the full range with no bar yet', () => {
    expect(guardPreRollFrames(48000, null))
      .toBe(Math.round((LATENCY_TRIM_MAX_MS / 1000) * 48000));
  });
});
