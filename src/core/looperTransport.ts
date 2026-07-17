// Pure timing math for the multi-track looper. Framework-agnostic: no Web Audio,
// no React, just the sample/second arithmetic that keeps tracks phase-locked.
//
// Model: the first recorded track sets the MASTER loop length. Every later track
// is quantized to a whole multiple of that master length and launched on the next
// loop boundary, so all AudioBufferSourceNodes share the same loopEnd and stay
// sample-aligned indefinitely. These helpers are unit-tested against that model.

/** Seconds → whole samples (rounded) at the given rate. */
export function secondsToSamples(seconds: number, sampleRate: number): number {
  return Math.round(seconds * sampleRate);
}

/** Samples → seconds at the given rate. */
export function samplesToSeconds(samples: number, sampleRate: number): number {
  return sampleRate > 0 ? samples / sampleRate : 0;
}

/**
 * Snap a freshly captured length to a whole number of master loops (minimum 1).
 * Returns both the loop count and the quantized sample length so later tracks
 * line up exactly with the master. `masterSamples` must be > 0.
 */
export function quantizeToMaster(
  capturedSamples: number,
  masterSamples: number,
): { loops: number; samples: number } {
  if (masterSamples <= 0) return { loops: 1, samples: Math.max(0, Math.round(capturedSamples)) };
  const loops = Math.max(1, Math.round(capturedSamples / masterSamples));
  return { loops, samples: loops * masterSamples };
}

/**
 * The next loop boundary at or after `now`. Used to schedule a new track/overdub
 * so it begins exactly on a downbeat. Returns `now` itself when already on a
 * boundary (within a sample of one). Falls back to `now` for a non-positive
 * duration.
 */
export function nextBoundary(now: number, transportStart: number, loopDuration: number): number {
  if (loopDuration <= 0) return now;
  const elapsed = now - transportStart;
  if (elapsed <= 0) return transportStart;
  const boundary = Math.ceil(elapsed / loopDuration - 1e-9);
  return transportStart + boundary * loopDuration;
}

/** Integer loop number since the transport started (0 before the first wrap). */
export function loopIndex(now: number, transportStart: number, loopDuration: number): number {
  if (loopDuration <= 0) return 0;
  return Math.max(0, Math.floor((now - transportStart) / loopDuration));
}

/** Playhead position 0..1 within the current master loop. Clamped for now < start. */
export function playhead(now: number, transportStart: number, loopDuration: number): number {
  if (loopDuration <= 0) return 0;
  const elapsed = now - transportStart;
  if (elapsed <= 0) return 0;
  const phase = (elapsed % loopDuration) / loopDuration;
  return phase < 0 ? 0 : phase;
}
