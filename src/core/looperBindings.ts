// Pure mapping from physical GP-200 controls (footswitches, EXP pedal) to loop
// station actions. No Web Audio, no React — just the binding model + resolvers,
// so the glue in App.tsx and the LooperPanel share one testable source of truth.

export type LooperAction =
  | { kind: 'recordOverdubCycle'; track: number } // start record → stop (→ plays)
  | { kind: 'playToggle'; track: number }
  | { kind: 'muteToggle'; track: number }
  | { kind: 'clear'; track: number }
  | { kind: 'clearAll' };

export type ExpTarget =
  | { kind: 'trackGain'; track: number }
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
    1: { kind: 'recordOverdubCycle', track: 0 },
    2: { kind: 'playToggle', track: 1 },
    3: { kind: 'muteToggle', track: 2 },
    4: { kind: 'clearAll' },
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

// The subset of the looper API the dispatcher needs — kept minimal so it can be
// mocked in tests and so LooperApi satisfies it structurally.
export interface LooperControls {
  isRecording: boolean;
  tracks: ReadonlyArray<{ id: number; muted: boolean }>;
  startRecord: (track: number) => void;
  stopRecord: () => void;
  togglePlay: (track: number) => void;
  setMute: (track: number, muted: boolean) => void;
  clear: (track: number) => void;
  clearAll: () => void;
}

/** Apply a resolved action to the looper. */
export function dispatchLooperAction(looper: LooperControls, action: LooperAction): void {
  switch (action.kind) {
    case 'recordOverdubCycle':
      if (looper.isRecording) looper.stopRecord();
      else looper.startRecord(action.track);
      break;
    case 'playToggle':
      looper.togglePlay(action.track);
      break;
    case 'muteToggle': {
      const track = looper.tracks.find((t) => t.id === action.track);
      looper.setMute(action.track, !(track?.muted ?? false));
      break;
    }
    case 'clear':
      looper.clear(action.track);
      break;
    case 'clearAll':
      looper.clearAll();
      break;
  }
}
