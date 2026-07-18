import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import gsap from 'gsap';
import { motionDurations, motionEase, prefersReducedMotion } from '@/lib/motion';

/** How close to a scroll container edge before the list follows the finger. */
const EDGE_PX = 72;
const EDGE_SCROLL_PX = 10;

const LIFT_SCALE = 1.03;
const LIFT_SHADOW = '0 14px 30px rgba(0, 0, 0, 0.26)';
const REST_SHADOW = '0 0px 0px rgba(0, 0, 0, 0)';

interface DragReorderOptions {
  /** the scrolling element that holds the rows */
  scrollRef: RefObject<HTMLElement | null>;
  /** rows must carry `data-drag-row` for measurement */
  listRef: RefObject<HTMLElement | null>;
  itemCount: number;
  onCommit: (from: number, to: number) => void;
}

export interface DragReorderState {
  /** index of the row being dragged, or null */
  from: number | null;
  /** the position it would land in right now, or null */
  target: number | null;
  /** wire to the grip's onPointerDown */
  start: (index: number, e: React.PointerEvent) => void;
}

/**
 * Where row `index` currently *reads* as being, mid-drag. The list keeps its
 * committed order while GSAP moves rows around, so the numbering has to be
 * derived or every row would show a stale position under the animation.
 */
export function displayPosition(index: number, from: number | null, target: number | null): number {
  if (from === null || target === null || from === target) return index;
  if (index === from) return target;
  if (from < target && index > from && index <= target) return index - 1;
  if (from > target && index >= target && index < from) return index + 1;
  return index;
}

/**
 * GSAP drag-to-reorder for the chain list: the picked-up row lifts and tracks
 * the finger while the rest of the stack slides open to make room.
 *
 * The DOM order is deliberately NOT touched during the drag — every row is
 * moved by a GSAP transform and the real reorder is committed once, on drop.
 * That keeps layout frozen for the whole gesture, which is what makes the
 * geometry exact (see below) and avoids React re-rendering the list on every
 * pointermove.
 *
 * Geometry: row centres are measured once at pickup. Reordering blocks never
 * changes where the *slots* are — an FX-loop marker sits at a chain position,
 * not on a block, so it stays put while blocks move past it. That invariance
 * is what lets a row's travel be the exact delta between adjacent measured
 * centres rather than an assumed uniform row height, so variable-height rows
 * (wrapped summaries) and marker gaps both land correctly.
 *
 * The grip is the only element with `touch-action: none`, so the drag can
 * claim the gesture immediately while a press elsewhere still scrolls.
 * `prefers-reduced-motion` collapses every tween to a near-instant set, since
 * GSAP bypasses the CSS reduced-motion block (mirrors useFlipReorder).
 */
export function useDragReorder({
  scrollRef,
  listRef,
  itemCount,
  onCommit,
}: DragReorderOptions): DragReorderState {
  const [from, setFrom] = useState<number | null>(null);
  const [target, setTarget] = useState<number | null>(null);

  const rowsRef = useRef<HTMLElement[]>([]);
  const centersRef = useRef<number[]>([]);
  const startYRef = useRef(0);
  const startScrollRef = useRef(0);
  const fromRef = useRef(0);
  const targetRef = useRef(0);
  const activeRef = useRef(false);
  /** set once a drop tween finishes, so the layout effect knows to clean up */
  const clearPendingRef = useRef(false);

  const dur = useCallback(
    (seconds: number) => (prefersReducedMotion() ? 0.01 : seconds),
    [],
  );

  /** Slide every non-dragged row into (or out of) the gap the drag opened. */
  const applyShifts = useCallback(
    (target: number) => {
      const centers = centersRef.current;
      const origin = fromRef.current;
      rowsRef.current.forEach((el, i) => {
        if (i === origin) return;
        let y = 0;
        if (origin < target && i > origin && i <= target) y = centers[i - 1] - centers[i];
        else if (origin > target && i >= target && i < origin) y = centers[i + 1] - centers[i];
        gsap.to(el, { y, duration: dur(motionDurations.base), ease: motionEase.out });
      });
    },
    [dur],
  );

  const start = useCallback(
    (index: number, e: React.PointerEvent) => {
      // Claim the gesture so the list's own scrolling never competes for it.
      e.preventDefault();
      e.currentTarget.setPointerCapture?.(e.pointerId);

      const els = Array.from(
        listRef.current?.querySelectorAll<HTMLElement>('[data-drag-row]') ?? [],
      );
      if (els.length === 0) return;

      rowsRef.current = els;
      centersRef.current = els.map((el) => {
        const rect = el.getBoundingClientRect();
        return rect.top + rect.height / 2;
      });
      startYRef.current = e.clientY;
      startScrollRef.current = scrollRef.current?.scrollTop ?? 0;
      fromRef.current = index;
      targetRef.current = index;
      activeRef.current = true;
      setFrom(index);
      setTarget(index);

      const el = els[index];
      gsap.killTweensOf(el);
      // Raise it out of the stack first, so the lift reads as "off the board".
      gsap.set(el, { position: 'relative', zIndex: 20 });
      gsap.to(el, {
        scale: LIFT_SCALE,
        boxShadow: LIFT_SHADOW,
        duration: dur(motionDurations.fast),
        ease: motionEase.out,
      });
    },
    [dur, listRef, scrollRef],
  );

  useEffect(() => {
    function onPointerMove(e: PointerEvent) {
      if (!activeRef.current) return;
      e.preventDefault();

      const scroller = scrollRef.current;
      if (scroller) {
        const box = scroller.getBoundingClientRect();
        if (e.clientY < box.top + EDGE_PX) scroller.scrollTop -= EDGE_SCROLL_PX;
        else if (e.clientY > box.bottom - EDGE_PX) scroller.scrollTop += EDGE_SCROLL_PX;
      }

      // Work in content space: adding the scroll delta keeps the measured
      // centres valid even while the list auto-scrolls under the finger.
      const scrollDelta = (scroller?.scrollTop ?? 0) - startScrollRef.current;
      const dy = e.clientY - startYRef.current + scrollDelta;
      gsap.set(rowsRef.current[fromRef.current], { y: dy });

      const centers = centersRef.current;
      const origin = fromRef.current;
      const draggedCenter = centers[origin] + dy;

      // Furthest row whose centre the drag has passed, in each direction.
      let next = origin;
      for (let i = origin - 1; i >= 0; i--) {
        if (draggedCenter < centers[i]) next = i;
      }
      for (let i = origin + 1; i < itemCount; i++) {
        if (draggedCenter > centers[i]) next = i;
      }

      if (next !== targetRef.current) {
        targetRef.current = next;
        setTarget(next);
        applyShifts(next);
      }
    }

    function onPointerUp() {
      if (!activeRef.current) return;
      activeRef.current = false;

      const origin = fromRef.current;
      const target = targetRef.current;
      const el = rowsRef.current[origin];
      // Settle into the slot it will actually occupy, then hand over to React.
      const rest = centersRef.current[target] - centersRef.current[origin];

      gsap.to(el, {
        y: rest,
        scale: 1,
        boxShadow: REST_SHADOW,
        duration: dur(motionDurations.base),
        ease: motionEase.out,
        onComplete: () => {
          clearPendingRef.current = true;
          if (target !== origin) onCommit(origin, target);
          setFrom(null);
          setTarget(null);
        },
      });
    }

    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };
  }, [applyShifts, dur, itemCount, onCommit, scrollRef]);

  // Strip the transforms only after React has re-rendered the committed order.
  // A layout effect runs before paint, so the swap from "transformed old order"
  // to "untransformed new order" is never visible.
  useLayoutEffect(() => {
    if (from !== null || !clearPendingRef.current) return;
    clearPendingRef.current = false;
    gsap.set(rowsRef.current, { clearProps: 'all' });
  }, [from]);

  useEffect(() => {
    return () => {
      gsap.killTweensOf(rowsRef.current);
    };
  }, []);

  return { from, target, start };
}
