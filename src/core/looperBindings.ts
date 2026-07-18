// Pure mapping from physical GP-200 controls (footswitches, EXP pedal) to loop
// station actions. No Web Audio, no React, just the binding model + resolvers,
// so the glue in App.tsx and the LooperPanel share one testable source of truth.
//
// Tracks are dynamic (every record→stop creates one), so actions carry no
// track number: the four transport controls are record, play/stop, and
// selection next/prev. Per-track operations (mute, clear, gain) stay
// on-screen; the EXP pedal drives either the master level or the SELECTED
// track's level.

export type LooperAction =
  | { kind: 'recordToggle' }   // record a NEW track / stop the recording
  | { kind: 'playToggle' }     // play all / stop all
  | { kind: 'trackNext' }
  | { kind: 'trackPrev' };

export type ExpTarget =
  | { kind: 'selectedTrackGain' }
  | { kind: 'masterGain' }
  | null;

export interface LooperBindings {
  /** footswitch number (1..8) → action */
  footswitches: Record<number, LooperAction>;
  /** what the EXP pedal drives, if anything */
  expTarget: ExpTarget;
}

export const defaultLooperBindings: LooperBindings = {
  footswitches: {
    1: { kind: 'recordToggle' },
    2: { kind: 'playToggle' },
    3: { kind: 'trackNext' },
    4: { kind: 'trackPrev' },
  },
  expTarget: { kind: 'masterGain' },
};

/** The action bound to a footswitch, or null if unbound. */
export function resolveFootswitch(bindings: LooperBindings, fsNumber: number): LooperAction | null {
  return bindings.footswitches[fsNumber] ?? null;
}

/** Map a raw EXP position 0..127 to a 0..1 gain, clamped. */
export function applyExp(value: number): number {
  return Math.min(1, Math.max(0, value / 127));
}

// The subset of the looper API the dispatcher needs, kept minimal so it can be
// mocked in tests and so LooperApi satisfies it structurally.
export interface LooperControls {
  toggleRecord: () => void;
  togglePlayAll: () => void;
  selectNextTrack: () => void;
  selectPrevTrack: () => void;
}

/** Apply a resolved action to the looper. */
export function dispatchLooperAction(looper: LooperControls, action: LooperAction): void {
  switch (action.kind) {
    case 'recordToggle':
      looper.toggleRecord();
      break;
    case 'playToggle':
      looper.togglePlayAll();
      break;
    case 'trackNext':
      looper.selectNextTrack();
      break;
    case 'trackPrev':
      looper.selectPrevTrack();
      break;
  }
}
