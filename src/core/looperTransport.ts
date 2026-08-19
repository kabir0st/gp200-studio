// Pure timing math for the multi-track looper. Framework-agnostic: no Web Audio,
// no React, just the sample/second arithmetic that keeps tracks phase-locked.
//
// Model , two distinct lengths, do not conflate them:
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
 * and becomes the base itself , that is the first-thing-in case.
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
 * AND shrinks back when that take is removed , deriving it beats mutating a
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

/**
 * The boundary a REC press means, resolved on the clock the PLAYER is on.
 *
 * `nextBoundary` alone answers on the SCHEDULING clock, but the player is
 * hearing audio one output latency old: a downbeat scheduled just before `now`
 * has not reached their ears yet, and pressing REC to catch it would skip it
 * and arm the one after , a whole cycle late. Searching from
 * `now - outputLatency` puts the question back in the player's frame, so the
 * boundary they are reaching for is the one they get.
 *
 * The result can therefore be at or slightly before `now`. That is deliberate:
 * the capture edge derived from it still lands in the future once the round
 * trip is added, and any part of a guard pre-roll that reaches into the past is
 * absorbed by loopCapture.resolveHead().
 */
export function boundaryForPress(
  now: number,
  outputLatencySec: number,
  transportStart: number,
  loopDuration: number,
): number {
  return nextBoundary(now - Math.max(0, outputLatencySec), transportStart, loopDuration);
}

/**
 * Whether a track that is ALREADY playing keeps its phase when the cycle is
 * re-tiled from `prevCycleBars` to `nextCycleBars` , i.e. whether its running
 * source can be left alone instead of being stopped and relaunched.
 *
 * A source looping a tiled buffer emits `content[(t - A) mod trackLen]`, but
 * only while `trackLen` divides the cycle: otherwise the tiling ends in a
 * truncated repeat and the content genuinely moves when the width changes.
 * Given that divisibility, re-anchoring the transport by a whole number of old
 * cycles leaves `(t - A) mod trackLen` untouched, so the output is bit-identical
 * and the cheapest correct thing to do is nothing at all , which is also the
 * only way an overdub can grow the loop without breaking what is playing.
 *
 * Non-positive bar counts answer false, which fails toward relaunching , the
 * safe direction.
 */
export function cyclePhaseSurvives(
  trackBars: number,
  prevCycleBars: number,
  nextCycleBars: number,
): boolean {
  if (trackBars <= 0 || prevCycleBars <= 0 || nextCycleBars <= 0) return false;
  return prevCycleBars % trackBars === 0 && nextCycleBars % trackBars === 0;
}

/**
 * The transport origin implied by a take's own first sample.
 *
 * `headFrame` is the context frame the loop's sample 0 was captured on. It
 * carries what the player played one input latency earlier, and putting it back
 * out of the speakers costs one output latency, so anchoring the grid a full
 * round trip before it makes the loop play back where it was performed.
 *
 * Note what is NOT in here: the user's latency trim. The trim exists to move
 * captured audio relative to the grid, so folding it into the grid as well
 * would cancel it out (and compound it on every later take).
 */
export function anchorFromCapture(
  headFrame: number,
  sampleRate: number,
  inputLatencySec: number,
  outputLatencySec: number,
): number {
  return samplesToSeconds(headFrame, sampleRate) - inputLatencySec - outputLatencySec;
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

/**
 * Seconds in one bar at `bpm` with `beatsPerBar` quarter-note beats.
 *
 * Used to LOCK the looper's bar to the practice drum machine's tempo, which is
 * the only way to get an exactly-in-time loop: a free-running first take ends
 * when a human presses stop, and that press carries their reaction time (a
 * tenth of a second or so) straight into the master tempo, where every later
 * take inherits it. Returns 0 for a non-positive tempo or bar length.
 */
export function barSecondsFromTempo(bpm: number, beatsPerBar: number): number {
  if (bpm <= 0 || beatsPerBar <= 0) return 0;
  return (60 / bpm) * beatsPerBar;
}

/**
 * Context frame a scheduled time lands on, for handing a boundary to the
 * recorder worklet. The worklet compares against `currentFrame`, whose clock is
 * exactly `currentTime * sampleRate`, so this is the only conversion needed to
 * make an edge sample-accurate instead of setTimeout-accurate.
 */
export function frameAtTime(time: number, sampleRate: number): number {
  return Math.max(0, Math.round(time * sampleRate));
}
