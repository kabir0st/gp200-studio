// MIDI-learn trigger model for the loop station's hardware bindings.
//
// The GP-200 never sends the standard-CC footswitch frames midiControlMap.ts
// hypothesizes, but it DOES emit SysEx on every stomp (docs/protocol-capture.md
// §4): effect-toggle stomps arrive as 0x12/0x10 toggle frames or 0x12/0x08
// FX-state frames, and CTRL/bypass stomps arrive as 0x12/0x08 "same-slot
// change" frames the dispatcher otherwise ignores. Instead of waiting for a
// full USB capture, the LooperPanel lets the user ARM one of the four transport
// actions and stomp: whatever frame arrives is fingerprinted here and becomes
// that action's trigger. While the looper dialog is open, frames matching a
// learned action are consumed ("hijacked") into looper actions; everything else
// flows to the normal dispatcher branches untouched.
//
// This module is pure: frame classification, the learn/hijack decision
// function, and the localStorage envelope. All side effects (dispatching
// looper actions, sending the revert toggle, console logging) live in
// src/hooks/useLooperTriggers.ts.

import {
  LOOPER_ACTION_KINDS,
  type LooperActionKind,
  type LooperBindings,
} from './looperBindings';
import { FS_ON_THRESHOLD } from './midiControlMap';

/** One physical stomp can emit BOTH a 0x10 toggle frame and a 0x08 FX-state
 *  frame; both normalize to the same `toggle` fingerprint so the second frame
 *  lands in the debounce window instead of double-firing. */
export type TriggerFingerprint =
  | { kind: 'toggle'; block: number }
  | { kind: 'sysex08'; sig: string }
  | { kind: 'cc'; cc: number };

/** transport action → the stomp learned for it */
export type LooperTriggerMap = Partial<Record<LooperActionKind, TriggerFingerprint>>;

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
 * True for the 38-byte 0x0c "footswitch ack" shape emitted by CTRL 4-8, as
 * opposed to a genuine effect swap (capture 2026-07-18, docs/protocol-capture.md).
 *
 * CTRL 1-3 report a stomp as 0x08; CTRL 4-8 report the same gesture as 0x0c.
 * Both carry block@22 and state@24. The two 0x0c uses are told apart by the
 * effectId fields the dispatcher reads (data[29],[30],[36]): a real swap has a
 * nonzero module/variant there, an ack has the all-zero tail. useMidiDevice's
 * 0x0c branch already drops zero-effectId frames for exactly this reason, so
 * this predicate must stay in step with that check.
 */
function isFootswitchAck0c(data: Uint8Array): boolean {
  if (!isGpSysEx(data, 0x12, 0x0c) || data.length < 38) return false;
  return data[29] === 0 && data[30] === 0 && data[36] === 0;
}

/**
 * Classify an incoming raw MIDI frame into a learnable/hijackable fingerprint,
 * or null for frames that must always flow through normal handling (real slot
 * changes, knob turns, effect swaps, short frames).
 *
 * The sysex08 signature covers data[10..24] , the payload prefix the
 * dispatcher already logs , EXCLUDING the slot nibbles at [25],[26] so a
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
  if (isFootswitchAck0c(data)) {
    // Same fingerprint kind as the 0x08 shape on purpose: this means "block N
    // was stomped", and a block stomped via either message must drive the same
    // looper action. Keeps fingerprintKey and the persisted store unchanged.
    const block = data[22];
    if (block < 0 || block > 10) return null;
    return { kind: 'toggle', block };
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
  if (isFootswitchAck0c(data)) return data[24] !== 0;
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

/** The action (other than exceptAction) already bound to this fingerprint. */
export function findDuplicateTrigger(
  triggers: LooperTriggerMap,
  fp: TriggerFingerprint,
  exceptAction: LooperActionKind,
): LooperActionKind | null {
  const key = fingerprintKey(fp);
  for (const action of LOOPER_ACTION_KINDS) {
    if (action === exceptAction) continue;
    const trigger = triggers[action];
    if (trigger !== undefined && fingerprintKey(trigger) === key) return action;
  }
  return null;
}

function ownerOfKey(triggers: LooperTriggerMap, key: string): LooperActionKind | null {
  for (const action of LOOPER_ACTION_KINDS) {
    const trigger = triggers[action];
    if (trigger !== undefined && fingerprintKey(trigger) === key) return action;
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
  /** Hijack only applies while the looper dialog is open. */
  panelOpen: boolean;
  /** Action armed for learning, or null. Learn wins over hijack. */
  armedAction: LooperActionKind | null;
  triggers: LooperTriggerMap;
  /** fingerprintKey → timestamp of the last consumed match (debounce clock). */
  lastMatchAt: ReadonlyMap<string, number>;
  now: number;
}

export type LooperFrameDecision =
  | { type: 'pass' }
  | {
      type: 'learned';
      action: LooperActionKind;
      fp: TriggerFingerprint;
      key: string;
      revertToggle: RevertToggle | null;
    }
  | { type: 'learnRejected'; action: LooperActionKind; duplicateOf: LooperActionKind }
  | {
      type: 'hijacked';
      action: LooperActionKind;
      key: string;
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

  if (input.armedAction !== null) {
    const duplicateOf = findDuplicateTrigger(input.triggers, fp, input.armedAction);
    if (duplicateOf !== null) {
      return { type: 'learnRejected', action: input.armedAction, duplicateOf };
    }
    return {
      type: 'learned',
      action: input.armedAction,
      fp,
      key: fingerprintKey(fp),
      revertToggle: revertFor(fp, input.data),
    };
  }

  if (!input.panelOpen) return { type: 'pass' };
  const key = fingerprintKey(fp);
  const action = ownerOfKey(input.triggers, key);
  if (action === null) return { type: 'pass' };

  const last = input.lastMatchAt.get(key);
  if (last !== undefined && input.now - last < TRIGGER_DEBOUNCE_MS) {
    return { type: 'debounced' };
  }
  return { type: 'hijacked', action, key, revertToggle: revertFor(fp, input.data) };
}

// ---------------------------------------------------------------------------
// Persistence: bindings + learned triggers, one localStorage envelope
// (same guarded pattern as presetNameCache.ts). Not device-keyed: bindings are
// a user preference and toggle fingerprints are block-indexed, so they port
// across devices.
// ---------------------------------------------------------------------------

const STORE_KEY = 'gp200:looper';

/** Bump when the envelope OR the sysex08 signature slice changes.
 *  v2: track-less LooperAction kinds (dynamic-track looper).
 *  v3: triggers keyed by action instead of footswitch number. */
const STORE_VERSION = 3;

export interface LooperStore {
  bindings: LooperBindings;
  triggers: LooperTriggerMap;
}

interface StoreEnvelope extends LooperStore {
  v: number;
  updatedAt: number;
}

function isValidActionKey(text: string): boolean {
  return (LOOPER_ACTION_KINDS as string[]).includes(text);
}

function isValidExpTarget(value: unknown): boolean {
  if (value === null) return true;
  if (typeof value !== 'object') return false;
  const target = value as { kind?: unknown };
  return target.kind === 'masterGain' || target.kind === 'selectedTrackGain';
}

function isValidBindings(value: unknown): value is LooperBindings {
  if (typeof value !== 'object' || value === null) return false;
  const bindings = value as Partial<LooperBindings>;
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
  for (const [actionText, fp] of Object.entries(value)) {
    if (!isValidActionKey(actionText)) return false;
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
