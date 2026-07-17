// MIDI-learn trigger model for the loop station's hardware bindings.
//
// The GP-200 never sends the standard-CC footswitch frames midiControlMap.ts
// hypothesizes, but it DOES emit SysEx on every stomp (docs/protocol-capture.md
// §4): effect-toggle stomps arrive as 0x12/0x10 toggle frames or 0x12/0x08
// FX-state frames, and CTRL/bypass stomps arrive as 0x12/0x08 "same-slot
// change" frames the dispatcher otherwise ignores. Instead of waiting for a
// full USB capture, the LooperPanel lets the user ARM a footswitch row and
// stomp: whatever frame arrives is fingerprinted here and becomes that row's
// trigger. While the looper drawer is open, frames matching a learned + bound
// row are consumed ("hijacked") into looper actions; everything else flows to
// the normal dispatcher branches untouched.
//
// This module is pure: frame classification, the learn/hijack decision
// function, and the localStorage envelope. All side effects (dispatching
// looper actions, sending the revert toggle, console logging) live in
// src/hooks/useLooperTriggers.ts.

import {
  type LooperAction,
  type LooperBindings,
  resolveFootswitch,
} from './looperBindings';
import { FS_ON_THRESHOLD } from './midiControlMap';

/** One physical stomp can emit BOTH a 0x10 toggle frame and a 0x08 FX-state
 *  frame; both normalize to the same `toggle` fingerprint so the second frame
 *  lands in the debounce window instead of double-firing. */
export type TriggerFingerprint =
  | { kind: 'toggle'; block: number }
  | { kind: 'sysex08'; sig: string }
  | { kind: 'cc'; cc: number };

/** footswitch number (1..8) → learned trigger */
export type LooperTriggerMap = Record<number, TriggerFingerprint>;

/** Two frames matching the same fingerprint within this window count as one
 *  stomp (sibling-frame suppression + mechanical switch bounce). */
export const TRIGGER_DEBOUNCE_MS = 300;

const GP_HEADER = [0xf0, 0x21, 0x25, 0x7e, 0x47, 0x50, 0x2d, 0x32];

function isGpSysEx(data: Uint8Array, cmd: number, sub: number): boolean {
  if (data.length <= 10) return false;
  for (let byteIndex = 0; byteIndex < GP_HEADER.length; byteIndex++) {
    if (data[byteIndex] !== GP_HEADER[byteIndex]) return false;
  }
  return data[8] === cmd && data[9] === sub;
}

/** Hex-dump a frame (or a slice of it) for console diagnostics. */
export function hexOfBytes(data: Uint8Array, start = 0, end = data.length): string {
  const slice = Array.from(data.subarray(start, end));
  return slice.map((byte) => byte.toString(16).padStart(2, '0')).join(' ');
}

function isKnobShape(data: Uint8Array): boolean {
  for (let byteIndex = 29; byteIndex <= 36; byteIndex++) {
    if (data[byteIndex] !== 0) return false;
  }
  return true;
}

function decodeSlotNibbles(data: Uint8Array): number {
  return ((data[25] & 0x0f) << 4) | (data[26] & 0x0f);
}

/**
 * Classify an incoming raw MIDI frame into a learnable/hijackable fingerprint,
 * or null for frames that must always flow through normal handling (real slot
 * changes, knob turns, effect swaps, short frames).
 *
 * The sysex08 signature covers data[10..24] — the payload prefix the
 * dispatcher already logs — EXCLUDING the slot nibbles at [25],[26] so a
 * learned CTRL trigger survives slot changes, and [27]. This slice is a
 * hypothesis pending the USB capture; if it proves wrong, fix it here and
 * bump STORE_VERSION so stale learned triggers are discarded.
 */
export function classifyFrame(
  data: Uint8Array,
  currentSlot: number | null,
): TriggerFingerprint | null {
  if (data.length >= 3 && (data[0] & 0xf0) === 0xb0) {
    if (data[2] < FS_ON_THRESHOLD) return null; // release edge
    return { kind: 'cc', cc: data[1] };
  }
  if (isGpSysEx(data, 0x12, 0x10) && data.length >= 45) {
    if (isKnobShape(data)) return null;
    const block = data[38];
    if (block < 0 || block > 10) return null;
    return { kind: 'toggle', block };
  }
  if (isGpSysEx(data, 0x12, 0x08) && data.length >= 28) {
    if (data[14] !== 0x08) {
      const block = data[22];
      if (block < 0 || block > 10) return null;
      return { kind: 'toggle', block };
    }
    if (currentSlot === null) return null;
    if (decodeSlotNibbles(data) !== currentSlot) return null; // real slot change
    return { kind: 'sysex08', sig: hexOfBytes(data, 10, 25) };
  }
  return null;
}

/** The post-stomp effect state carried by a toggle-shaped frame, or null. */
export function extractToggleState(data: Uint8Array): boolean | null {
  if (isGpSysEx(data, 0x12, 0x10) && data.length >= 45 && !isKnobShape(data)) {
    return data[40] !== 0;
  }
  if (isGpSysEx(data, 0x12, 0x08) && data.length >= 28 && data[14] !== 0x08) {
    return data[24] !== 0;
  }
  return null;
}

/** Stable string identity for map/debounce lookups. */
export function fingerprintKey(fp: TriggerFingerprint): string {
  switch (fp.kind) {
    case 'toggle':
      return `toggle:${fp.block}`;
    case 'sysex08':
      return `sysex08:${fp.sig}`;
    case 'cc':
      return `cc:${fp.cc}`;
  }
}

/** The footswitch (other than exceptFs) already bound to this fingerprint. */
export function findDuplicateTrigger(
  triggers: LooperTriggerMap,
  fp: TriggerFingerprint,
  exceptFs: number,
): number | null {
  const key = fingerprintKey(fp);
  for (const [fsText, trigger] of Object.entries(triggers)) {
    const fs = Number(fsText);
    if (fs === exceptFs) continue;
    if (fingerprintKey(trigger) === key) return fs;
  }
  return null;
}

function ownerOfKey(triggers: LooperTriggerMap, key: string): number | null {
  for (const [fsText, trigger] of Object.entries(triggers)) {
    if (fingerprintKey(trigger) === key) return Number(fsText);
  }
  return null;
}

/** Send this toggle to undo the physical stomp's effect on the pedal. */
export interface RevertToggle {
  block: number;
  enabled: boolean;
}

function revertFor(fp: TriggerFingerprint, data: Uint8Array): RevertToggle | null {
  if (fp.kind !== 'toggle') return null;
  const state = extractToggleState(data);
  if (state === null) return null;
  return { block: fp.block, enabled: !state };
}

export interface LooperFrameInput {
  data: Uint8Array;
  /** Device's current slot, for telling CTRL stomps from real slot changes. */
  currentSlot: number | null;
  /** True while suppressFxCountRef > 0: the frame is an echo of our own send. */
  suppressed: boolean;
  /** Hijack only applies while the looper drawer is open. */
  panelOpen: boolean;
  /** Footswitch row armed for learning, or null. Learn wins over hijack. */
  armedFs: number | null;
  triggers: LooperTriggerMap;
  bindings: LooperBindings;
  /** fingerprintKey → timestamp of the last consumed match (debounce clock). */
  lastMatchAt: ReadonlyMap<string, number>;
  now: number;
}

export type LooperFrameDecision =
  | { type: 'pass' }
  | {
      type: 'learned';
      fs: number;
      fp: TriggerFingerprint;
      key: string;
      revertToggle: RevertToggle | null;
    }
  | { type: 'learnRejected'; fs: number; duplicateOfFs: number }
  | {
      type: 'hijacked';
      fs: number;
      key: string;
      action: LooperAction;
      revertToggle: RevertToggle | null;
    }
  | { type: 'debounced' };

/**
 * The whole learn/hijack policy as one pure function. Callers apply the
 * returned decision: everything except `pass` means the frame is CONSUMED and
 * must not reach the normal dispatcher branches. On `learned`/`hijacked` the
 * caller must stamp `lastMatchAt[key] = now` so the stomp's sibling frame is
 * swallowed as `debounced`.
 */
export function processLooperFrame(input: LooperFrameInput): LooperFrameDecision {
  const fp = classifyFrame(input.data, input.currentSlot);
  if (fp === null) return { type: 'pass' };

  // Echoes of our own sends (toggles, param changes, slot activations) match
  // the toggle/sysex08 shapes; they must never learn or hijack. CC frames are
  // never self-emitted, so they stay live even during a suppression window.
  if (input.suppressed && fp.kind !== 'cc') return { type: 'pass' };

  if (input.armedFs !== null) {
    const duplicateOfFs = findDuplicateTrigger(input.triggers, fp, input.armedFs);
    if (duplicateOfFs !== null) {
      return { type: 'learnRejected', fs: input.armedFs, duplicateOfFs };
    }
    return {
      type: 'learned',
      fs: input.armedFs,
      fp,
      key: fingerprintKey(fp),
      revertToggle: revertFor(fp, input.data),
    };
  }

  if (!input.panelOpen) return { type: 'pass' };
  const key = fingerprintKey(fp);
  const fs = ownerOfKey(input.triggers, key);
  if (fs === null) return { type: 'pass' };
  const action = resolveFootswitch(input.bindings, fs);
  if (action === null) return { type: 'pass' }; // row set to '-': pedal behaves normally

  const last = input.lastMatchAt.get(key);
  if (last !== undefined && input.now - last < TRIGGER_DEBOUNCE_MS) {
    return { type: 'debounced' };
  }
  return { type: 'hijacked', fs, key, action, revertToggle: revertFor(fp, input.data) };
}

// ---------------------------------------------------------------------------
// Persistence: bindings + learned triggers, one localStorage envelope
// (same guarded pattern as presetNameCache.ts). Not device-keyed: bindings are
// a user preference and toggle fingerprints are block-indexed, so they port
// across devices.
// ---------------------------------------------------------------------------

const STORE_KEY = 'gp200:looper';

/** Bump when the envelope OR the sysex08 signature slice changes. */
const STORE_VERSION = 1;

export interface LooperStore {
  bindings: LooperBindings;
  triggers: LooperTriggerMap;
}

interface StoreEnvelope extends LooperStore {
  v: number;
  updatedAt: number;
}

const ACTION_KINDS = ['recordOverdubCycle', 'playToggle', 'muteToggle', 'clear', 'clearAll'];

function isValidFsKey(fsText: string): boolean {
  const fs = Number(fsText);
  return Number.isInteger(fs) && fs >= 1 && fs <= 8;
}

function isValidAction(value: unknown): value is LooperAction {
  if (typeof value !== 'object' || value === null) return false;
  const action = value as Partial<LooperAction>;
  if (typeof action.kind !== 'string' || !ACTION_KINDS.includes(action.kind)) return false;
  if (action.kind === 'clearAll') return true;
  const track = (action as { track?: unknown }).track;
  return Number.isInteger(track) && (track as number) >= 0;
}

function isValidExpTarget(value: unknown): boolean {
  if (value === null) return true;
  if (typeof value !== 'object') return false;
  const target = value as { kind?: unknown; track?: unknown };
  if (target.kind === 'masterGain') return true;
  if (target.kind !== 'trackGain') return false;
  return Number.isInteger(target.track) && (target.track as number) >= 0;
}

function isValidBindings(value: unknown): value is LooperBindings {
  if (typeof value !== 'object' || value === null) return false;
  const bindings = value as Partial<LooperBindings>;
  if (typeof bindings.footswitches !== 'object' || bindings.footswitches === null) return false;
  for (const [fsText, action] of Object.entries(bindings.footswitches)) {
    if (!isValidFsKey(fsText)) return false;
    if (!isValidAction(action)) return false;
  }
  return isValidExpTarget(bindings.expTarget);
}

function isValidFingerprint(value: unknown): value is TriggerFingerprint {
  if (typeof value !== 'object' || value === null) return false;
  const fp = value as { kind?: unknown; block?: unknown; sig?: unknown; cc?: unknown };
  if (fp.kind === 'toggle') {
    return Number.isInteger(fp.block) && (fp.block as number) >= 0 && (fp.block as number) <= 10;
  }
  if (fp.kind === 'sysex08') {
    return typeof fp.sig === 'string' && fp.sig.length > 0;
  }
  if (fp.kind === 'cc') {
    return Number.isInteger(fp.cc) && (fp.cc as number) >= 0 && (fp.cc as number) <= 127;
  }
  return false;
}

function isValidTriggers(value: unknown): value is LooperTriggerMap {
  if (typeof value !== 'object' || value === null) return false;
  for (const [fsText, fp] of Object.entries(value)) {
    if (!isValidFsKey(fsText)) return false;
    if (!isValidFingerprint(fp)) return false;
  }
  return true;
}

/** Read + validate the stored bindings/triggers. Null on miss or any damage. */
export function loadLooperStore(): LooperStore | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(STORE_KEY);
  } catch {
    return null;
  }
  if (raw === null) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null) return null;
  const env = parsed as Partial<StoreEnvelope>;
  if (env.v !== STORE_VERSION) return null;
  if (!isValidBindings(env.bindings)) return null;
  if (!isValidTriggers(env.triggers)) return null;
  return { bindings: env.bindings, triggers: env.triggers };
}

/** Persist bindings + triggers. Swallows quota/availability errors. */
export function saveLooperStore(bindings: LooperBindings, triggers: LooperTriggerMap): void {
  const envelope: StoreEnvelope = {
    v: STORE_VERSION,
    updatedAt: Date.now(),
    bindings,
    triggers,
  };
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(envelope));
  } catch {
    // Private mode / quota exceeded / storage disabled: persistence is best-effort.
  }
}
