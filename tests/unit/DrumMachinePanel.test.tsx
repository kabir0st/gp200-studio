import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { DrumMachinePanel } from '../../src/components/board/DrumMachinePanel';
import { getPattern } from '../../src/core/drumMachine';
import type { DrumMachineApi } from '../../src/hooks/useDrumMachine';

function makeApi(overrides: Partial<DrumMachineApi> = {}): DrumMachineApi {
  const rockBasic = getPattern('rock-basic');
  return {
    playing: false,
    loading: false,
    error: null,
    kitId: 'acoustic',
    patternId: rockBasic.id,
    patternName: rockBasic.name,
    bpm: rockBasic.bpm,
    followPatch: false,
    patchTempo: 120,
    swing: 0,
    signature: rockBasic.signature,
    volume: 80,
    getCurrentStep: () => -1,
    steps: rockBasic.steps,
    mutedLanes: new Set(),
    togglePlay: vi.fn(),
    stop: vi.fn(),
    setBpm: vi.fn(),
    setFollowPatch: vi.fn(),
    setSwing: vi.fn(),
    setSignature: vi.fn(),
    setVolume: vi.fn(),
    selectKit: vi.fn(),
    selectPattern: vi.fn(),
    randomize: vi.fn(),
    toggleStep: vi.fn(),
    toggleLaneMute: vi.fn(),
    ...overrides,
  };
}

describe('DrumMachinePanel', () => {
  it('renders a full 8-lane × 16-step grid', () => {
    render(<DrumMachinePanel drums={makeApi()} />);
    const cells = screen.getAllByRole('button', { name: /step \d+$/ });
    expect(cells).toHaveLength(8 * 16);
  });

  it('toggles play and steps through the api', () => {
    const api = makeApi();
    render(<DrumMachinePanel drums={api} />);
    fireEvent.click(screen.getByRole('button', { name: '▶ PLAY' }));
    expect(api.togglePlay).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'SNARE step 5' }));
    expect(api.toggleStep).toHaveBeenCalledWith('snare', 4);
  });

  it('selects kits and patterns', () => {
    const api = makeApi();
    render(<DrumMachinePanel drums={api} />);
    fireEvent.change(screen.getByLabelText('Drum kit'), { target: { value: 'tr808' } });
    expect(api.selectKit).toHaveBeenCalledWith('tr808');
    fireEvent.change(screen.getByLabelText('Drum pattern'), {
      target: { value: 'blues-shuffle' },
    });
    expect(api.selectPattern).toHaveBeenCalledWith('blues-shuffle');
  });

  it('randomizes in the chosen style', () => {
    const api = makeApi();
    render(<DrumMachinePanel drums={api} />);
    fireEvent.change(screen.getByLabelText('Randomizer style'), {
      target: { value: 'Groove' },
    });
    fireEvent.click(screen.getByRole('button', { name: '🎲 RANDOM' }));
    expect(api.randomize).toHaveBeenCalledWith('Groove');
  });

  it('changes the time signature and resizes the grid', () => {
    const api = makeApi();
    render(<DrumMachinePanel drums={api} />);
    fireEvent.change(screen.getByLabelText('Time signature'), {
      target: { value: '3/4' },
    });
    expect(api.setSignature).toHaveBeenCalledWith('3/4');
  });

  it('renders a 12-column grid in 3/4', () => {
    const api = makeApi({ signature: '3/4' });
    render(<DrumMachinePanel drums={api} />);
    const cells = screen.getAllByRole('button', { name: /step \d+$/ });
    expect(cells).toHaveLength(8 * 12);
  });

  it('mutes a lane from its label button', () => {
    const api = makeApi();
    render(<DrumMachinePanel drums={api} />);
    fireEvent.click(screen.getByRole('button', { name: 'KICK' }));
    expect(api.toggleLaneMute).toHaveBeenCalledWith('kick');
  });

  it('shows a transient option while a custom pattern is active', () => {
    const api = makeApi({ patternId: 'custom', patternName: 'Custom' });
    render(<DrumMachinePanel drums={api} />);
    const patternSelect = screen.getByLabelText<HTMLSelectElement>('Drum pattern');
    expect(patternSelect.value).toBe('custom');
  });

  it('offers the patch-tempo link as an off-by-default toggle', () => {
    const api = makeApi();
    render(<DrumMachinePanel drums={api} />);
    const link = screen.getByRole('button', { name: /PATCH TEMPO/ });
    expect(link.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(link);
    expect(api.setFollowPatch).toHaveBeenCalledWith(true);
  });

  it('hands the BPM slider over to the patch while the link is on', () => {
    // The tempo has one owner at a time: leaving the slider live would invite
    // an edit that the next patch-tempo change silently overwrites.
    const api = makeApi({ followPatch: true, patchTempo: 96 });
    render(<DrumMachinePanel drums={api} />);
    expect(screen.getByLabelText<HTMLInputElement>('BPM').disabled).toBe(true);
    const link = screen.getByRole('button', { name: /PATCH TEMPO/ });
    expect(link.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(link);
    expect(api.setFollowPatch).toHaveBeenCalledWith(false);
  });
});
