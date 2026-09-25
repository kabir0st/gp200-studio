import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { FocusRail } from '@/components/mobile/FocusRail';
import type { KnobParam } from '@/core/effectParams';

const DEPTH: KnobParam = {
  type: 'knob',
  name: 'Depth',
  idx: 0,
  min: 0,
  max: 100,
  step: 1,
  default: 50,
};

const RATE: KnobParam = {
  type: 'knob',
  name: 'Rate',
  idx: 1,
  min: 0.1,
  max: 10,
  step: 0.1,
  default: 0.5,
};

/** The editor screen's shape: one rail, re-pointed at whichever knob was touched. */
function Harness({
  initialFocus = DEPTH,
  syncedIdx = null,
  onChange,
}: {
  initialFocus?: KnobParam;
  syncedIdx?: number | null;
  onChange?: (idx: number, v: number) => void;
}) {
  const [values, setValues] = useState([71, 0.5]);
  const [focus, setFocus] = useState(initialFocus);
  return (
    <>
      <button type="button" onClick={() => setFocus(RATE)}>
        point at rate
      </button>
      <FocusRail
        param={focus}
        value={values[focus.idx]}
        synced={focus.idx === syncedIdx}
        onChange={(idx, value) => {
          setValues((prev) => {
            const next = [...prev];
            next[idx] = value;
            return next;
          });
          onChange?.(idx, value);
        }}
      />
    </>
  );
}

describe('FocusRail', () => {
  it('steps by one unit', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Decrease Depth' }));
    expect(onChange).toHaveBeenLastCalledWith(0, 70);
  });

  it('types a value on a tap of the readout', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: /Type a value for Depth, now 71/ }));
    const field = screen.getByRole('textbox', { name: /Depth value/ });
    fireEvent.change(field, { target: { value: '64' } });
    fireEvent.keyDown(field, { key: 'Enter' });

    expect(onChange).toHaveBeenLastCalledWith(0, 64);
    expect(screen.getByRole('button', { name: /now 64/ })).toHaveFocus();
  });

  it('commits a typed value to the knob it was typed for, even once re-pointed', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: /Type a value for Depth/ }));
    const field = screen.getByRole('textbox');
    fireEvent.change(field, { target: { value: '64' } });
    // touching another knob re-points the rail before the field's blur lands
    fireEvent.click(screen.getByRole('button', { name: 'point at rate' }));
    fireEvent.blur(field);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith(0, 64);
  });

  it('steps and picks by note value on a synced knob', () => {
    const onChange = vi.fn();
    render(<Harness initialFocus={RATE} syncedIdx={1} onChange={onChange} />);

    // 0.5 Hz on a 0.1..10 knob sits nearest the 1/1 mark
    expect(screen.getByRole('button', { name: /Pick a note value for Rate, now 1\/1/ }))
      .toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Decrease Rate' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Increase Rate' }));
    expect(screen.getByRole('button', { name: /now 1\/2$/ })).toBeInTheDocument();
  });
});
