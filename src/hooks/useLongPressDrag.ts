import { useCallback, useEffect, useRef, useState } from 'react';

const LONG_PRESS_MS = 220;
/** Movement past this before the timer fires means the user is scrolling. */
const CANCEL_SLOP_PX = 8;

interface LongPressDragOptions {
  /** uniform row height in px, used to convert drag distance into index delta */
  rowHeight: number;
  itemCount: number;
  onCommit: (from: number, to: number) => void;
}

export interface LongPressDragState {
  /** index currently lifted, or null */
  lifted: number | null;
  /** live target index while dragging */
  target: number | null;
  start: (index: number, e: React.PointerEvent) => void;
}

/**
 * Long-press-then-drag reordering for a vertical list.
 *
 * A plain pointerdown-drag would fight page scroll, so the lift only arms after
 * LONG_PRESS_MS of near-stationary contact; any movement before that cancels
 * and lets the scroll through. Only the element the caller wires this to should
 * carry `touch-action: none` — never the whole row.
 */
export function useLongPressDrag({
  rowHeight,
  itemCount,
  onCommit,
}: LongPressDragOptions): LongPressDragState {
  const [lifted, setLifted] = useState<number | null>(null);
  const [target, setTarget] = useState<number | null>(null);

  const timerRef = useRef<number | null>(null);
  const originYRef = useRef(0);
  const fromRef = useRef(0);
  const targetRef = useRef(0);
  const armedRef = useRef(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const finish = useCallback(() => {
    clearTimer();
    if (armedRef.current && targetRef.current !== fromRef.current) {
      onCommit(fromRef.current, targetRef.current);
    }
    armedRef.current = false;
    setLifted(null);
    setTarget(null);
  }, [clearTimer, onCommit]);

  const start = useCallback(
    (index: number, e: React.PointerEvent) => {
      originYRef.current = e.clientY;
      fromRef.current = index;
      targetRef.current = index;
      armedRef.current = false;
      clearTimer();
      timerRef.current = window.setTimeout(() => {
        armedRef.current = true;
        setLifted(index);
        setTarget(index);
      }, LONG_PRESS_MS);
    },
    [clearTimer],
  );

  // Window-level listeners so a fast drag that outruns the handle still tracks.
  useEffect(() => {
    function onPointerMove(e: PointerEvent) {
      const dy = e.clientY - originYRef.current;
      if (!armedRef.current) {
        // still waiting on the long press — treat movement as a scroll intent
        if (Math.abs(dy) > CANCEL_SLOP_PX) clearTimer();
        return;
      }
      e.preventDefault();
      const delta = Math.round(dy / rowHeight);
      const next = Math.max(0, Math.min(itemCount - 1, fromRef.current + delta));
      if (next !== targetRef.current) {
        targetRef.current = next;
        setTarget(next);
      }
    }

    function onPointerUp() {
      finish();
    }

    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };
  }, [clearTimer, finish, itemCount, rowHeight]);

  useEffect(() => clearTimer, [clearTimer]);

  return { lifted, target, start };
}
