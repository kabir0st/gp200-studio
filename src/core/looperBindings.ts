// Pure mapping from physical GP-200 controls (footswitches, EXP pedal) to loop
// station actions. No Web Audio, no React, just the action model + resolvers,
// so the glue in App.tsx and the LooperPanel share one testable source of truth.
//
// Tracks are dynamic (every record→stop creates one), so actions carry no
// track number: the four transport controls are record, play/stop, and
// selection next/prev. play/stop and the EXP pedal both act on the SELECTED
// track — the ◀ ▶ switches pick the target, so a stomp never disturbs the
// other tracks (the panel's own PLAY button is still the play-ALL control).
// Per-track operations (mute, clear, gain) stay on-screen.

export type LooperAction =
  | { kind: 'recordToggle' }   // record a NEW track / stop the recording
  | { kind: 'playToggle' }     // play/stop the SELECTED track (not all)
  | { kind: 'muteToggle' }     // mute/unmute the SELECTED track
  | { kind: 'trackNext' }
  | { kind: 'trackPrev' };

export type LooperActionKind = LooperAction['kind'];

/** The transport actions, in the order the panel lists them. */
export const LOOPER_ACTION_KINDS: LooperActionKind[] = [
  'recordToggle',
  'playToggle',
  'muteToggle',
  'trackNext',
  'trackPrev',
];

export type ExpTarget =
  | { kind: 'selectedTrackGain' }
  | { kind: 'masterGain' }
  | null;

/** Footswitches aren't bound by number any more: a learned stomp is keyed by the
 *  action it drives (see looperTriggers.ts), so only the EXP pedal needs a
 *  binding of its own. */
export interface LooperBindings {
  /** what the EXP pedal drives, if anything */
  expTarget: ExpTarget;
}

export const defaultLooperBindings: LooperBindings = {
  expTarget: { kind: 'masterGain' },
};

/** Map a raw EXP position 0..127 to a 0..1 gain, clamped. */
export function applyExp(value: number): number {
  return Math.min(1, Math.max(0, value / 127));
}

// The subset of the looper API the dispatcher needs, kept minimal so it can be
// mocked in tests and so LooperApi satisfies it structurally.
export interface LooperControls {
  toggleRecord: () => void;
  togglePlaySelected: () => void;
  toggleMuteSelected: () => void;
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
      looper.togglePlaySelected();
      break;
    case 'muteToggle':
      looper.toggleMuteSelected();
      break;
    case 'trackNext':
      looper.selectNextTrack();
      break;
    case 'trackPrev':
      looper.selectPrevTrack();
      break;
  }
}
