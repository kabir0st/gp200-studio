import type { LooperApi } from '@/hooks/useLooper';

// Plain-language state readouts shared by the loop station's SIMPLE and
// ADVANCED faces. They live outside both so the two can never end up
// describing the same transport state in different words.

export function fmtLength(sec: number | null): string {
  if (sec === null) return '- : -';
  return `${sec.toFixed(2)}s`;
}

/** "4 BARS · 8.00s (2.00s/bar)" , the whole length model in one line. */
export function fmtCycle(
  bars: number,
  cycleSec: number | null,
  baseSec: number | null,
): string {
  if (cycleSec === null || baseSec === null) return 'no loop yet';
  let plural = 'S';
  if (bars === 1) plural = '';
  return `${bars} BAR${plural} · ${fmtLength(cycleSec)} (${fmtLength(baseSec)}/bar)`;
}

export function playAllLabel(anyPlaying: boolean): string {
  if (anyPlaying) return '■ STOP';
  return '▶ PLAY';
}

/**
 * What the record button reads off the looper , deliberately narrower than the
 * whole LooperApi, so the state machine states its own inputs.
 */
export type RecordButtonInput = Pick<
  LooperApi,
  'isListening' | 'isArmed' | 'isRecording' | 'hasContent' | 'settings'
>;

export interface RecordButtonState {
  label: string;
  /** one line under the button saying what pressing it will actually do */
  hint: string;
  variant: 'primary' | 'danger';
  /** a take is live: waiting for a note, waiting for the downbeat, capturing */
  live: boolean;
}

/**
 * The record control as a single state machine.
 *
 * The looper's one genuinely confusing moment is the gap between pressing REC
 * and hearing anything , the take may be listening for a note, waiting for a
 * downbeat, or already running, and all three used to look the same. Labelling
 * the button with what it does NEXT, and spelling the wait out underneath, is
 * what lets the simple face get away with one button.
 */
export function recordButtonState(looper: RecordButtonInput): RecordButtonState {
  if (looper.isListening) {
    return {
      label: '◌ LISTENING',
      hint: 'Play a note — the take starts on your attack, pick and all.',
      variant: 'danger',
      live: true,
    };
  }
  if (looper.isArmed) {
    return {
      label: '◌ ARMED',
      hint: 'Recording drops in on the next downbeat. Play along.',
      variant: 'danger',
      live: true,
    };
  }
  if (looper.isRecording) {
    return {
      label: '■ STOP',
      hint: 'Press at the end of the phrase — that is where the loop wraps.',
      variant: 'danger',
      live: true,
    };
  }
  if (looper.hasContent) {
    return {
      label: '● ADD A TAKE',
      hint: 'Layers a new track over the loop, starting on the downbeat.',
      variant: 'primary',
      live: false,
    };
  }
  if (looper.settings.autoStart) {
    return {
      label: '● RECORD',
      hint: 'Press, then play — the take begins on your first note.',
      variant: 'primary',
      live: false,
    };
  }
  return {
    label: '● RECORD',
    hint: 'Starts straight away, and this take sets the loop length.',
    variant: 'primary',
    live: false,
  };
}
