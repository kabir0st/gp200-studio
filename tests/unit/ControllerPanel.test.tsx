import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { PRSTDecoder } from '@/core/PRSTDecoder';
import { ControllerPanel } from '@/components/ControllerPanel';
import type { ExpAssignment, GP200Preset } from '@/core/types';
import { defaultExpAssignments } from '@/core/controlRecords';

function loadFixture(): GP200Preset {
  const bytes = readFileSync(join(process.cwd(), 'prst/63-B American Idiot.prst'));
  return new PRSTDecoder(new Uint8Array(bytes)).decode();
}

function withAssignment(overrides: Partial<ExpAssignment>): GP200Preset {
  const expAssignments = defaultExpAssignments().map((assignment) => {
    const matchesPage = assignment.page === (overrides.page ?? 0);
    const matchesItem = assignment.item === (overrides.item ?? 0);
    if (matchesPage && matchesItem) return { ...assignment, ...overrides };
    return assignment;
  });
  return { ...loadFixture(), expAssignments };
}

describe('ControllerPanel', () => {
  it('renders 3 page selectors and 3 Para cards with pedal + parameter selects', () => {
    const { getAllByRole } = render(
      <ControllerPanel
        preset={loadFixture()}
        connected={false}
        onParamSelect={vi.fn()}
        onMinMax={vi.fn()}
      />,
    );
    expect(getAllByRole('radio')).toHaveLength(3);
    expect(getAllByRole('combobox')).toHaveLength(6);
  });

  it('shows the stored assignment in the pedal select', () => {
    const preset = withAssignment({ blockIndex: 2, paramIndex: 1, min: 10, max: 90 });
    const { getAllByRole } = render(
      <ControllerPanel
        preset={preset}
        connected={false}
        onParamSelect={vi.fn()}
        onMinMax={vi.fn()}
      />,
    );
    const selects = getAllByRole('combobox') as HTMLSelectElement[];
    expect(selects[0].value).toBe('2');
    expect(selects[1].disabled).toBe(false);
    expect(selects[1].value).toBe('1');
  });

  it('reports pedal picks with a reset parameter index', () => {
    const onParamSelect = vi.fn();
    const { getAllByRole } = render(
      <ControllerPanel
        preset={loadFixture()}
        connected={false}
        onParamSelect={onParamSelect}
        onMinMax={vi.fn()}
      />,
    );
    const selects = getAllByRole('combobox') as HTMLSelectElement[];
    fireEvent.change(selects[0], { target: { value: '4' } });
    expect(onParamSelect).toHaveBeenCalledWith(0, 0, 4, 0);
  });

  it('reports unassignment as a null block', () => {
    const preset = withAssignment({ blockIndex: 2 });
    const onParamSelect = vi.fn();
    const { getAllByRole } = render(
      <ControllerPanel
        preset={preset}
        connected={false}
        onParamSelect={onParamSelect}
        onMinMax={vi.fn()}
      />,
    );
    const selects = getAllByRole('combobox') as HTMLSelectElement[];
    fireEvent.change(selects[0], { target: { value: '' } });
    expect(onParamSelect).toHaveBeenCalledWith(0, 0, null, 0);
  });

  it('keeps heel below toe when sliding', () => {
    const preset = withAssignment({ blockIndex: 2, min: 10, max: 90 });
    const onMinMax = vi.fn();
    const { container } = render(
      <ControllerPanel
        preset={preset}
        connected={false}
        onParamSelect={vi.fn()}
        onMinMax={onMinMax}
      />,
    );
    const sliders = container.querySelectorAll('input[type="range"]');
    // Dragging heel past the stored toe (90) pushes toe up with it.
    fireEvent.change(sliders[0], { target: { value: '95' } });
    expect(onMinMax).toHaveBeenCalledWith(0, 0, 95, 95);
  });

  it('targets the selected EXP page', () => {
    const onParamSelect = vi.fn();
    const { getAllByRole, getByRole } = render(
      <ControllerPanel
        preset={loadFixture()}
        connected={false}
        onParamSelect={onParamSelect}
        onMinMax={vi.fn()}
      />,
    );
    fireEvent.click(getByRole('radio', { name: 'EXP 2' }));
    const selects = getAllByRole('combobox') as HTMLSelectElement[];
    fireEvent.change(selects[0], { target: { value: '7' } });
    expect(onParamSelect).toHaveBeenCalledWith(2, 0, 7, 0);
  });
});
