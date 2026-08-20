import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { PRSTDecoder } from '@/core/PRSTDecoder';
import { FootswitchPanel } from '@/components/FootswitchPanel';

// Real device export; CTRL masks: PRE, EQ, DST, MOD, DLY, RVB, none, FX LOOP.
function loadFixture() {
  const bytes = readFileSync(join(process.cwd(), 'dumps/prts/01-A Start Pedal.prst'));
  return new PRSTDecoder(new Uint8Array(bytes)).decode();
}

// Module label from a pedal card's title, e.g. "CTRL 2 → EQ: Guitar EQ 1" → "EQ"
// or "CTRL 8 → FX LOOP: …" → "FX LOOP" (labels can contain a space).
function moduleOf(card: Element): string {
  return /→ (.+?):/.exec(card.getAttribute('title') ?? '')?.[1] ?? '';
}

// dumps/ is gitignored (real device exports, not committed), so this suite only
// runs on a machine that has them. Same convention as PRSTEncoder.test.ts.
const HAS_FIXTURES = existsSync(join(process.cwd(), 'dumps/prts/01-A Start Pedal.prst'));

describe.skipIf(!HAS_FIXTURES)('FootswitchPanel', () => {
  it('renders 8 footswitch selectors and 12 pedal cards (11 blocks + FX LOOP)', () => {
    const preset = loadFixture();
    const { container, getAllByRole } = render(
      <FootswitchPanel
        preset={preset}        connected={false}
        onCtrlBlockToggle={vi.fn()}
      />,
    );
    expect(getAllByRole('radio')).toHaveLength(8);
    const cards = container.querySelectorAll('button[aria-pressed]');
    expect(cards).toHaveLength(12);
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
    // CTRL 8 mask 0x800 → bit 11 = the FX LOOP target (a real export value).
    fireEvent.click(getByRole('radio', { name: /CTRL 8/ }));
    expect(pressed().map(moduleOf)).toEqual(['FX LOOP']);
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

  it('says edits reach the device live while connected', () => {
    const preset = loadFixture();
    const { getByText, queryByText } = render(
      <FootswitchPanel
        preset={preset}
        connected
        onCtrlBlockToggle={vi.fn()}
      />,
    );
    expect(getByText(/sent to the connected GP-200 straight away/)).toBeTruthy();
    // No SAVE TO caveat anymore: MOD's live encoding (mask nibble [45]) was
    // captured from the official editor on 2026-08-09, so every block —
    // including MOD , syncs live like the rest.
    expect(queryByText(/except MOD/)).toBeNull();
  });

  it('shows no device hint while disconnected', () => {
    const preset = loadFixture();
    const { queryByText } = render(
      <FootswitchPanel
        preset={preset}
        connected={false}
        onCtrlBlockToggle={vi.fn()}
      />,
    );
    expect(queryByText(/sent to the connected GP-200/)).toBeNull();
  });
});

describe('FootswitchPanel: device model', () => {
  // Synthetic preset, so this block runs everywhere rather than only on a
  // machine that has the gitignored device dumps.
  const preset = {
    version: '1',
    patchName: 'Test',
    effects: Array.from({ length: 11 }, (_unused, slotIndex) => ({
      slotIndex, effectId: 0, enabled: true, params: Array(15).fill(0),
    })),
    checksum: 0,
    fxLoopSend: 4,
    fxLoopReturn: 4,
    fxLoopMode: 0,
    patchVolume: 50,
    patchPan: 0,
    patchStyle: 0,
    patchTempo: 120,
  } as unknown as Parameters<typeof FootswitchPanel>[0]['preset'];

  const props = {
    preset,
    connected: false,
    onCtrlBlockToggle: vi.fn(),
    onCtrlClear: vi.fn(),
    onDeviceModelChange: vi.fn(),
  };

  it('draws eight footswitches for the GP-200', () => {
    const { getAllByRole } = render(<FootswitchPanel {...props} deviceModel="gp200" />);
    expect(getAllByRole('radio')).toHaveLength(8);
  });

  it('draws four for the LT', () => {
    const { getAllByRole } = render(<FootswitchPanel {...props} deviceModel="gp200lt" />);
    expect(getAllByRole('radio')).toHaveLength(4);
  });

  it('does not leave the editor pointing at a switch the LT lacks', () => {
    const { getAllByRole, rerender } = render(
      <FootswitchPanel {...props} deviceModel="gp200" />,
    );
    fireEvent.click(getAllByRole('radio')[7]);
    expect(getAllByRole('radio')[7]).toHaveAttribute('aria-checked', 'true');

    rerender(<FootswitchPanel {...props} deviceModel="gp200lt" />);
    const ltSwitches = getAllByRole('radio');
    expect(ltSwitches).toHaveLength(4);
    // Selection lands on the last switch the LT actually has, rather than
    // silently editing a CTRL 8 the user cannot press.
    expect(ltSwitches.filter((s) => s.getAttribute('aria-checked') === 'true')).toHaveLength(1);
    expect(ltSwitches[3]).toHaveAttribute('aria-checked', 'true');
  });
});
