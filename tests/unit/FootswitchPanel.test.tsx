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
  it('renders 8 CTRL rows × 11 block chips with masks from the preset', () => {
    const preset = loadFixture();
    const { container, getByText } = render(
      <FootswitchPanel
        preset={preset}
        currentSlot={null}
        connected={false}
        onCtrlBlockToggle={vi.fn()}
      />,
    );
    expect(getByText('CTRL 1')).toBeTruthy();
    expect(getByText('CTRL 8')).toBeTruthy();
    const chips = container.querySelectorAll('button[aria-pressed]');
    expect(chips).toHaveLength(88);
    // Fixture: CTRL 1 mask 0x01 → exactly PRE active; CTRL 5 mask 0x83 →
    // PRE + WAH + MOD active.
    const pressed = container.querySelectorAll('button[aria-pressed="true"]');
    // 1 (CTRL1) + 3 (CTRL5) + 2 (CTRL6 0x82) + 3 (CTRL7 0x86) + 3 (CTRL8 0x8C)
    expect(pressed).toHaveLength(12);
  });

  it('reports chip toggles with ctrl index, block index, and next state', () => {
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
    const chips = container.querySelectorAll('button[aria-pressed]');
    // First chip = CTRL 1 / PRE, active in the fixture (mask 0x01) → off
    fireEvent.click(chips[0]);
    expect(onToggle).toHaveBeenCalledWith(0, 0, false);
    // Second chip = CTRL 1 / WAH, inactive → on
    fireEvent.click(chips[1]);
    expect(onToggle).toHaveBeenCalledWith(0, 1, true);
  });

  it('renders all-off chips for a preset without decoded assignments', () => {
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
