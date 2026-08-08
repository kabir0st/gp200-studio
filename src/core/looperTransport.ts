// Pure timing math for the multi-track looper. Framework-agnostic: no Web Audio,
// no React, just the sample/second arithmetic that keeps tracks phase-locked.
//
// Model — two distinct lengths, do not conflate them:
//
//   BASE   one "bar": the unit every track is measured in. Set once, by the
//          first thing that lands (an imported file's own length, or the first
//          recorded take if you record before importing). Never changes after.
//   CYCLE  the visible loop: `base * cycleBars`, where cycleBars is the LARGEST
//          bar count across all tracks. It GROWS when a take rounds past it, and
//          only ever shrinks when the track that was holding it wide is deleted.
//
// Each track is stored at its own whole-bar length and loops on its own, so a
// 1-bar track under a 4-bar cycle simply repeats four times per cycle with no
// rescheduling. That is why growth is cheap: widening the cycle changes what the
// UI draws and what later takes quantize against, but not the already-playing
// sources.
//
// Bar counts round to NEAREST (see barsForCapture), so an overrun of up to half
// a bar snaps back and is trimmed rather than doubling the loop.

/** Seconds → whole samples (rounded) at the given rate. */
export function secondsToSamples(seconds: number, sampleRate: number): number {
  return Math.round(seconds * sampleRate);
}

/** Samples → seconds at the given rate. */
export function samplesToSeconds(samples: number, sampleRate: number): number {
  return sampleRate > 0 ? samples / sampleRate : 0;
}

/**
 * Whole bars a freshly captured length spans, rounded to NEAREST (minimum 1).
 *
 * Round-to-nearest, not ceil: a guitarist who lets the last chord ring past the
 * downbeat has overrun by a fraction of a bar and meant to land on it, so the
 * tail is trimmed rather than doubling everyone's loop. The cost is bounded —
 * nothing is ever cut by more than half a bar, and the caller fades the trim so
 * it does not click. Bias this toward growing by swapping the round() for a
 * ceil() with an epsilon; it is deliberately the only knob here.
 */
export function barsForCapture(capturedSamples: number, baseSamples: number): number {
  if (baseSamples <= 0) return 1;
  return Math.max(1, Math.round(capturedSamples / baseSamples));
}

/**
 * Snap a freshly captured length to whole bars of the base unit. Returns both
 * the bar count and the exact sample length, so every track's buffer is an
 * integer multiple of the base and stays sample-aligned indefinitely.
 *
 * With no base yet (`baseSamples <= 0`) the capture passes through unquantized
 * and becomes the base itself — that is the first-thing-in case.
 */
export function quantizeToBase(
  capturedSamples: number,
  baseSamples: number,
): { bars: number; samples: number } {
  if (baseSamples <= 0) return { bars: 1, samples: Math.max(0, Math.round(capturedSamples)) };
  const bars = barsForCapture(capturedSamples, baseSamples);
  return { bars, samples: bars * baseSamples };
}

/**
 * The cycle's width in bars: the widest track present, minimum 1. Recomputed
 * from scratch after every add/delete so the cycle grows when a long take lands
 * AND shrinks back when that take is removed — deriving it beats mutating a
 * running max, which can only ever grow.
 */
export function cycleBars(trackBars: readonly number[]): number {
  let widest = 1;
  for (const bars of trackBars) {
    if (bars > widest) widest = bars;
  }
  return widest;
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
