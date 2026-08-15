import { describe, it, expect, beforeEach } from 'vitest';
import {
  fmtCycle,
  fmtLength,
  playAllLabel,
  recordButtonState,
  type RecordButtonInput,
} from '@/components/board/looperLabels';
import { DEFAULT_RECORD_SETTINGS } from '@/core/loopCapture';
import { DEFAULT_LOOPER_MODE, loadLooperMode, saveLooperMode } from '@/core/looperMode';

const IDLE: RecordButtonInput = {
  isListening: false,
  isArmed: false,
  isRecording: false,
  hasContent: false,
  settings: DEFAULT_RECORD_SETTINGS,
};

function state(patch: Partial<RecordButtonInput>) {
  return recordButtonState({ ...IDLE, ...patch });
}

describe('recordButtonState', () => {
  it('tells the three waits apart', () => {
    // The whole reason the simple face can get away with one button: the gap
    // between pressing REC and hearing anything has to name itself.
    const listening = state({ isListening: true });
    const armed = state({ isArmed: true });
    const recording = state({ isRecording: true });
    const labels = [listening.label, armed.label, recording.label];
    expect(new Set(labels).size).toBe(3);
    const hints = [listening.hint, armed.hint, recording.hint];
    expect(new Set(hints).size).toBe(3);
  });

  it('marks every in-flight state live, so CANCEL is offered throughout', () => {
    expect(state({ isListening: true }).live).toBe(true);
    expect(state({ isArmed: true }).live).toBe(true);
    expect(state({ isRecording: true }).live).toBe(true);
    expect(state({}).live).toBe(false);
    expect(state({ hasContent: true }).live).toBe(false);
  });

  it('keeps the armed wait visible even once capture flags have flipped', () => {
    // Armed outranks recording: the worklet can be running while the take has
    // not reached its downbeat, and showing STOP there invites an early press.
    expect(state({ isArmed: true, isRecording: true }).label).toContain('ARMED');
  });

  it('offers a layer rather than a first loop once something is recorded', () => {
    expect(state({ hasContent: true }).label).toBe('● ADD A TAKE');
    expect(state({}).label).toBe('● RECORD');
  });

  it('does not promise a note-triggered start when auto-start is off', () => {
    const off = { ...DEFAULT_RECORD_SETTINGS, autoStart: false };
    expect(state({ settings: off }).hint).not.toContain('first note');
    expect(state({ settings: DEFAULT_RECORD_SETTINGS }).hint).toContain('first note');
  });

  it('is red while live and never red at rest', () => {
    expect(state({ isRecording: true }).variant).toBe('danger');
    expect(state({}).variant).toBe('primary');
  });
});

describe('readouts', () => {
  it('formats the length model in one line', () => {
    expect(fmtCycle(4, 8, 2)).toBe('4 BARS · 8.00s (2.00s/bar)');
    expect(fmtCycle(1, 2, 2)).toBe('1 BAR · 2.00s (2.00s/bar)');
    expect(fmtCycle(1, null, null)).toBe('no loop yet');
  });

  it('formats a missing length without pretending it is zero', () => {
    expect(fmtLength(null)).toBe('- : -');
    expect(fmtLength(1.234)).toBe('1.23s');
  });

  it('labels the play control by what it will do next', () => {
    expect(playAllLabel(true)).toContain('STOP');
    expect(playAllLabel(false)).toContain('PLAY');
  });
});

describe('looper mode', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('lands new users on the simple face', () => {
    expect(DEFAULT_LOOPER_MODE).toBe('simple');
    expect(loadLooperMode()).toBe('simple');
  });

  it('round-trips a chosen mode', () => {
    saveLooperMode('advanced');
    expect(loadLooperMode()).toBe('advanced');
    saveLooperMode('simple');
    expect(loadLooperMode()).toBe('simple');
  });

  it('falls back rather than trusting a junk value', () => {
    localStorage.setItem('gp200-studio.looper.mode', 'expert');
    expect(loadLooperMode()).toBe(DEFAULT_LOOPER_MODE);
  });
});
