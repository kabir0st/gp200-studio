import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BulkApplySection } from '../../src/components/BulkApplySection';

function renderSection(
  overrides: Partial<Parameters<typeof BulkApplySection>[0]> = {},
) {
  const props = {
    connected: true,
    canCopyCtrl: true,
    progress: null,
    onApply: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  };
  const utils = render(<BulkApplySection {...props} />);
  return { props, ...utils };
}

describe('BulkApplySection', () => {
  it('confirms, then reports scope and selections upward', () => {
    const { props } = renderSection();
    fireEvent.change(screen.getByLabelText('From bank'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('To bank'), { target: { value: '4' } });
    fireEvent.click(screen.getByText('APPLY…'));
    expect(props.onApply).not.toHaveBeenCalled();
    expect(screen.getByText(/banks 3–4 \(8 patches\)/)).toBeTruthy();
    fireEvent.click(screen.getByText('Apply'));
    expect(props.onApply).toHaveBeenCalledWith(
      { kind: 'banks', fromBank: 3, toBank: 4 },
      { ctrl: true, volume: null },
    );
  });

  it('disables the CTRL copy when the patch has no assignments', () => {
    renderSection({ canCopyCtrl: false });
    expect(screen.getByText(/no CTRL assignments to copy/)).toBeTruthy();
    const applyButton = screen.getByText('APPLY…').closest('button');
    expect(applyButton?.disabled).toBe(true);
  });

  it('shows progress with a cancel control while running', () => {
    const { props } = renderSection({
      progress: { done: 5, total: 20, slot: 12 },
    });
    expect(screen.getByText(/Writing 4A · 5\/20/)).toBeTruthy();
    fireEvent.click(screen.getByText('cancel'));
    expect(props.onCancel).toHaveBeenCalled();
  });

  it('asks to connect when offline', () => {
    renderSection({ connected: false });
    expect(screen.getByText(/Connect the GP-200/)).toBeTruthy();
    expect(screen.queryByText('APPLY…')).toBeNull();
  });
});
