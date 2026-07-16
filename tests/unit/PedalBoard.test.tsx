import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { PRSTDecoder } from '@/core/PRSTDecoder';
import { getEffectName } from '@/core/effectNames';
import { PedalBoard } from '@/components/board/PedalBoard';

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
    ...overrides,
  };
  const utils = render(<PedalBoard {...props} />);
  return { preset, props, ...utils };
}

describe('PedalBoard (render smoke test)', () => {
  beforeAll(() => {
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  });

  it('renders all 11 slots as pedals split across two rows', () => {
    const { container } = renderBoard();
    const pedals = container.querySelectorAll('article.pedal');
    expect(pedals).toHaveLength(11);
    expect(container.querySelectorAll('[data-row="front"]')).toHaveLength(6);
    expect(container.querySelectorAll('[data-row="back"]')).toHaveLength(5);
    // chain order is stamped for the cable layer
    const chains = [...pedals].map((p) => Number(p.getAttribute('data-chain'))).sort((a, b) => a - b);
    expect(chains).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
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

  it('SAVE is disabled while offline; LOAD requests the slot browser', () => {
    const { props, container } = renderBoard();
    const save = [...container.querySelectorAll('button.hw-btn')].find((b) => b.textContent?.startsWith('SAVE'))!;
    expect(save).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'LOAD' }));
    expect(props.onLoadRequest).toHaveBeenCalled();
  });
});
