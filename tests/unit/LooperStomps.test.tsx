import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { LooperStomps } from '@/components/board/LooperStomps';
import { LOOPER_ACTION_KINDS } from '@/core/looperBindings';
import type { LooperTriggerMap } from '@/core/looperTriggers';

const NOOP_PROPS = {
  armedAction: null,
  onArmLearn: () => {},
  onClearTrigger: () => {},
  onClearAll: () => {},
  learnNotice: null,
  learnEnabled: true,
};

const TWO_ASSIGNED: LooperTriggerMap = {
  recordToggle: { kind: 'toggle', block: 3 },
  playToggle: { kind: 'cc', cc: 42 },
};

/** Every action's button, found by the state its aria-label spells out. */
function stompButtons(container: HTMLElement): HTMLButtonElement[] {
  const found = container.querySelectorAll<HTMLButtonElement>('button[aria-label*=": "]');
  return Array.from(found).filter((button) => {
    return !button.getAttribute('aria-label')?.startsWith('Forget');
  });
}

describe('LooperStomps', () => {
  it('is one button per action, not one row', () => {
    const { container } = render(<LooperStomps triggers={{}} {...NOOP_PROPS} />);
    expect(stompButtons(container)).toHaveLength(LOOPER_ACTION_KINDS.length);
  });

  it('marks assigned actions and offers a clear only for those', () => {
    const { container, getAllByLabelText } = render(
      <LooperStomps triggers={TWO_ASSIGNED} {...NOOP_PROPS} />,
    );
    const assigned = stompButtons(container).filter((button) =>
      button.textContent?.startsWith('✓'),
    );
    expect(assigned).toHaveLength(2);
    expect(getAllByLabelText(/^Forget the switch assigned to/)).toHaveLength(2);
  });

  it('arms learning for the action that was clicked', () => {
    const onArmLearn = vi.fn();
    const { container } = render(
      <LooperStomps triggers={{}} {...NOOP_PROPS} onArmLearn={onArmLearn} />,
    );
    fireEvent.click(stompButtons(container)[2]);
    expect(onArmLearn).toHaveBeenCalledWith(LOOPER_ACTION_KINDS[2]);
  });

  it('clears one assignment without touching the others', () => {
    const onClearTrigger = vi.fn();
    const { getByLabelText } = render(
      <LooperStomps triggers={TWO_ASSIGNED} {...NOOP_PROPS} onClearTrigger={onClearTrigger} />,
    );
    fireEvent.click(getByLabelText('Forget the switch assigned to Play / Stop selected track'));
    expect(onClearTrigger).toHaveBeenCalledTimes(1);
    expect(onClearTrigger).toHaveBeenCalledWith('playToggle');
  });

  it('hides CLEAR ALL until something is actually assigned', () => {
    const empty = render(<LooperStomps triggers={{}} {...NOOP_PROPS} />);
    expect(empty.queryByText('CLEAR ALL')).toBeNull();
    const some = render(<LooperStomps triggers={TWO_ASSIGNED} {...NOOP_PROPS} />);
    expect(some.getByText('CLEAR ALL')).toBeTruthy();
  });

  it('announces the armed action instead of leaving the wait unexplained', () => {
    const { container } = render(
      <LooperStomps triggers={{}} {...NOOP_PROPS} armedAction="muteToggle" />,
    );
    const armed = stompButtons(container).filter((button) =>
      button.textContent?.includes('STOMP NOW'),
    );
    expect(armed).toHaveLength(1);
    expect(armed[0].getAttribute('aria-label')).toContain('waiting for a stomp');
  });

  it('disables assignment offline and says why', () => {
    const { container, getByText } = render(
      <LooperStomps triggers={{}} {...NOOP_PROPS} learnEnabled={false} />,
    );
    for (const button of stompButtons(container)) expect(button.disabled).toBe(true);
    expect(getByText(/Connect the GP-200 to assign footswitches/)).toBeTruthy();
  });

  it('names the assigned actions in the collapsed summary', () => {
    // The panel is shut by default, so the header alone has to answer "which
    // actions are covered" without anyone opening it.
    const { container, getByText } = render(
      <LooperStomps triggers={TWO_ASSIGNED} {...NOOP_PROPS} />,
    );
    expect(container.querySelector('details')?.open).toBe(false);
    expect(getByText('✓ REC / STOP · ✓ PLAY')).toBeTruthy();
  });

  it('says nothing is assigned rather than showing an empty summary', () => {
    const { getByText } = render(<LooperStomps triggers={{}} {...NOOP_PROPS} />);
    expect(getByText(/none assigned — hands-free transport/)).toBeTruthy();
  });

  it('keeps CLEAR ALL out of the summary, where it would just toggle the panel', () => {
    const { container, getByText } = render(
      <LooperStomps triggers={TWO_ASSIGNED} {...NOOP_PROPS} />,
    );
    const summary = container.querySelector('summary')!;
    expect(summary.contains(getByText('CLEAR ALL'))).toBe(false);
  });

  it('reports a duplicate stomp by the action that already owns it', () => {
    const { getByText } = render(
      <LooperStomps
        triggers={TWO_ASSIGNED}
        {...NOOP_PROPS}
        learnNotice={{ action: 'muteToggle', duplicateOf: 'recordToggle' }}
      />,
    );
    expect(getByText(/already assigned to Record \/ Stop/)).toBeTruthy();
  });
});
