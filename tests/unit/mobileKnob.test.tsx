import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MobileKnob } from '@/components/mobile/MobileKnob';
import type { KnobParam } from '@/core/effectParams';

const DRIVE: KnobParam = {
  type: 'knob',
  name: 'Drive',
  idx: 0,
  min: 0,
  max: 100,
  step: 1,
  default: 40,
};

/**
 * The knob is controlled, so a drag only advances if something feeds the new
 * value back — exactly as PedalEditorScreen does through the preset.
 */
function Harness({
  initial = 0,
  disabled = false,
  onChange,
  onFocus = vi.fn(),
}: {
  initial?: number;
  disabled?: boolean;
  onChange?: (v: number) => void;
  onFocus?: (idx: number) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <MobileKnob
      param={DRIVE}
      value={value}
      onChange={(v) => {
        setValue(v);
        onChange?.(v);
      }}
      knobStyle="dark"
      ink="#000"
      pedalName="OD·9"
      onFocus={onFocus}
      disabled={disabled}
    />
  );
}

const knob = () => screen.getByRole('slider');

/** Grab the drag surface: the unit around the svg carries the handlers. */
const unit = () => knob().parentElement!;

describe('MobileKnob', () => {
  it('exposes the value to assistive tech as a slider', () => {
    render(<Harness initial={62} />);
    expect(knob().getAttribute('aria-valuenow')).toBe('62');
    expect(knob().getAttribute('aria-valuemin')).toBe('0');
    expect(knob().getAttribute('aria-valuemax')).toBe('100');
    expect(knob().getAttribute('aria-label')).toBe('OD·9 Drive');
  });

  it('turns on horizontal drag, at a full sweep per 200px', () => {
    const onChange = vi.fn();
    render(<Harness initial={0} onChange={onChange} />);

    fireEvent.pointerDown(unit(), { pointerId: 1, clientX: 0 });
    fireEvent.pointerMove(unit(), { pointerId: 1, clientX: 100 });

    // half the 200px sweep over a 0..100 range
    expect(onChange).toHaveBeenLastCalledWith(50);
    expect(knob().getAttribute('aria-valuenow')).toBe('50');
  });

  it('ignores movement inside the dead zone, so a tap never nudges', () => {
    const onChange = vi.fn();
    render(<Harness initial={20} onChange={onChange} />);

    fireEvent.pointerDown(unit(), { pointerId: 1, clientX: 0 });
    fireEvent.pointerMove(unit(), { pointerId: 1, clientX: 3 });

    expect(onChange).not.toHaveBeenCalled();
  });

  it('stops turning when the browser claims the gesture as a scroll', () => {
    // touch-action: pan-y hands vertical panning back to the browser, which
    // takes the pointer with a pointercancel. Nothing may move after that.
    const onChange = vi.fn();
    render(<Harness initial={0} onChange={onChange} />);

    fireEvent.pointerDown(unit(), { pointerId: 1, clientX: 0 });
    fireEvent.pointerCancel(unit(), { pointerId: 1 });
    fireEvent.pointerMove(unit(), { pointerId: 1, clientX: 100 });

    expect(onChange).not.toHaveBeenCalled();
  });

  it('steps with the arrow keys', () => {
    const onChange = vi.fn();
    render(<Harness initial={50} onChange={onChange} />);

    // one notch is a fiftieth of the sweep, floored at the param's own step
    fireEvent.keyDown(knob(), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith(52);
    fireEvent.keyDown(knob(), { key: 'ArrowDown' });
    expect(onChange).toHaveBeenLastCalledWith(50);
  });

  it('resets to the default on a double tap', () => {
    const onChange = vi.fn();
    render(<Harness initial={90} onChange={onChange} />);

    fireEvent.pointerDown(unit(), { pointerId: 1, clientX: 10 });
    fireEvent.pointerUp(unit(), { pointerId: 1, clientX: 10 });
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.pointerDown(unit(), { pointerId: 1, clientX: 10 });
    fireEvent.pointerUp(unit(), { pointerId: 1, clientX: 10 });
    expect(onChange).toHaveBeenLastCalledWith(DRIVE.default);
  });

  it('points the focus rail at itself when touched', () => {
    const onFocus = vi.fn();
    render(<Harness onFocus={onFocus} />);
    fireEvent.pointerDown(unit(), { pointerId: 1, clientX: 0 });
    expect(onFocus).toHaveBeenCalledWith(DRIVE.idx);
  });

  it('is inert when disabled', () => {
    const onChange = vi.fn();
    render(<Harness initial={10} disabled onChange={onChange} />);

    fireEvent.pointerDown(unit(), { pointerId: 1, clientX: 0 });
    fireEvent.pointerMove(unit(), { pointerId: 1, clientX: 100 });
    fireEvent.keyDown(knob(), { key: 'ArrowRight' });

    expect(onChange).not.toHaveBeenCalled();
    expect(knob().getAttribute('aria-disabled')).toBe('true');
    expect(knob().getAttribute('tabindex')).toBe('-1');
  });
});
