import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { PedalKnob } from '@/components/board/PedalKnob';
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

const TIME: KnobParam = {
  type: 'knob',
  name: 'Time',
  idx: 1,
  min: 20,
  max: 4000,
  step: 1,
  default: 500,
};

/** Controlled, as Pedal drives it through the preset. */
function Harness({
  param = DRIVE,
  initial,
  synced = false,
  onChange,
}: {
  param?: KnobParam;
  initial: number;
  synced?: boolean;
  onChange?: (v: number) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <PedalKnob
      param={param}
      value={value}
      onChange={(v) => {
        setValue(v);
        onChange?.(v);
      }}
      knobStyle="dark"
      ink="#000"
      pedalName="OD·9"
      synced={synced}
    />
  );
}

const knob = () => screen.getByRole('slider');
const unit = () => knob().parentElement!;

function clickReadout(readout: HTMLElement) {
  fireEvent.pointerDown(readout, { pointerId: 1, clientY: 100 });
  fireEvent.pointerUp(readout, { pointerId: 1, clientY: 100 });
}

describe('PedalKnob fine steps', () => {
  it('steps one value per arrow press, so 71 reaches 70', () => {
    const onChange = vi.fn();
    render(<Harness initial={71} onChange={onChange} />);

    fireEvent.keyDown(knob(), { key: 'ArrowDown' });
    expect(onChange).toHaveBeenLastCalledWith(70);
  });

  it('steps a wide knob coarse, and one value with Shift', () => {
    const onChange = vi.fn();
    render(<Harness param={TIME} initial={500} onChange={onChange} />);

    fireEvent.keyDown(knob(), { key: 'ArrowUp' });
    expect(onChange).toHaveBeenLastCalledWith(520);

    fireEvent.keyDown(knob(), { key: 'ArrowUp', shiftKey: true });
    expect(onChange).toHaveBeenLastCalledWith(521);
  });

  it('moves one value per wheel notch', () => {
    const onChange = vi.fn();
    render(<Harness initial={71} onChange={onChange} />);

    fireEvent.wheel(unit(), { deltaY: 100 });
    expect(onChange).toHaveBeenLastCalledWith(70);
    fireEvent.wheel(unit(), { deltaY: -200 });
    expect(onChange).toHaveBeenLastCalledWith(72);
  });

  it('turns ten times slower on a Shift drag', () => {
    const onChange = vi.fn();
    render(<Harness initial={50} onChange={onChange} />);

    fireEvent.pointerDown(unit(), { pointerId: 1, clientY: 200 });
    // 16px of a 160px sweep: a tenth of the range, or a hundredth with Shift
    fireEvent.pointerMove(unit(), { pointerId: 1, clientY: 184, shiftKey: true });
    expect(onChange).toHaveBeenLastCalledWith(51);
    fireEvent.pointerMove(unit(), { pointerId: 1, clientY: 168 });
    expect(onChange).toHaveBeenLastCalledWith(61);
  });

  it('ignores a jitter below the dead zone, so a click never nudges', () => {
    const onChange = vi.fn();
    render(<Harness initial={50} onChange={onChange} />);

    fireEvent.pointerDown(unit(), { pointerId: 1, clientY: 200 });
    fireEvent.pointerMove(unit(), { pointerId: 1, clientY: 198 });
    fireEvent.pointerUp(unit(), { pointerId: 1, clientY: 198 });
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('PedalKnob value entry', () => {
  it('opens a field on a click of the readout and commits on Enter', () => {
    const onChange = vi.fn();
    render(<Harness initial={71} onChange={onChange} />);

    clickReadout(screen.getByText('71'));
    const field = screen.getByRole('textbox', { name: /OD·9 Drive value/ });
    expect(field).toHaveValue('71');
    expect(field).toHaveFocus();

    fireEvent.change(field, { target: { value: '70' } });
    fireEvent.keyDown(field, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith(70);
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByText('70')).toBeInTheDocument();
    // back on the knob, so the arrows carry on from the typed value
    expect(knob()).toHaveFocus();
  });

  it('opens from the keyboard with Enter', () => {
    render(<Harness initial={71} />);
    fireEvent.keyDown(knob(), { key: 'Enter' });
    expect(screen.getByRole('textbox')).toHaveFocus();
  });

  it('cancels on Escape without sending anything', () => {
    const onChange = vi.fn();
    render(<Harness initial={71} onChange={onChange} />);

    clickReadout(screen.getByText('71'));
    const field = screen.getByRole('textbox');
    fireEvent.change(field, { target: { value: '12' } });
    fireEvent.keyDown(field, { key: 'Escape' });

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText('71')).toBeInTheDocument();
  });

  it('commits on blur, clamped to the range', () => {
    const onChange = vi.fn();
    render(<Harness initial={71} onChange={onChange} />);

    clickReadout(screen.getByText('71'));
    const field = screen.getByRole('textbox');
    fireEvent.change(field, { target: { value: '250' } });
    fireEvent.blur(field);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith(100);
  });

  it('does not open from a drag that started on the readout', () => {
    render(<Harness initial={50} />);

    const readout = screen.getByText('50');
    fireEvent.pointerDown(readout, { pointerId: 1, clientY: 200 });
    fireEvent.pointerMove(readout, { pointerId: 1, clientY: 184 });
    fireEvent.pointerUp(readout, { pointerId: 1, clientY: 184 });

    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByText('60')).toBeInTheDocument();
  });

  it('still resets on a double-click of the cap', () => {
    const onChange = vi.fn();
    render(<Harness initial={71} onChange={onChange} />);
    fireEvent.doubleClick(knob());
    expect(onChange).toHaveBeenLastCalledWith(40);
  });
});

describe('PedalKnob in sync mode', () => {
  it('reads as a note value instead of ms', () => {
    render(<Harness param={TIME} initial={500} synced />);
    expect(screen.getByText('1/2')).toBeInTheDocument();
    expect(knob()).toHaveAttribute('aria-valuetext', '1/2');
  });

  it('steps one note per arrow press', () => {
    const onChange = vi.fn();
    render(<Harness param={TIME} initial={500} synced onChange={onChange} />);
    fireEvent.keyDown(knob(), { key: 'ArrowUp' });
    expect(screen.getByText('1/2D')).toBeInTheDocument();
    // the centre of the 1/2D bucket
    expect(onChange).toHaveBeenLastCalledWith(816);
  });

  it('picks a note from a list instead of taking typed ms', () => {
    const onChange = vi.fn();
    render(<Harness param={TIME} initial={500} synced onChange={onChange} />);

    clickReadout(screen.getByText('1/2'));
    const list = screen.getByRole('combobox', { name: /OD·9 Time note value/ });
    expect(list).toHaveDisplayValue('1/2');

    fireEvent.change(list, { target: { value: '8' } });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(screen.getByText('1/8D')).toBeInTheDocument();
    expect(knob()).toHaveFocus();
  });
});
