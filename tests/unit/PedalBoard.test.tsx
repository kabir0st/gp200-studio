import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { PRSTDecoder } from '@/core/PRSTDecoder';
import { getEffectName } from '@/core/effectNames';
import { PedalBoard } from '@/components/board/PedalBoard';
import { isWidePedal, isWideSlot, splitRows } from '@/components/board/boardLayout';
import { AudioEngineProvider } from '@/components/AudioEngineProvider';
import { defaultLooperBindings } from '@/core/looperBindings';
import { getPattern } from '@/core/drumMachine';
import type { DrumMachineApi } from '@/hooks/useDrumMachine';
import type { LooperApi } from '@/hooks/useLooper';

// Minimal looper stub: the smoke tests never open the Loop Station drawer, so
// an inert API that satisfies the type is enough. AudioEngineProvider is inert
// at mount (no getUserMedia until enable()), so wrapping is jsdom-safe.
const fakeLooper: LooperApi = {
  ready: false,
  tracks: [],
  isRecording: false,
  recordArmedTrack: null,
  masterLoopLengthSec: null,
  selectedTrack: null,
  anyPlaying: false,
  getPlayhead: () => 0,
  toggleRecord: vi.fn(),
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
  setMasterGain: vi.fn(),
};

// Inert drum machine stub, same rationale as fakeLooper: the smoke tests never
// open the Drums drawer, they only need the top bar's playing readout.
const fakeDrumMachine: DrumMachineApi = {
  playing: false,
  loading: false,
  error: null,
  kitId: 'acoustic',
  patternId: 'rock-basic',
  patternName: 'Basic Rock',
  bpm: 100,
  swing: 0,
  signature: '4/4',
  volume: 80,
  getCurrentStep: () => -1,
  steps: getPattern('rock-basic').steps,
  mutedLanes: new Set(),
  togglePlay: vi.fn(),
  stop: vi.fn(),
  setBpm: vi.fn(),
  setSwing: vi.fn(),
  setSignature: vi.fn(),
  setVolume: vi.fn(),
  selectKit: vi.fn(),
  selectPattern: vi.fn(),
  randomize: vi.fn(),
  toggleStep: vi.fn(),
  toggleLaneMute: vi.fn(),
};

// jsdom has no ResizeObserver (CableLayer uses it to re-measure jacks)
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function loadFixture() {
  const bytes = readFileSync(join(process.cwd(), 'dumps/prts/01-A Start Pedal.prst'));
  return new PRSTDecoder(new Uint8Array(bytes)).decode();
}

function renderBoard(overrides: Partial<Parameters<typeof PedalBoard>[0]> = {}) {
  const preset = loadFixture();
  const props = {
    preset,
    onToggle: vi.fn(),
    onChangeEffect: vi.fn(),
    onParamChange: vi.fn(),
    onMove: vi.fn(),
    dragIndex: null,
    dragOverIndex: null,
    onDragStart: vi.fn(),
    onDragOver: vi.fn(),
    onDrop: vi.fn(),
    patchVolume: 50,
    patchPan: 0,
    patchTempo: 120,
    currentSlot: null,
    connected: false,
    onLoadRequest: vi.fn(),
    onSaveToActiveSlot: undefined,
    onPatchNameChange: vi.fn(),
    onAuthorChange: vi.fn(),
    onVolumeChange: vi.fn(),
    onPanChange: vi.fn(),
    onTempoChange: vi.fn(),
    onCloseRequest: vi.fn(),
    onFxSendChange: vi.fn(),
    onFxReturnChange: vi.fn(),
    onExpParamSelect: vi.fn(),
    onExpMinMax: vi.fn(),
    onCtrlBlockToggle: vi.fn(),
    onCtrlClear: vi.fn(),
    onOpenPatchManager: vi.fn(),
    looper: fakeLooper,
    drumMachine: fakeDrumMachine,
    looperBindings: defaultLooperBindings,
    onLooperBindingsChange: vi.fn(),
    onLooperDrawerOpenChange: vi.fn(),
    looperTriggers: {},
    looperArmedFs: null,
    onLooperArmLearn: vi.fn(),
    onLooperClearTrigger: vi.fn(),
    looperLearnNotice: null,
    looperTakeover: false,
    onLooperTakeoverChange: vi.fn(),
    sendCC: vi.fn(),
    ccChannel: 0,
    onCcChannelChange: vi.fn(),
    onEnableAudio: vi.fn(),
    audioStarting: false,
    onConnectRequest: vi.fn(),
    onDisconnect: vi.fn(),
    onPushRequest: vi.fn(),
    pushProgress: null,
    firmware: null,
    ...overrides,
  };
  const utils = render(<PedalBoard {...props} />, { wrapper: AudioEngineProvider });
  return { preset, props, ...utils };
}

// dumps/ is gitignored (real device exports, not committed), so this suite only
// runs on a machine that has them. Same convention as PRSTEncoder.test.ts.
const HAS_FIXTURES = existsSync(join(process.cwd(), 'dumps/prts/01-A Start Pedal.prst'));

describe.skipIf(!HAS_FIXTURES)('PedalBoard (render smoke test)', () => {
  beforeAll(() => {
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  });

  it('renders all 11 slots as pedals split across two width-balanced rows', () => {
    const { container, preset } = renderBoard();
    const pedals = container.querySelectorAll('article.pedal');
    expect(pedals).toHaveLength(11);
    const { front, back } = splitRows(preset.effects);
    expect(container.querySelectorAll('[data-row="front"]')).toHaveLength(front.length);
    expect(container.querySelectorAll('[data-row="back"]')).toHaveLength(back.length);
    // chain order is stamped for the cable layer
    const chains = [...pedals].map((p) => Number(p.getAttribute('data-chain'))).sort((a, b) => a - b);
    expect(chains).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('splitRows balances by visual width and preserves chain order', () => {
    const preset = loadFixture();
    const { front, back } = splitRows(preset.effects);
    expect([...front, ...back]).toEqual(preset.effects);
    const units = (slots: typeof preset.effects) =>
      slots.reduce((sum, s) => sum + (isWidePedal(s.effectId) ? 2 : 1), 0);
    // front row never exceeds half the total width (the wide-AMP overflow bug)
    const total = units(preset.effects);
    expect(units(front)).toBeLessThanOrEqual(Math.ceil(total / 2));
    expect(front.length).toBeGreaterThan(0);
    expect(back.length).toBeGreaterThan(0);
  });

  it('every slot renders its fixed hardware module; CAB is always on the board', () => {
    const { container } = renderBoard();
    const chips = [...container.querySelectorAll('article.pedal .module-chip')].map((c) => c.textContent);
    expect(chips).toContain('CAB');
    expect(chips).toContain('AMP');
  });

  it('a bypassed slot gets the scrim class and BYPASSED tag', () => {
    const preset = loadFixture();
    preset.effects[0] = { ...preset.effects[0], enabled: false };
    preset.effects[1] = { ...preset.effects[1], enabled: true };
    const { container } = renderBoard({ preset });
    const pedal = container.querySelector('article.pedal[data-chain="0"]')!;
    expect(pedal.className).toContain('bypassed');
    expect(pedal.querySelector('.p-off-tag')?.textContent).toBe('BYPASSED');
    // an enabled pedal has neither
    const second = container.querySelector('article.pedal[data-chain="1"]')!;
    expect(second.className).not.toContain('bypassed');
    expect(second.querySelector('.p-off-tag')).toBeNull();
  });

  it('shows the chain strip with one chip per slot and the info-bar hint', () => {
    const { container } = renderBoard();
    expect(container.querySelectorAll('.chain-node')).toHaveLength(11);
    expect(container.querySelector('.info-bar')?.textContent).toContain('Hover a pedal');
  });

  it('footswitch click reports the slot identity, not the array position', () => {
    const { props, preset, container } = renderBoard();
    const firstPedal = container.querySelector('article.pedal[data-chain="0"]')!;
    fireEvent.click(firstPedal.querySelector('.treadle, .stomp-round')!);
    const first = preset.effects[0];
    expect(props.onToggle).toHaveBeenCalledWith(first.slotIndex, first.enabled);
  });

  it('pinning via the ⓘ chip fills the info bar and ✕ unpins', () => {
    const { preset, container } = renderBoard();
    const pedal = container.querySelector('article.pedal[data-chain="0"]')!;
    fireEvent.click(pedal.querySelector('.info-chip')!);
    const bar = container.querySelector('.info-bar')!;
    expect(bar.className).toContain('pinned');
    expect(bar.querySelector('.i-name')?.textContent).toBe(getEffectName(preset.effects[0].effectId));
    fireEvent.click(screen.getByLabelText('Unpin info'));
    expect(container.querySelector('.info-bar')?.textContent).toContain('Hover a pedal');
  });

  it('the EQ pedal renders faders, not knobs', () => {
    const { container } = renderBoard();
    const eqPedal = [...container.querySelectorAll('article.pedal')].find(
      (p) => p.querySelector('.module-chip')?.textContent === 'EQ',
    )!;
    expect(eqPedal).toBeDefined();
    expect(eqPedal.querySelectorAll('.fader').length).toBeGreaterThan(0);
    expect(eqPedal.querySelectorAll('.knob')).toHaveLength(0);
  });

  it('offline deck offers CONNECT instead of LOAD/SAVE; connected deck can LOAD', () => {
    const offline = renderBoard();
    const offlineButtons = [...offline.container.querySelectorAll('button.deck-btn')].map((b) => b.textContent);
    expect(offlineButtons).toContain('CONNECT GP-200');
    expect(offlineButtons.some((t) => t?.startsWith('SAVE'))).toBe(false);
    offline.unmount();

    const connected = renderBoard({ connected: true, currentSlot: 4 });
    const save = [...connected.container.querySelectorAll('button.deck-btn')].find((b) => b.textContent?.startsWith('SAVE TO'))!;
    expect(save).toBeDisabled(); // no onSaveToActiveSlot handler passed
    fireEvent.click(screen.getByRole('button', { name: 'LOAD' }));
    expect(connected.props.onLoadRequest).toHaveBeenCalled();
  });

  it('every pedal sits in a fixed-size bay; wide bays match the slot module', () => {
    const { container, preset } = renderBoard();
    const bays = container.querySelectorAll('.pedal-bay');
    expect(bays).toHaveLength(11);
    // every pedal is wrapped by a bay (the bay is what holds the fixed footprint)
    for (const bay of bays) expect(bay.querySelector('article.pedal')).not.toBeNull();
    // a bay is wide iff its slot's module is wide: stable, effect-independent
    const wideBays = [...bays].filter((b) => b.classList.contains('wide')).length;
    const wideSlots = preset.effects.filter((e) => isWideSlot(e.slotIndex)).length;
    expect(wideBays).toBe(wideSlots);
    // every pedal shows the drag-grip affordance
    expect(container.querySelectorAll('article.pedal .pedal-grip')).toHaveLength(11);
  });

  it('isWideSlot is keyed to the fixed module, not the chosen effect', () => {
    // AMP (slot 3) is a wide module; CAB (5) and VOL (10) are always compact.
    // Because it takes only slotIndex, swapping effects can never change it;
    // that stability is what keeps neighbours from reflowing on an effect swap.
    expect(isWideSlot(3)).toBe(true);
    expect(isWideSlot(5)).toBe(false);
    expect(isWideSlot(10)).toBe(false);
  });

  it('chain reads top-left to bottom-right with IN/OUT marked', () => {
    const { container, preset } = renderBoard();
    const rows = container.querySelectorAll('.board-row');
    const { front } = splitRows(preset.effects);
    const firstRowNums = [...rows[0].querySelectorAll('[data-chain]')].map((p) => Number(p.getAttribute('data-chain')));
    expect(firstRowNums).toEqual(front.map((_, i) => i));
    expect(rows[0].querySelector('.flow-badge')?.textContent).toContain('IN');
    expect(rows[1].querySelector('.flow-badge')?.textContent).toContain('OUT');
    expect(container.querySelectorAll('.chain-end')).toHaveLength(2);
  });
});
