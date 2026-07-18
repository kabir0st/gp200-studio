import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { PRSTDecoder } from '@/core/PRSTDecoder';
import { FootswitchPanel } from '@/components/FootswitchPanel';

// Real device export; CTRL masks: PRE, EQ, DST, MOD, DLY, RVB, none, bit-11.
function loadFixture() {
  const bytes = readFileSync(join(process.cwd(), 'dumps/prts/01-A Start Pedal.prst'));
  return new PRSTDecoder(new Uint8Array(bytes)).decode();
}

// Module name from a pedal card's title, e.g. "CTRL 2 → EQ: Guitar EQ 1" → "EQ".
function moduleOf(card: Element): string {
  return /→ (\w+):/.exec(card.getAttribute('title') ?? '')?.[1] ?? '';
}

describe('FootswitchPanel', () => {
  it('renders 8 footswitch selectors and 11 pedal cards', () => {
    const preset = loadFixture();
    const { container, getAllByRole } = render(
      <FootswitchPanel
        preset={preset}        connected={false}
        onCtrlBlockToggle={vi.fn()}
      />,
    );
    expect(getAllByRole('radio')).toHaveLength(8);
    const cards = container.querySelectorAll('button[aria-pressed]');
    expect(cards).toHaveLength(11);
  });

  it('shows the selected CTRL mask on the pedal cards, by module name', () => {
    const preset = loadFixture();
    const { container, getByRole } = render(
      <FootswitchPanel
        preset={preset}        connected={false}
        onCtrlBlockToggle={vi.fn()}
      />,
    );
    const pressed = () =>
      Array.from(container.querySelectorAll('button[aria-pressed="true"]'));
    // Fixture: CTRL 1 mask 0x001 → exactly PRE on the default selection.
    expect(pressed().map(moduleOf)).toEqual(['PRE']);
    // CTRL 2 mask 0x040 → exactly EQ. Regression: the old parser read the
    // state byte + uninitialized memory as the mask and lit phantom
    // PRE/DLY/RVB/VOL pedals here.
    fireEvent.click(getByRole('radio', { name: /CTRL 2/ }));
    expect(pressed().map(moduleOf)).toEqual(['EQ']);
    // CTRL 5 mask 0x100 → exactly DLY.
    fireEvent.click(getByRole('radio', { name: /CTRL 5/ }));
    expect(pressed().map(moduleOf)).toEqual(['DLY']);
    // CTRL 8 mask 0x800 (bit 11, beyond the 11 modeled blocks) → nothing lit.
    fireEvent.click(getByRole('radio', { name: /CTRL 8/ }));
    expect(pressed()).toHaveLength(0);
  });

  it('reports card toggles with ctrl index, block index, and next state', () => {
    const preset = loadFixture();
    const onToggle = vi.fn();
    const { container } = render(
      <FootswitchPanel
        preset={preset}        connected={false}
        onCtrlBlockToggle={onToggle}
      />,
    );
    const cards = container.querySelectorAll('button[aria-pressed]');
    // First card = PRE, assigned on CTRL 1 in the fixture (mask 0x001) → off
    fireEvent.click(cards[0]);
    expect(onToggle).toHaveBeenCalledWith(0, 0, false);
    // Second card = WAH, unassigned → on
    fireEvent.click(cards[1]);
    expect(onToggle).toHaveBeenCalledWith(0, 1, true);
  });

  it('reports toggles for the selected CTRL after switching', () => {
    const preset = loadFixture();
    const onToggle = vi.fn();
    const { container, getByRole } = render(
      <FootswitchPanel
        preset={preset}        connected={false}
        onCtrlBlockToggle={onToggle}
      />,
    );
    fireEvent.click(getByRole('radio', { name: /CTRL 3/ }));
    const cards = container.querySelectorAll('button[aria-pressed]');
    fireEvent.click(cards[0]);
    expect(onToggle).toHaveBeenCalledWith(2, 0, true);
  });

  it('clears the selected CTRL via the Clear button', () => {
    const preset = loadFixture();
    const onClear = vi.fn();
    const { getByRole, getByText } = render(
      <FootswitchPanel
        preset={preset}        connected={false}
        onCtrlBlockToggle={vi.fn()}
        onCtrlClear={onClear}
      />,
    );
    fireEvent.click(getByRole('radio', { name: /CTRL 5/ }));
    fireEvent.click(getByText('Clear'));
    expect(onClear).toHaveBeenCalledWith(4);
  });

  it('disables Clear when the selected CTRL has no assignments', () => {
    const preset = { ...loadFixture(), ctrlAssignments: undefined };
    const { getByText } = render(
      <FootswitchPanel
        preset={preset}        connected={false}
        onCtrlBlockToggle={vi.fn()}
        onCtrlClear={vi.fn()}
      />,
    );
    expect((getByText('Clear') as HTMLButtonElement).disabled).toBe(true);
  });

  it('renders all-off cards for a preset without decoded assignments', () => {
    const preset = { ...loadFixture(), ctrlAssignments: undefined };
    const { container } = render(
      <FootswitchPanel
        preset={preset}        connected={false}
        onCtrlBlockToggle={vi.fn()}
      />,
    );
    expect(container.querySelectorAll('button[aria-pressed="true"]')).toHaveLength(0);
  });

  it('says device sync is unavailable while connected', () => {
    const preset = loadFixture();
    const { getByText } = render(
      <FootswitchPanel
        preset={preset}
        connected
        onCtrlBlockToggle={vi.fn()}
      />,
    );
    expect(getByText(/not possible yet/)).toBeTruthy();
    expect(getByText(/SAVE TO does not carry them/)).toBeTruthy();
  });
});
