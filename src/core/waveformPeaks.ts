// Pure waveform reduction for the looper timeline: turn a recorded/decoded PCM
// buffer into a small fixed-width array of peak magnitudes the canvas can draw
// directly. No Web Audio, no DOM — just the array math, so it is unit-testable.
//
// Computed ONCE per track when its buffer is finalised, never per frame. A
// 4-minute stereo import is ~20M samples; rescanning that inside a rAF loop
// would drop frames, whereas a few hundred buckets redraw for free.

/** A track's reduced waveform: `peaks[i]` is the loudest magnitude in bucket i. */
export interface Waveform {
  /** abs-peak per bucket, in capture order; length is the requested bucket count */
  peaks: Float32Array;
  /** the largest value in `peaks`, so renderers can normalise without rescanning */
  max: number;
}

/** Buckets per bar of audio. Enough detail to read a strum pattern at lane
 *  height, cheap enough that a long import still reduces instantly. */
export const PEAKS_PER_BAR = 240;

/**
 * Reduce `samples` to `buckets` abs-peak values.
 *
 * Peak (not RMS or average) because the point is *legibility of attacks* — a
 * pick hit has to show up as a spike at lane height, and averaging flattens
 * exactly that. Every sample is visited, so a transient can never fall between
 * buckets the way naive stride-sampling loses it.
 *
 * Returns all-zero peaks for an empty input or a non-positive bucket count.
 */
export function computePeaks(samples: Float32Array, buckets: number): Waveform {
  const count = Math.max(0, Math.floor(buckets));
  const peaks = new Float32Array(count);
  if (count === 0 || samples.length === 0) return { peaks, max: 0 };

  let max = 0;
  // Walk bucket-by-bucket with exact fractional boundaries so the last bucket
  // ends on the final sample; a fixed integer stride would leave a ragged tail.
  for (let i = 0; i < count; i++) {
    const start = Math.floor((i * samples.length) / count);
    const end = Math.max(start + 1, Math.floor(((i + 1) * samples.length) / count));
    let peak = 0;
    for (let j = start; j < end && j < samples.length; j++) {
      const magnitude = Math.abs(samples[j]);
      if (magnitude > peak) peak = magnitude;
    }
    peaks[i] = peak;
    if (peak > max) max = peak;
  }
  return { peaks, max };
}

/**
 * Reduce an AudioBuffer's channels to a single mono peak envelope.
 *
 * Takes the per-sample max ACROSS channels rather than summing them: a stereo
 * import panned hard to one side must not read as half-height, and a summed
 * downmix of out-of-phase channels can cancel to near silence.
 */
export function peaksFromChannels(
  channels: readonly Float32Array[],
  buckets: number,
): Waveform {
  if (channels.length === 0) return computePeaks(new Float32Array(0), buckets);
  if (channels.length === 1) return computePeaks(channels[0], buckets);

  const length = channels[0].length;
  const mono = new Float32Array(length);
  for (const channel of channels) {
    for (let i = 0; i < length && i < channel.length; i++) {
      const magnitude = Math.abs(channel[i]);
      if (magnitude > mono[i]) mono[i] = magnitude;
    }
  }
  return computePeaks(mono, buckets);
}

/**
 * Bucket count for a track spanning `bars`, clamped so a very long import stays
 * bounded and a single bar still gets usable detail.
 */
export function bucketsForBars(bars: number): number {
  const wanted = Math.max(1, Math.round(bars)) * PEAKS_PER_BAR;
  return Math.min(wanted, PEAKS_PER_BAR * 32);
}
