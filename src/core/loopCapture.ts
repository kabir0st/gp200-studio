// Pure capture-edge maths for the loop station: where a take really starts,
// how its loop point is joined, and how much of the round trip has to be
// compensated. Framework-agnostic and side-effect free apart from the
// localStorage envelope at the bottom (same pattern as looperTriggers.ts).
//
// ── Why a tail blend and not a crossfade ────────────────────────────────────
//
// The downbeat is nearly always the loudest transient in a take, so the classic
// "fade the head in, fade the tail out" crossfade destroys exactly the part
// that makes a loop feel tight: the pick attack arrives at 20% gain and the
// loop sounds like it is breathing in. Hardware loopers do the opposite. The
// head is left at FULL gain from sample 0, and the recorder keeps running PAST
// the loop end so the decay that was still ringing when the loop wrapped can be
// summed back over the downbeat , the chord rings across the join exactly as it
// would if you had kept playing. blendTail() is that sum; nothing here ever
// touches the level of the head.
//
// ── Why the start is not simply "when the button was pressed" ───────────────
//
// A sample reaching the recorder at context frame X was played by the guitarist
// at X − inputLatency, and the click/loop they played along to was heard
// outputLatency after it was scheduled. The sample carrying the downbeat
// therefore lands roundTripSamples() AFTER the downbeat was scheduled, and that
// is where the loop's first sample has to come from.
//
// ── Why capture starts EARLIER than that, and the head is sliced ────────────
//
// The obvious implementation arms the recorder at the loop point. It works
// right up until the compensation is wrong, and it is a device-reported number
// so it often is , which is what the user's latency trim is for. Sliding the
// arm point with the trim slides the whole capture WINDOW, so a positive trim
// throws the first few tens of milliseconds of the take away before the main
// thread ever sees them, and a negative trim has nowhere to go because capture
// cannot begin before the recorder was armed.
//
// So planCapture() arms a GUARD pre-roll early and reports where the loop point
// sits inside what was captured. The trim then only moves a slice offset over
// audio that already exists: it never destroys anything, it works in both
// directions, and the take's length stays exactly the gap between the presses
// because the stop edge moves by the same offset the head did.

/** Peak magnitude below which the input counts as silence for onset tracing. */
export const SILENCE_FLOOR = 0.0025;

/** Pre-roll kept while level-armed, so the attack that fires it is recorded. */
export const PREROLL_SEC = 0.08;
/** Zero-crossing search radius when placing a level-armed take's first sample. */
export const ONSET_SNAP_SEC = 0.002;
/** Floor on how long the recorder keeps running past the loop end. */
export const MIN_TAIL_SEC = 0.06;

export function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

export function gainToDb(gain: number): number {
  if (gain <= 0) return -Infinity;
  return 20 * Math.log10(gain);
}

function clampIndex(samples: Float32Array, index: number): number {
  if (samples.length === 0) return 0;
  return Math.max(0, Math.min(Math.round(index), samples.length - 1));
}

/**
 * Sum `tail` into the head of `body` under a raised-cosine decay, in place.
 *
 * The window is 1 at the loop point and 0 at the end of the blend, with zero
 * slope at BOTH ends, so neither the join nor the end of the blend steps. The
 * body's own samples are never attenuated. Returns how many samples were
 * blended, which is 0 when either side is empty.
 */
export function blendTail(body: Float32Array, tail: Float32Array): number {
  const count = Math.min(body.length, tail.length);
  if (count <= 0) return 0;
  for (let index = 0; index < count; index++) {
    const window = 0.5 * (1 + Math.cos((Math.PI * index) / count));
    body[index] += tail[index] * window;
  }
  return count;
}

function crossesZero(samples: Float32Array, index: number): boolean {
  const current = samples[index];
  if (current === 0) return true;
  const previous = samples[index - 1];
  if (previous < 0 && current > 0) return true;
  return previous > 0 && current < 0;
}

/**
 * Nearest sample to `index` where the waveform crosses zero, searched outwards
 * up to `maxSearch` samples in each direction. Falls back to the quietest
 * sample in the window when the signal never crosses (a DC-ish or very low
 * frequency passage), so the head still starts from as close to zero as the
 * recording offers and cannot click.
 */
export function snapToZeroCrossing(
  samples: Float32Array,
  index: number,
  maxSearch: number,
): number {
  if (samples.length === 0) return 0;
  const start = clampIndex(samples, index);
  const radius = Math.max(0, Math.floor(maxSearch));
  let quietest = start;
  let quietestMagnitude = Math.abs(samples[start]);
  for (let offset = 1; offset <= radius; offset++) {
    const after = start + offset;
    if (after < samples.length) {
      if (crossesZero(samples, after)) return after;
      const magnitude = Math.abs(samples[after]);
      if (magnitude < quietestMagnitude) {
        quietest = after;
        quietestMagnitude = magnitude;
      }
    }
    const before = start - offset;
    if (before > 0) {
      if (crossesZero(samples, before)) return before;
      const magnitude = Math.abs(samples[before]);
      if (magnitude < quietestMagnitude) {
        quietest = before;
        quietestMagnitude = magnitude;
      }
    }
  }
  return quietest;
}

export interface OnsetOptions {
  /** index the level detector fired at */
  triggerIndex: number;
  /** magnitude below which the signal counts as silence */
  floor: number;
  /** how far back the attack may be traced, in samples */
  maxBackoff: number;
  /** zero-crossing search radius, in samples */
  snapRadius: number;
}

/**
 * Refine a level-detector hit into the true start of the note.
 *
 * A threshold fires part-way up the attack, so cutting there clips the pick
 * itself , the one thing a loop must not lose. This walks BACK over the ramp to
 * where the signal last sat in the noise floor, then snaps to a zero crossing
 * so the head starts silent without a fade.
 */
export function findOnset(samples: Float32Array, options: OnsetOptions): number {
  if (samples.length === 0) return 0;
  const trigger = clampIndex(samples, options.triggerIndex);
  const limit = Math.max(0, trigger - Math.max(0, Math.floor(options.maxBackoff)));
  let index = trigger;
  while (index > limit && Math.abs(samples[index - 1]) > options.floor) index--;
  return snapToZeroCrossing(samples, index, options.snapRadius);
}

export interface LatencyInputs {
  /** AudioContext.outputLatency (or a baseLatency estimate) in seconds */
  outputLatencySec: number;
  /** the capture track's reported latency in seconds */
  inputLatencySec: number;
  sampleRate: number;
}

/**
 * Frames between a scheduled musical instant and the sample that carries it,
 * as the DEVICE reports the round trip. The user trim is deliberately not part
 * of this: see planCapture, which decides separately whether the trim applies
 * at all and never lets it move the arm point.
 */
export function roundTripSamples(inputs: LatencyInputs): number {
  const seconds = inputs.outputLatencySec + inputs.inputLatencySec;
  return Math.max(0, Math.round(seconds * inputs.sampleRate));
}

/**
 * Frames of audio captured AHEAD of a grid take's loop point, so the trim can
 * move the loop point without ever throwing recorded audio away.
 *
 * Sized to the full trim range, so the head never falls outside the guard.
 * Capped against the bar, though: a guard the worklet cannot honour in full
 * shows up as an over-long capture, and quantizeToBase only rounds that back
 * while the overrun stays under half a bar. A quarter-bar cap keeps that margin
 * on a fast locked tempo, where a flat 150 ms would round a 1-bar take to 2.
 */
export function guardPreRollFrames(sampleRate: number, baseSamples: number | null): number {
  const wanted = Math.max(0, Math.round((LATENCY_TRIM_MAX_MS / 1000) * sampleRate));
  if (baseSamples === null || baseSamples <= 0) return wanted;
  return Math.min(wanted, Math.floor(baseSamples / 4));
}

/** How the recorder is being armed for a take. */
export type CaptureMode =
  /** worklet listens and fires on the attack (nothing is looping yet) */
  | 'level'
  /** capture begins on a cycle downbeat, against audio already playing */
  | 'grid'
  /** roll immediately: no grid worth waiting for */
  | 'now';

export interface CapturePlanInputs {
  mode: CaptureMode;
  /** the musical instant as a context frame: the grid downbeat, or "now" */
  startFrame: number;
  sampleRate: number;
  inputLatencySec: number;
  outputLatencySec: number;
  /** the user's trim in ms; only applied when playing against something */
  trimMs: number;
  /**
   * True when the player is following audio WE scheduled. Only then is the
   * output leg real (they hear it late) and only then does the trim mean
   * anything , with nothing audible to follow there is no round trip to correct
   * and charging one would just rotate the take against its own grid.
   */
  againstPlayback: boolean;
  /** one bar in samples, or null when nothing defines one yet */
  baseSamples: number | null;
  /** fixed take length in bars, or null to run until stopped */
  recordBars: number | null;
  tailBlendMs: number;
}

export interface CapturePlan {
  /** frame the worklet is told to begin capturing on */
  armFrame: number;
  /** frame the loop's first sample sits on */
  loopHeadFrame: number;
  /** body length to ask the worklet for; 0 means "run until stopped" */
  bodyFrames: number;
  /** how much ring-out to keep past the body, for the loop join */
  tailFrames: number;
  /** how far the edges moved; the STOP edge must use the same */
  offsetFrames: number;
  /** audio captured ahead of the loop point (0 outside grid mode) */
  guardFrames: number;
}

/**
 * Where a take's capture window, loop point and stop edge belong.
 *
 * The one invariant worth stating: the take's LENGTH never depends on the trim.
 * The head sits at `startFrame + offsetFrames` and the stop edge is pushed by
 * the same `offsetFrames`, so a hand-stopped take is exactly the gap between
 * the two presses and a fixed-length one is exactly `recordBars` bars.
 */
export function planCapture(inputs: CapturePlanInputs): CapturePlan {
  const rate = inputs.sampleRate;
  let outputLatencySec = 0;
  let trimMs = 0;
  if (inputs.againstPlayback) {
    outputLatencySec = inputs.outputLatencySec;
    trimMs = inputs.trimMs;
  }
  const offsetFrames =
    roundTripSamples({ outputLatencySec, inputLatencySec: inputs.inputLatencySec, sampleRate: rate })
    + Math.round((trimMs / 1000) * rate);

  const loopHeadFrame = Math.max(0, inputs.startFrame + offsetFrames);
  // Only a grid take has a head in the future to reach back from. NOW mode
  // starts at this instant and level mode keeps its own rolling pre-roll.
  let guardFrames = 0;
  if (inputs.mode === 'grid') {
    guardFrames = Math.min(loopHeadFrame, guardPreRollFrames(rate, inputs.baseSamples));
  }

  // Everything captured before the loop point still counts toward the body the
  // worklet was asked for, so a fixed take is exactly `recordBars` bars once
  // the head has been sliced off it.
  let bodyFrames = 0;
  if (inputs.baseSamples !== null && inputs.recordBars !== null) {
    bodyFrames = guardFrames + inputs.baseSamples * inputs.recordBars;
  }

  // The head can only move FORWARD from the arm point (a late worklet start, a
  // level-armed onset), and the loop's last samples then come out of the tail.
  const headroomSec = Math.max(PREROLL_SEC, guardFrames / rate);
  const tailSec = Math.max(MIN_TAIL_SEC, inputs.tailBlendMs / 1000) + headroomSec;

  return {
    armFrame: loopHeadFrame - guardFrames,
    loopHeadFrame,
    bodyFrames,
    tailFrames: Math.round(tailSec * rate),
    offsetFrames,
    guardFrames,
  };
}

/**
 * Where the loop's first sample sits inside what the worklet actually posted.
 *
 * The worklet cannot start before the quantum it receives the arm message on,
 * so a guard reaching into the past is only honoured in part. Measuring the
 * head against the frame it REPORTS starting on absorbs that difference rather
 * than rotating the take by it.
 */
export function resolveHead(loopHeadFrame: number, reportedStartFrame: number): number {
  return Math.max(0, loopHeadFrame - reportedStartFrame);
}

/** Loop-length frames available once the head is skipped. */
export function capturedFrames(bodyFrames: number, flatLength: number, head: number): number {
  return Math.max(0, Math.min(bodyFrames, flatLength) - head);
}

// ── Output stage ────────────────────────────────────────────────────────────

/** Level below which the safety clipper is bit-transparent (≈ −4.4 dBFS). */
export const SOFT_CLIP_KNEE = 0.6;

/**
 * Lookup curve for a zero-latency soft clipper on the loop station's output.
 *
 * Tracks SUM. Four takes at unity peak at four times full scale, and the hard
 * clip the browser applies on the way to the speakers is what turns a loud
 * loop into a nasty one. This bends everything above the knee towards a
 * ceiling instead, so stacking stays loud but never turns to fizz.
 *
 * Deliberately a WaveShaper and not a DynamicsCompressor: Chromium's
 * compressor carries a lookahead pre-delay, and the entire capture design here
 * rests on the output leg costing exactly what `ctx.outputLatency` reports
 * (see roundTripSamples). A per-sample lookup adds nothing to that.
 *
 * Below the knee y = x exactly, and the first derivative is 1 on both sides of
 * it, so the transition into the bend cannot be heard. A WaveShaper clamps
 * out-of-range input to the curve's endpoints, which makes the value at x = 1
 * a hard ceiling for any level at all.
 */
// The explicit ArrayBuffer arg matters: WaveShaperNode.curve rejects the
// default Float32Array<ArrayBufferLike>, which could be shared memory.
export function softClipCurve(length = 2048): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(length);
  const range = 1 - SOFT_CLIP_KNEE;
  for (let index = 0; index < length; index++) {
    // The curve is sampled across the shaper's own −1..1 input span.
    const input = (index / (length - 1)) * 2 - 1;
    const magnitude = Math.abs(input);
    if (magnitude <= SOFT_CLIP_KNEE) {
      curve[index] = input;
      continue;
    }
    const excess = (magnitude - SOFT_CLIP_KNEE) / range;
    curve[index] = Math.sign(input) * (SOFT_CLIP_KNEE + range * Math.tanh(excess));
  }
  return curve;
}

// ── Record settings ─────────────────────────────────────────────────────────

export interface LoopRecordSettings {
  /**
   * Where an overdub's loop point sits, in ms either side of what the device
   * reports the round trip to be. POSITIVE fixes a take that plays back LATE
   * (the loop point moves further into the capture); negative pulls it earlier
   * than the device claims. It only slides a slice offset over audio the guard
   * pre-roll already captured, so neither direction costs anything, and it does
   * nothing at all to a take recorded with nothing playing , there is no round
   * trip to correct when there is nothing to play along to.
   */
  latencyTrimMs: number;
  /** ms of ring-out past the loop point summed back over the downbeat */
  tailBlendMs: number;
  /** begin the first take on the first note played instead of on the button */
  autoStart: boolean;
  /** peak level in dBFS that counts as "a note was played" */
  triggerDb: number;
  /** fixed take length in bars, or null to record until stopped */
  recordBars: number | null;
  /**
   * Loop-station output level, 0..1, applied to the master gain node.
   *
   * The one field here that is not a capture edge. It lives with the record
   * settings because this is the looper's persisted per-machine preference
   * bag, and an output level has to survive a reload like the rest of them.
   * The default sits below unity because tracks SUM: every take stacks its
   * full level on the last, and a rig whose USB output already runs hot has
   * no headroom left by the third one.
   */
  masterLevel: number;
}

export const LATENCY_TRIM_MIN_MS = -150;
export const LATENCY_TRIM_MAX_MS = 150;
export const TAIL_BLEND_MAX_MS = 800;
export const TRIGGER_DB_MIN = -60;
export const TRIGGER_DB_MAX = -6;
/** Take lengths the UI offers; null (free running) is added by the panel. */
export const RECORD_BAR_CHOICES: readonly number[] = [1, 2, 4, 8, 16];

export const DEFAULT_RECORD_SETTINGS: LoopRecordSettings = {
  latencyTrimMs: 0,
  // Long enough for a strummed chord to ring across the join, short enough that
  // the previous bar's last note does not smear over the whole downbeat.
  tailBlendMs: 220,
  autoStart: true,
  triggerDb: -34,
  recordBars: null,
  // -6 dB: a starting volume, not a ceiling. Low enough that a first loop is
  // never a shock next to the amp, and that a second and third take can land
  // on top before the safety clipper above has to do anything at all.
  masterLevel: 0.5,
};

function clampNumber(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

function clampBars(value: number | null): number | null {
  if (value === null) return null;
  if (!Number.isFinite(value)) return null;
  const bars = Math.round(value);
  if (bars < 1) return null;
  return Math.min(64, bars);
}

/** Merge a partial update onto current settings, clamping every field. */
export function clampRecordSettings(
  current: LoopRecordSettings,
  patch: Partial<LoopRecordSettings>,
): LoopRecordSettings {
  const merged = { ...current, ...patch };
  return {
    latencyTrimMs: Math.round(clampNumber(
      merged.latencyTrimMs,
      LATENCY_TRIM_MIN_MS,
      LATENCY_TRIM_MAX_MS,
      DEFAULT_RECORD_SETTINGS.latencyTrimMs,
    )),
    tailBlendMs: Math.round(clampNumber(
      merged.tailBlendMs,
      0,
      TAIL_BLEND_MAX_MS,
      DEFAULT_RECORD_SETTINGS.tailBlendMs,
    )),
    autoStart: merged.autoStart === true,
    triggerDb: Math.round(clampNumber(
      merged.triggerDb,
      TRIGGER_DB_MIN,
      TRIGGER_DB_MAX,
      DEFAULT_RECORD_SETTINGS.triggerDb,
    )),
    recordBars: clampBars(merged.recordBars),
    masterLevel: clampNumber(
      merged.masterLevel,
      0,
      1,
      DEFAULT_RECORD_SETTINGS.masterLevel,
    ),
  };
}

const SETTINGS_KEY = 'gp200-studio.looper.record';

/** Read persisted record settings, falling back to the defaults field by field. */
export function loadRecordSettings(): LoopRecordSettings {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(SETTINGS_KEY);
  } catch {
    return DEFAULT_RECORD_SETTINGS;
  }
  if (raw === null) return DEFAULT_RECORD_SETTINGS;
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return DEFAULT_RECORD_SETTINGS;
  }
  if (typeof parsed !== 'object' || parsed === null) return DEFAULT_RECORD_SETTINGS;
  return clampRecordSettings(
    DEFAULT_RECORD_SETTINGS,
    parsed as Partial<LoopRecordSettings>,
  );
}

/** Persist record settings; best-effort, like every other store in the app. */
export function saveRecordSettings(settings: LoopRecordSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Private mode / quota exceeded / storage disabled.
  }
}
