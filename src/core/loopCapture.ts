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
// outputLatency after it was scheduled. Capture therefore has to begin
// roundTripSamples() AFTER the musical downbeat, and the sample that lands there
// is the downbeat. Compensating at the start (rather than trimming the head
// afterwards) keeps the take's length exactly what was played.

/** Peak magnitude below which the input counts as silence for onset tracing. */
export const SILENCE_FLOOR = 0.0025;

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
  /** user trim, positive means "the take is landing early, capture later" */
  trimMs: number;
  sampleRate: number;
}

/**
 * Frames between a scheduled musical instant and the sample that carries it.
 *
 * Never negative: capture cannot begin before the recorder was armed, so a
 * trim that would push the start earlier than the downbeat clamps to zero.
 */
export function roundTripSamples(inputs: LatencyInputs): number {
  const seconds =
    inputs.outputLatencySec + inputs.inputLatencySec + inputs.trimMs / 1000;
  return Math.max(0, Math.round(seconds * inputs.sampleRate));
}

// ── Record settings ─────────────────────────────────────────────────────────

export interface LoopRecordSettings {
  /** extra round-trip compensation in ms, on top of what the device reports */
  latencyTrimMs: number;
  /** ms of ring-out past the loop point summed back over the downbeat */
  tailBlendMs: number;
  /** begin the first take on the first note played instead of on the button */
  autoStart: boolean;
  /** peak level in dBFS that counts as "a note was played" */
  triggerDb: number;
  /** fixed take length in bars, or null to record until stopped */
  recordBars: number | null;
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
