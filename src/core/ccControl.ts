// Plain MIDI CC control surface for the GP-200's built-in looper, drum
// machine, and tuner.
//
// CC map extracted from the gp2-controller.xyz web app bundle (decompiled
// chunk-CAUTDAHB.js, 2026-07); it mirrors Valeton's official MIDI Control
// Information chart. Unlike everything in SysExCodec.ts, these are ordinary
// 3-byte control changes — no SysEx involved — sent on the device's global
// MIDI channel (GP-200 factory default: channel 1, i.e. index 0). See
// docs/protocol-capture.md §5/§6.
//
// This module is pure: byte building, typed command descriptors, and the
// localStorage envelope for the user's channel choice. Actual sending lives
// in src/hooks/useMidiSend.ts (sendCC).

/** A channel-agnostic CC command; the send layer stamps the channel. */
export interface CCCommand {
  cc: number;
  value: number;
}

/** GP-200 global MIDI channel default is 1 → channel index 0 → status 0xB0. */
export const DEFAULT_CC_CHANNEL = 0;

/** CC numbers, verbatim from the gp2-controller.xyz command table. */
export const CC = {
  TUNER: 58,
  LOOPER_MENU: 59,
  LOOPER_RECORD: 60,
  LOOPER_AUTO_RECORD: 61,
  LOOPER_PLAY: 62,
  LOOPER_TEMPO_SPEED: 63,
  LOOPER_DIRECTION: 64,
  LOOPER_DELETE: 65,
  LOOPER_REC_VOLUME: 66,
  LOOPER_PLAYBACK_VOLUME: 67,
  LOOPER_PLACEMENT: 68,
  TAP_TEMPO: 75,
  DRUMS_MENU: 92,
  DRUMS_PLAY: 93,
  DRUMS_RHYTHM: 94,
  DRUMS_VOLUME: 95,
} as const;

const CC_ON = 127;
const CC_OFF = 0;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(Math.round(value), min), max);
}

function onOff(on: boolean): number {
  if (on) return CC_ON;
  return CC_OFF;
}

/** Wire encoding: [status, cc, value] with channel/cc/value clamped. */
export function buildCC(channel: number, cc: number, value: number): [number, number, number] {
  const status = 0xb0 | clamp(channel, 0, 15);
  return [status, clamp(cc, 0, 127), clamp(value, 0, 127)];
}

// ---------------------------------------------------------------------------
// Typed command helpers. On/off polarity follows the gp2-controller table
// (127 = on/show/full/normal/front); unverified polarities are flagged.
// ---------------------------------------------------------------------------

export function tunerShow(open: boolean): CCCommand {
  return { cc: CC.TUNER, value: onOff(open) };
}

export function looperShow(show: boolean): CCCommand {
  return { cc: CC.LOOPER_MENU, value: onOff(show) };
}

/** Starts (or overdub-cycles) recording; the table always sends value 0. */
export function looperRecord(): CCCommand {
  return { cc: CC.LOOPER_RECORD, value: 0 };
}

export function looperAutoRecord(on: boolean): CCCommand {
  return { cc: CC.LOOPER_AUTO_RECORD, value: onOff(on) };
}

/** true → play (127), false → stop (0). */
export function looperPlay(play: boolean): CCCommand {
  return { cc: CC.LOOPER_PLAY, value: onOff(play) };
}

/** true → half speed (0), false → full speed (127). Polarity per the
 *  gp2-controller helpers (setLooperTempoHalfSpeed sends 0); unverified on
 *  hardware. */
export function looperHalfSpeed(half: boolean): CCCommand {
  return { cc: CC.LOOPER_TEMPO_SPEED, value: onOff(!half) };
}

/** true → reverse (0), false → normal (127). Same provenance caveat. */
export function looperReverse(reverse: boolean): CCCommand {
  return { cc: CC.LOOPER_DIRECTION, value: onOff(!reverse) };
}

export function looperDelete(): CCCommand {
  return { cc: CC.LOOPER_DELETE, value: CC_ON };
}

export function looperRecVolume(volume: number): CCCommand {
  return { cc: CC.LOOPER_REC_VOLUME, value: clamp(volume, 0, 100) };
}

export function looperPlaybackVolume(volume: number): CCCommand {
  return { cc: CC.LOOPER_PLAYBACK_VOLUME, value: clamp(volume, 0, 100) };
}

/** Whether the looper sits before ("front", 127) or after ("rear", 0) the
 *  effect chain. */
export function looperPlacement(placement: 'front' | 'rear'): CCCommand {
  return { cc: CC.LOOPER_PLACEMENT, value: onOff(placement === 'front') };
}

export function drumsShow(show: boolean): CCCommand {
  return { cc: CC.DRUMS_MENU, value: onOff(show) };
}

/** true → play (127), false → stop (0). */
export function drumsPlay(play: boolean): CCCommand {
  return { cc: CC.DRUMS_PLAY, value: onOff(play) };
}

/** Rhythm style index 0..99; see drumRhythms.ts for the table. */
export function drumsRhythm(index: number): CCCommand {
  return { cc: CC.DRUMS_RHYTHM, value: clamp(index, 0, 99) };
}

export function drumsVolume(volume: number): CCCommand {
  return { cc: CC.DRUMS_VOLUME, value: clamp(volume, 0, 100) };
}

export function tapTempo(): CCCommand {
  return { cc: CC.TAP_TEMPO, value: 0 };
}

// ---------------------------------------------------------------------------
// Persistence: the user's CC channel choice (must match the GP-200's global
// MIDI-channel setting). Same guarded envelope pattern as looperTriggers.ts.
// ---------------------------------------------------------------------------

const STORE_KEY = 'gp200:ccChannel';

/** Read the stored channel index (0..15). Default on miss or any damage. */
export function loadCcChannel(): number {
  let raw: string | null;
  try {
    raw = localStorage.getItem(STORE_KEY);
  } catch {
    return DEFAULT_CC_CHANNEL;
  }
  if (raw === null) return DEFAULT_CC_CHANNEL;

  const channel = Number(raw);
  if (!Number.isInteger(channel) || channel < 0 || channel > 15) {
    return DEFAULT_CC_CHANNEL;
  }
  return channel;
}

/** Persist the channel index. Swallows quota/availability errors. */
export function saveCcChannel(channel: number): void {
  if (!Number.isInteger(channel) || channel < 0 || channel > 15) return;
  try {
    localStorage.setItem(STORE_KEY, String(channel));
  } catch {
    // Private mode / quota exceeded / storage disabled: best-effort.
  }
}
