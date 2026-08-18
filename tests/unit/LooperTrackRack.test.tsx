import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { LooperTrackRack } from '@/components/board/LooperTrackRack';
import type { LooperApi, LooperTrack } from '@/hooks/useLooper';

function makeTrack(overrides: Partial<LooperTrack> = {}): LooperTrack {
  return {
    id: 1,
    kind: 'record',
    label: 'TAKE 1',
    state: 'playing',
    muted: false,
    gain: 1,
    hasAudio: true,
    bars: 1,
    durationSec: 2,
    waveform: null,
    ...overrides,
  };
}

function makeApi(overrides: Partial<LooperApi> = {}): LooperApi {
  return {
    ready: true,
    tracks: [],
    isRecording: false,
    isArmed: false,
    isListening: false,
    recordArmedTrack: null,
    baseDurationSec: 2,
    baseLocked: false,
    baseLockedLabel: null,
    cycleBars: 1,
    cycleDurationSec: 2,
    selectedTrack: null,
    anyPlaying: false,
    hasContent: false,
    getPlayhead: () => 0,
    getRecordElapsedSec: () => 0,
    importing: false,
    importAudioFile: vi.fn(async () => null),
    toggleRecord: vi.fn(),
    cancelRecord: vi.fn(),
    togglePlayAll: vi.fn(),
    togglePlaySelected: vi.fn(),
    toggleMuteSelected: vi.fn(),
    selectNextTrack: vi.fn(),
    selectPrevTrack: vi.fn(),
    selectTrack: vi.fn(),
    togglePlay: vi.fn(),
    setMute: vi.fn(),
    clear: vi.fn(),
    clearAll: vi.fn(),
    setTrackGain: vi.fn(),
    updateTrackGain: vi.fn(),
    setMasterGain: vi.fn(),
    settings: {
      autoStart: false,
      triggerDb: -40,
      recordBars: null,
      tailBlendMs: 0,
      latencyTrimMs: 0,
      masterLevel: 1,
    },
    updateSettings: vi.fn(),
    latencyMs: 0,
    lockBaseSeconds: vi.fn(),
    unlockBase: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    canUndo: false,
    canRedo: false,
    ...overrides,
  } as LooperApi;
}

describe('LooperTrackRack', () => {
  it('gives each track one row, naming it once', () => {
    // The regression this component exists for: the waveforms used to be one
    // list and the controls another, so every label and bar count appeared
    // twice, in two places that could not line up with each other.
    const api = makeApi({
      tracks: [makeTrack({ id: 1, label: 'TAKE 1' }), makeTrack({ id: 2, label: 'TAKE 2' })],
      hasContent: true,
    });
    render(<LooperTrackRack looper={api} />);
    expect(screen.getAllByText('TAKE 1')).toHaveLength(1);
    expect(screen.getAllByText('TAKE 2')).toHaveLength(1);
    // one waveform per track, in the row that owns it
    expect(document.querySelectorAll('canvas')).toHaveLength(2);
  });

  it('shows each track its own level, not a shared default', () => {
    const api = makeApi({
      tracks: [makeTrack({ id: 1, gain: 0.25 }), makeTrack({ id: 2, label: 'TAKE 2', gain: 1 })],
      hasContent: true,
    });
    render(<LooperTrackRack looper={api} />);
    expect(screen.getByLabelText<HTMLInputElement>('Track 1 level').value).toBe('0.25');
    expect(screen.getByLabelText<HTMLInputElement>('Track 2 level').value).toBe('1');
  });

  it('commits a level move to the row, so it survives the drawer closing', () => {
    const api = makeApi({ tracks: [makeTrack()], hasContent: true });
    render(<LooperTrackRack looper={api} />);
    fireEvent.change(screen.getByLabelText('Track 1 level'), { target: { value: '0.5' } });
    expect(api.updateTrackGain).toHaveBeenCalledWith(1, 0.5);
    // NOT the audio-only path, which would leave the row showing the old value
    expect(api.setTrackGain).not.toHaveBeenCalled();
  });

  it('deletes the track whose row the ✕ belongs to', () => {
    const api = makeApi({
      tracks: [makeTrack({ id: 1 }), makeTrack({ id: 2, label: 'TAKE 2' })],
      hasContent: true,
    });
    render(<LooperTrackRack looper={api} />);
    fireEvent.click(screen.getAllByTitle('Delete this track')[1]);
    expect(api.clear).toHaveBeenCalledWith(2);
  });

  it('drops the per-track transport on the simple face', () => {
    const api = makeApi({ tracks: [makeTrack()], hasContent: true });
    const { rerender } = render(<LooperTrackRack looper={api} />);
    expect(screen.queryByRole('button', { name: 'Pause' })).toBeTruthy();
    rerender(<LooperTrackRack looper={api} compact />);
    expect(screen.queryByRole('button', { name: 'Pause' })).toBeNull();
    // mute and level stay: they are mid-session controls, not setup
    expect(screen.getByRole('button', { name: 'Mute' })).toBeTruthy();
  });

  it('says what to do when there are no tracks yet', () => {
    render(<LooperTrackRack looper={makeApi()} />);
    expect(screen.getByText(/hit ● REC to lay down the first loop/)).toBeTruthy();
    expect(document.querySelectorAll('canvas')).toHaveLength(0);
  });
});
