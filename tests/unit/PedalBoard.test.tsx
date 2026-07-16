import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { PRSTDecoder } from '@/core/PRSTDecoder';
import { getEffectName } from '@/core/effectNames';
import { PedalBoard } from '@/components/board/PedalBoard';
import { isWidePedal, splitRows } from '@/components/board/boardLayout';

// jsdom has no ResizeObserver (CableLayer uses it to re-measure jacks)
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function loadFixture() {
  const bytes = readFileSync(join(process.cwd(), 'prst/63-B American Idiot.prst'));
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
    onImportFile: vi.fn(),
    onExportRequest: vi.fn(),
    onCloseRequest: vi.fn(),
    onFxSendChange: vi.fn(),
    onFxReturnChange: vi.fn(),
    onExpParamSelect: vi.fn(),
    onExpMinMax: vi.fn(),
    onCtrlBlockToggle: vi.fn(),
    onOpenPatchManager: vi.fn(),
    onConnectRequest: vi.fn(),
    onDisconnect: vi.fn(),
    onPushRequest: vi.fn(),
    pushProgress: null,
    firmware: null,
    ...overrides,
  };
  const utils = render(<PedalBoard {...props} />);
  return { preset, props, ...utils };
}

describe('PedalBoard (render smoke test)', () => {
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

  it('every slot renders its fixed hardware module — CAB is always on the board', () => {
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
