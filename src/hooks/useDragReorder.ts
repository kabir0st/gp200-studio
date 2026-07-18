import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

/** How close to a scroll container edge before the list starts following. */
const EDGE_PX = 72;
const EDGE_SCROLL_PX = 12;

interface DragReorderOptions {
  /** the scrolling element that holds the rows */
  scrollRef: RefObject<HTMLElement | null>;
  /** rows must carry `data-drag-row` for hit-testing */
  listRef: RefObject<HTMLElement | null>;
  itemCount: number;
  onCommit: (from: number, to: number) => void;
}

export interface DragReorderState {
  /** original index of the row being dragged, or null */
  from: number | null;
  /** where it currently sits in the previewed order, or null */
  target: number | null;
  /** wire to the grip's onPointerDown */
  start: (index: number, e: React.PointerEvent) => void;
}

/**
 * Drag-to-reorder for a vertical list, driven by a dedicated grip.
 *
 * The grip is what makes this safe without a long-press delay: it is the only
 * element carrying `touch-action: none`, so pressing it can claim the gesture
 * immediately while a press anywhere else on the row still scrolls the page.
 *
 * Target tracking compares the pointer against the *live* midpoints of the
 * neighbouring rows and moves at most one position at a time. Rows are not a
 * uniform pitch — FX-loop markers sit between them and summaries wrap — so
 * anything based on a fixed row height drifts. Re-measuring each move also
 * keeps the math correct while the list auto-scrolls under the finger.
 */
export function useDragReorder({
  scrollRef,
  listRef,
  itemCount,
  onCommit,
}: DragReorderOptions): DragReorderState {
  const [from, setFrom] = useState<number | null>(null);
  const [target, setTarget] = useState<number | null>(null);

  const fromRef = useRef(0);
  const targetRef = useRef(0);
  const activeRef = useRef(false);

  const start = useCallback((index: number, e: React.PointerEvent) => {
    // Claim the gesture so the row's own scroll never competes for it.
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    activeRef.current = true;
    fromRef.current = index;
    targetRef.current = index;
    setFrom(index);
    setTarget(index);
  }, []);

  useEffect(() => {
    function rowRects(): DOMRect[] {
      const list = listRef.current;
      if (!list) return [];
      return Array.from(list.querySelectorAll<HTMLElement>('[data-drag-row]')).map((el) =>
        el.getBoundingClientRect(),
      );
    }

    function onPointerMove(e: PointerEvent) {
      if (!activeRef.current) return;
      e.preventDefault();

      // Follow the finger when it nears either edge of the scroller.
      const scroller = scrollRef.current;
      if (scroller) {
        const box = scroller.getBoundingClientRect();
        if (e.clientY < box.top + EDGE_PX) scroller.scrollTop -= EDGE_SCROLL_PX;
        else if (e.clientY > box.bottom - EDGE_PX) scroller.scrollTop += EDGE_SCROLL_PX;
      }

      const rects = rowRects();
      const current = targetRef.current;
      let next = current;

      const above = rects[current - 1];
      const below = rects[current + 1];
      if (above && e.clientY < above.top + above.height / 2) next = current - 1;
      else if (below && e.clientY > below.top + below.height / 2) next = current + 1;

      next = Math.max(0, Math.min(itemCount - 1, next));
      if (next !== current) {
        targetRef.current = next;
        setTarget(next);
      }
    }

    function onPointerUp() {
      if (!activeRef.current) return;
      activeRef.current = false;
      if (targetRef.current !== fromRef.current) {
        onCommit(fromRef.current, targetRef.current);
      }
      setFrom(null);
      setTarget(null);
    }

    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };
  }, [itemCount, listRef, onCommit, scrollRef]);

  return { from, target, start };
}
