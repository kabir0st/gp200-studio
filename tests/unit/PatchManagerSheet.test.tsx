import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { PatchManagerSheet } from '@/components/PatchManagerSheet';

function makeNames(): (string | null)[] {
  const names = new Array<string | null>(256).fill(null);
  names[0] = 'Clean';
  names[1] = 'Crunch';
  names[248] = 'American Idiot';
  return names;
}

function renderSheet(overrides: Partial<Parameters<typeof PatchManagerSheet>[0]> = {}) {
  const props = {
    open: true,
    onClose: vi.fn(),
    connected: true,
    presetNames: makeNames(),
    namesLoadProgress: 256,
    currentSlot: 0,
    onActivate: vi.fn(),
    onOpenInEditor: vi.fn().mockResolvedValue(undefined),
    onExportSlot: vi.fn().mockResolvedValue(undefined),
    onExportSlots: vi.fn().mockResolvedValue(undefined),
    bulkProgress: null,
    onCancelBulk: vi.fn(),
    onImportToSlot: vi.fn().mockResolvedValue(undefined),
    onRenameSlot: vi.fn().mockResolvedValue(undefined),
    onRefreshNames: vi.fn(),
    ...overrides,
  };
  const utils = render(<PatchManagerSheet {...props} />);
  return { props, ...utils };
}

describe('PatchManagerSheet', () => {
  it('renders the 256-slot grid with loaded names', () => {
    renderSheet();
    expect(screen.getByText('Clean')).toBeTruthy();
    expect(screen.getByText('American Idiot')).toBeTruthy();
    expect(screen.getByText('now: 1A')).toBeTruthy();
  });

  it('filters slots via search', () => {
    renderSheet();
    fireEvent.change(screen.getByPlaceholderText('Search patches…'), {
      target: { value: 'crunch' },
    });
    expect(screen.getByText('Crunch')).toBeTruthy();
    expect(screen.queryByText('American Idiot')).toBeNull();
  });

  it('activates the selected slot', () => {
    const { props } = renderSheet();
    fireEvent.click(screen.getByText('Crunch'));
    fireEvent.click(screen.getByText('ACTIVATE'));
    expect(props.onActivate).toHaveBeenCalledWith(1);
  });

  it('exports the selected bank (4 slots)', () => {
    const { props } = renderSheet();
    fireEvent.click(screen.getByText('Crunch')); // slot 1 → bank slots 0..3
    fireEvent.click(screen.getByText('EXPORT BANK'));
    expect(props.onExportSlots).toHaveBeenCalledWith([0, 1, 2, 3]);
  });

  it('disables slot actions while disconnected', () => {
    renderSheet({ connected: false });
    const activate = screen.getByText('ACTIVATE').closest('button');
    expect(activate?.disabled).toBe(true);
  });

  it('shows bulk progress with a cancel control', () => {
    const { props } = renderSheet({ bulkProgress: { done: 12, total: 256 } });
    expect(screen.getByText('12/256')).toBeTruthy();
    fireEvent.click(screen.getByText('cancel'));
    expect(props.onCancelBulk).toHaveBeenCalled();
  });

  it('commits a rename through the inline input', async () => {
    const { props } = renderSheet();
    fireEvent.click(screen.getByText('Crunch'));
    fireEvent.click(screen.getByText('RENAME'));
    const input = screen.getByDisplayValue('Crunch');
    fireEvent.change(input, { target: { value: 'Lead Boost' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await vi.waitFor(() => {
      expect(props.onRenameSlot).toHaveBeenCalledWith(1, 'Lead Boost');
    });
  });
});
