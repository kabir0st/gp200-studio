// Plain MIDI CC control surface for the GP-200's built-in looper, drum
// machine, tuner, and remote commands (CTRL taps, module on/off, bank/patch
// stepping, tempo, EXP1, quick-access knobs).
//
// CC map from Valeton's official "MIDI Control Information List" (Manual EN
// fw 1.8.0, pp. 74–76), cross-checked against the gp2-controller.xyz bundle
// (decompiled chunk-CAUTDAHB.js, 2026-07). Unlike everything in
// SysExCodec.ts, these are ordinary 3-byte control changes , no SysEx
// involved , sent on the device's global MIDI channel (GP-200 factory
// default: channel 1, i.e. index 0). See docs/protocol-capture.md §5/§6.
//
// Deliberately NOT modeled: absolute patch select via CC0 (bank MSB) +
// Program Change , the app already selects slots over SysEx
// (buildPresetChange), and PC would be the only non-CC message here.
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

/** CC numbers, verbatim from the manual's MIDI Control Information List. */
export const CC = {
  PATCH_VOLUME: 7,
  EXP1: 11,
  EXP1_AB: 13,
  QUICK_PARA_1: 16,
  QUICK_STEP_1: 17,
  QUICK_PARA_2: 18,
  QUICK_STEP_2: 19,
  QUICK_PARA_3: 20,
  QUICK_STEP_3: 21,
  BANK_DOWN: 22,
  BANK_UP: 23,
  PATCH_DOWN: 24,
  PATCH_UP: 25,
  MODULE_PRE: 48,
  MODULE_DST: 49,
  MODULE_AMP: 50,
  MODULE_NR: 51,
  MODULE_CAB: 52,
  MODULE_EQ: 53,
  MODULE_MOD: 54,
  MODULE_DLY: 55,
  MODULE_RVB: 56,
  MODULE_WAH: 57,
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
  CTRL_1: 69,
  CTRL_2: 70,
  CTRL_3: 71,
  CTRL_4: 72,
  TEMPO_MSB: 73,
  TEMPO_VALUE: 74,
  TAP_TEMPO: 75,
  CTRL_5: 76,
  CTRL_6: 77,
  CTRL_7: 78,
  CTRL_8: 79,
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
// Remote commands (manual pp. 74–76): CTRL taps, module on/off, bank/patch
// stepping, direct tempo, patch volume, EXP1, quick-access knobs.
// ---------------------------------------------------------------------------

const CTRL_CCS = [
  CC.CTRL_1,
  CC.CTRL_2,
  CC.CTRL_3,
  CC.CTRL_4,
  CC.CTRL_5,
  CC.CTRL_6,
  CC.CTRL_7,
  CC.CTRL_8,
] as const;

/** Virtually tap CTRL footswitch 1..8 (fires its assigned action). */
export function ctrlTap(ctrlNumber: number): CCCommand {
  const ctrlIndex = clamp(ctrlNumber, 1, 8) - 1;
  return { cc: CTRL_CCS[ctrlIndex], value: CC_ON };
}

/**
 * Module on/off CC per effect-block index (SLOT_MODULES order: 0 PRE, 1 WAH,
 * 2 DST, 3 AMP, 4 NR, 5 CAB, 6 EQ, 7 MOD, 8 DLY, 9 RVB). The chart has no
 * CC for VOL (block 10) or FX LOOP (block 11) , those return null.
 */
const MODULE_CCS = [
  CC.MODULE_PRE,
  CC.MODULE_WAH,
  CC.MODULE_DST,
  CC.MODULE_AMP,
  CC.MODULE_NR,
  CC.MODULE_CAB,
  CC.MODULE_EQ,
  CC.MODULE_MOD,
  CC.MODULE_DLY,
  CC.MODULE_RVB,
] as const;

/** Toggle an effect module by block index; null when no CC exists for it. */
export function moduleToggle(blockIndex: number, on: boolean): CCCommand | null {
  const moduleCc = MODULE_CCS[blockIndex];
  if (moduleCc === undefined) return null;
  return { cc: moduleCc, value: onOff(on) };
}

/** Step the active bank down/up (initial mode; CC22/CC23). */
export function bankStep(direction: 'down' | 'up'): CCCommand {
  if (direction === 'down') return { cc: CC.BANK_DOWN, value: CC_ON };
  return { cc: CC.BANK_UP, value: CC_ON };
}

/** Step the active patch down/up within the bank (CC24/CC25). */
export function patchStep(direction: 'down' | 'up'): CCCommand {
  if (direction === 'down') return { cc: CC.PATCH_DOWN, value: CC_ON };
  return { cc: CC.PATCH_UP, value: CC_ON };
}

/** Device tempo range per the chart: CC73/CC74 pair covers 40–250 BPM. */
export const TEMPO_MIN_BPM = 40;
export const TEMPO_MAX_BPM = 250;

/**
 * Set the device tempo directly. Two-CC encoding from the chart:
 * CC73=0 + CC74=40..127 → 40..127 BPM; CC73=1 + CC74=0..122 → 128..250 BPM.
 * Send both, MSB first.
 */
export function tempoBpm(bpm: number): [CCCommand, CCCommand] {
  const clamped = clamp(bpm, TEMPO_MIN_BPM, TEMPO_MAX_BPM);
  if (clamped <= 127) {
    return [
      { cc: CC.TEMPO_MSB, value: 0 },
      { cc: CC.TEMPO_VALUE, value: clamped },
    ];
  }
  return [
    { cc: CC.TEMPO_MSB, value: 1 },
    { cc: CC.TEMPO_VALUE, value: clamped - 128 },
  ];
}

/** Patch volume 0..100 (CC7). */
export function patchVolume(volume: number): CCCommand {
  return { cc: CC.PATCH_VOLUME, value: clamp(volume, 0, 100) };
}

/** EXP 1 pedal position 0..100 (CC11). */
export function exp1Position(position: number): CCCommand {
  return { cc: CC.EXP1, value: clamp(position, 0, 100) };
}

/** Switch the EXP1 assignment between A (0..63) and B (64..127) via CC13. */
export function exp1Select(side: 'A' | 'B'): CCCommand {
  if (side === 'A') return { cc: CC.EXP1_AB, value: CC_OFF };
  return { cc: CC.EXP1_AB, value: CC_ON };
}

const QUICK_PARA_CCS = [CC.QUICK_PARA_1, CC.QUICK_PARA_2, CC.QUICK_PARA_3] as const;
const QUICK_STEP_CCS = [CC.QUICK_STEP_1, CC.QUICK_STEP_2, CC.QUICK_STEP_3] as const;

/** Set Quick Access knob 1..3 to an absolute 0..100 value. */
export function quickAccessParam(knobNumber: number, value: number): CCCommand {
  const knobIndex = clamp(knobNumber, 1, 3) - 1;
  return { cc: QUICK_PARA_CCS[knobIndex], value: clamp(value, 0, 100) };
}

/** Nudge Quick Access knob 1..3 one step (0..63 down, 64..127 up). */
export function quickAccessStep(knobNumber: number, direction: 'down' | 'up'): CCCommand {
  const knobIndex = clamp(knobNumber, 1, 3) - 1;
  if (direction === 'down') return { cc: QUICK_STEP_CCS[knobIndex], value: CC_OFF };
  return { cc: QUICK_STEP_CCS[knobIndex], value: CC_ON };
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
