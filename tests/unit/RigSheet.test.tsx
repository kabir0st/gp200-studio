import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RigSheet } from '@/components/RigSheet';
import type { GP200Preset } from '@/core/types';

function preset(overrides: Partial<GP200Preset> = {}): GP200Preset {
  return {
    version: '1',
    patchName: 'Pink Run',
    author: 'RicardoMV',
    effects: Array.from({ length: 11 }, (_, i) => ({
      slotIndex: i,
      effectId: 0,
      enabled: i !== 5,
      params: Array(15).fill(0),
    })),
    checksum: 0,
    fxLoopSend: 4,
    fxLoopReturn: 9,
    fxLoopMode: 1,
    patchVolume: 86,
    patchPan: -30,
    patchStyle: 5,
    patchTempo: 132,
    patchNote: '4CM for my Marshall',
    ...overrides,
  } as GP200Preset;
}

const names = () => {
  const list = new Array<string | null>(256).fill(null);
  list[0] = 'Clean';
  list[7] = 'Pink Run';
  return list;
};

describe('RigSheet', () => {
  it('prints the patch metadata the pedal stores', () => {
    const { container } = render(
      <RigSheet preset={preset()} currentSlot={7} presetNames={names()} />,
    );
    // Queried by selector, not by role: the sheet is aria-hidden on purpose
    // (see the last case), so nothing inside it is in the a11y tree.
    expect(container.querySelector('.rs-head h1')).toHaveTextContent('Pink Run');
    expect(screen.getByText('RicardoMV')).toBeInTheDocument();
    expect(screen.getByText('Rock')).toBeInTheDocument();
    expect(screen.getByText('132 BPM')).toBeInTheDocument();
    expect(screen.getByText('L30')).toBeInTheDocument();
    expect(screen.getByText('4CM for my Marshall')).toBeInTheDocument();
  });

  it('describes the FX loop as positions plus routing mode', () => {
    render(<RigSheet preset={preset()} currentSlot={null} presetNames={names()} />);
    expect(screen.getByText('4 → 9, serial')).toBeInTheDocument();
  });

  it('calls out a bypassed loop rather than printing a zero-width range', () => {
    render(
      <RigSheet
        preset={preset({ fxLoopSend: 6, fxLoopReturn: 6 })}
        currentSlot={null}
        presetNames={names()}
      />,
    );
    expect(screen.getByText('bypassed')).toBeInTheDocument();
  });

  it('lists every chain block, marking the bypassed ones', () => {
    render(<RigSheet preset={preset()} currentSlot={7} presetNames={names()} />);
    expect(screen.getAllByText('ON')).toHaveLength(10);
    expect(screen.getAllByText('off')).toHaveLength(1);
  });

  it('lists only the named slots', () => {
    render(<RigSheet preset={preset()} currentSlot={7} presetNames={names()} />);
    expect(screen.getByText('Patches (2)')).toBeInTheDocument();
    expect(screen.getByText('Clean')).toBeInTheDocument();
  });

  it('stays out of the accessibility tree — it is a print-only surface', () => {
    const { container } = render(
      <RigSheet preset={preset()} currentSlot={null} presetNames={names()} />,
    );
    expect(container.querySelector('.rig-sheet')).toHaveAttribute('aria-hidden', 'true');
  });
});
