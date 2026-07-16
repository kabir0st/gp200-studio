import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { PRSTDecoder } from '@/core/PRSTDecoder';
import { FootswitchPanel } from '@/components/FootswitchPanel';

function loadFixture() {
  const bytes = readFileSync(join(process.cwd(), 'prst/63-B American Idiot.prst'));
  return new PRSTDecoder(new Uint8Array(bytes)).decode();
}

describe('FootswitchPanel', () => {
  it('renders 8 footswitch selectors and 11 pedal cards', () => {
    const preset = loadFixture();
    const { container, getAllByRole } = render(
      <FootswitchPanel
        preset={preset}
        currentSlot={null}
        connected={false}
        onCtrlBlockToggle={vi.fn()}
      />,
    );
    expect(getAllByRole('radio')).toHaveLength(8);
    const cards = container.querySelectorAll('button[aria-pressed]');
    expect(cards).toHaveLength(11);
  });

  it('shows the selected CTRL mask on the pedal cards', () => {
    const preset = loadFixture();
    const { container, getByRole } = render(
      <FootswitchPanel
        preset={preset}
        currentSlot={null}
        connected={false}
        onCtrlBlockToggle={vi.fn()}
      />,
    );
    // Fixture: CTRL 1 mask 0x01 → only PRE assigned on the default selection.
    expect(container.querySelectorAll('button[aria-pressed="true"]')).toHaveLength(1);
    // Fixture: CTRL 5 mask 0x83 → PRE + WAH + MOD assigned.
    fireEvent.click(getByRole('radio', { name: /CTRL 5/ }));
    expect(container.querySelectorAll('button[aria-pressed="true"]')).toHaveLength(3);
  });

  it('reports card toggles with ctrl index, block index, and next state', () => {
    const preset = loadFixture();
    const onToggle = vi.fn();
    const { container } = render(
      <FootswitchPanel
        preset={preset}
        currentSlot={null}
        connected={false}
        onCtrlBlockToggle={onToggle}
      />,
    );
    const cards = container.querySelectorAll('button[aria-pressed]');
    // First card = PRE, assigned on CTRL 1 in the fixture (mask 0x01) → off
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
        preset={preset}
        currentSlot={null}
        connected={false}
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
        preset={preset}
        currentSlot={null}
        connected={false}
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
        preset={preset}
        currentSlot={null}
        connected={false}
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
        preset={preset}
        currentSlot={null}
        connected={false}
        onCtrlBlockToggle={vi.fn()}
      />,
    );
    expect(container.querySelectorAll('button[aria-pressed="true"]')).toHaveLength(0);
  });

  it('mentions the device save target when connected', () => {
    const preset = loadFixture();
    const { getByText } = render(
      <FootswitchPanel
        preset={preset}
        currentSlot={249}
        connected
        onCtrlBlockToggle={vi.fn()}
      />,
    );
    expect(getByText(/SAVE TO 63B/)).toBeTruthy();
  });
});
