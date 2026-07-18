import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import gsap from 'gsap';
import { motionDurations, motionEase, prefersReducedMotion } from '@/lib/motion';

/** How close to a scroll container edge before the list follows the pointer. */
const EDGE_PX = 72;
const EDGE_SCROLL_PX = 10;

const LIFT_SCALE = 1.03;
const LIFT_SHADOW = '0 14px 30px rgba(0, 0, 0, 0.26)';
const REST_SHADOW = '0 0px 0px rgba(0, 0, 0, 0)';

/** Rows in a wrapped layout are ranked by band first, then position within it. */
const ROW_STRIDE_PAD = 1e4;
/** Centres within this many px of each other count as the same visual row. */
const BAND_TOLERANCE_PX = 24;

interface Point {
  x: number;
  y: number;
}

interface DragReorderOptions {
  /** the scrolling element that holds the items */
  scrollRef: RefObject<HTMLElement | null>;
  /** the element to query `itemSelector` within */
  listRef: RefObject<HTMLElement | null>;
  itemCount: number;
  onCommit: (from: number, to: number) => void;
  /**
   * `'y'` — single-column list (the mobile chain).
   * `'xy'` — items flow horizontally and wrap to further rows (the board).
   */
  axis?: 'y' | 'xy';
  /** must return items in chain order */
  itemSelector?: string;
  /**
   * `'settle'` — tween the item into its measured resting slot, then commit.
   * `'handoff'` — commit at the released position and let an external FLIP land
   *   it. Required when the commit itself reflows layout, because a resting
   *   slot measured before the commit no longer exists after it.
   */
  dropMode?: 'settle' | 'handoff';
  /**
   * Runs synchronously during the drop, after the lift is neutralised and all
   * tweens are killed, but before transforms are cleared and before
   * `onCommit`. This is where a FLIP consumer captures state.
   */
  onBeforeCommit?: () => void;
}

export interface DragReorderState {
  /** index of the item being dragged, or null */
  from: number | null;
  /** the position it would land in right now, or null */
  target: number | null;
  /** wire to the grip's onPointerDown */
  start: (index: number, e: React.PointerEvent) => void;
}

/**
 * Where item `index` currently *reads* as being, mid-drag. The list keeps its
 * committed order while GSAP moves items around, so the numbering has to be
 * derived or every item would show a stale position under the animation.
 */
export function displayPosition(index: number, from: number | null, target: number | null): number {
  if (from === null || target === null || from === target) return index;
  if (index === from) return target;
  if (from < target && index > from && index <= target) return index - 1;
  if (from > target && index >= target && index < from) return index + 1;
  return index;
}

/**
 * GSAP drag-to-reorder: the picked-up item lifts and tracks the pointer while
 * the rest of the stack slides open to make room.
 *
 * The DOM order is deliberately NOT touched during the drag — every item is
 * moved by a GSAP transform and the real reorder is committed once, on drop.
 * That keeps layout frozen for the whole gesture, which is what makes the
 * geometry exact, and avoids re-rendering on every pointermove.
 *
 * Geometry: item centres are measured once at pickup, and an item's travel is
 * the exact measured delta between adjacent centres rather than an assumed
 * item size. That is what lets variable-height rows (mobile) and variable-width
 * bays (the board, 172px vs 310px) both land correctly with no special case —
 * including the diagonal hop when an item wraps from the end of one row to the
 * start of the next.
 *
 * Target selection collapses the layout to a single rank scalar (band ×
 * stride + position along the band), so the same monotonic "furthest crossed
 * centre" scan works in one or two dimensions. The scan takes the furthest
 * crossed centre rather than the nearest, which is what keeps it from
 * oscillating when the pointer sits near a boundary.
 *
 * The grip should be the only element with `touch-action: none`, so the drag
 * can claim the gesture immediately while a press elsewhere still scrolls.
 * `prefers-reduced-motion` collapses every tween to a near-instant set, since
 * GSAP bypasses the CSS reduced-motion block (mirrors useFlipReorder).
 */
export function useDragReorder({
  scrollRef,
  listRef,
  itemCount,
  onCommit,
  axis = 'y',
  itemSelector = '[data-drag-row]',
  dropMode = 'settle',
  onBeforeCommit,
}: DragReorderOptions): DragReorderState {
  const [from, setFrom] = useState<number | null>(null);
  const [target, setTarget] = useState<number | null>(null);

  const itemsRef = useRef<HTMLElement[]>([]);
  const centersRef = useRef<Point[]>([]);
  /** per-item rank scalar; the target scan runs over this, never over x/y */
  const ranksRef = useRef<number[]>([]);
  /** distinct row-band centre lines, ascending */
  const bandsRef = useRef<number[]>([]);
  const rowStrideRef = useRef(ROW_STRIDE_PAD);
  const startRef = useRef<Point>({ x: 0, y: 0 });
  const startScrollRef = useRef<Point>({ x: 0, y: 0 });
  const fromRef = useRef(0);
  const targetRef = useRef(0);
  const activeRef = useRef(false);
  /** set once a drop tween finishes, so the layout effect knows to clean up */
  const clearPendingRef = useRef(false);

  // Options are read inside window listeners registered once; a ref keeps those
  // listeners from being torn down and rebuilt on every render.
  const optsRef = useRef({ onCommit, onBeforeCommit, dropMode, axis, itemCount });
  optsRef.current = { onCommit, onBeforeCommit, dropMode, axis, itemCount };

  const dur = useCallback((seconds: number) => (prefersReducedMotion() ? 0.01 : seconds), []);

  /** Which measured row band a y-coordinate falls in. */
  const bandOf = useCallback((y: number) => {
    const bands = bandsRef.current;
    let best = 0;
    let bestDist = Infinity;
    bands.forEach((line, i) => {
      const dist = Math.abs(y - line);
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    });
    return best;
  }, []);

  const rankOf = useCallback(
    (point: Point) => {
      if (optsRef.current.axis === 'y') return point.y;
      return bandOf(point.y) * rowStrideRef.current + point.x;
    },
    [bandOf],
  );

  /** Slide every non-dragged item into (or out of) the gap the drag opened. */
  const applyShifts = useCallback(
    (nextTarget: number) => {
      const centers = centersRef.current;
      const origin = fromRef.current;
      const twoD = optsRef.current.axis === 'xy';
      itemsRef.current.forEach((el, i) => {
        if (i === origin) return;
        // The slot an item vacates into is its neighbour's slot, so its travel
        // is the measured delta between the two centres — exact for variable
        // sizes and for a wrap onto another row.
        let donor = -1;
        if (origin < nextTarget && i > origin && i <= nextTarget) donor = i - 1;
        else if (origin > nextTarget && i >= nextTarget && i < origin) donor = i + 1;
        const x = donor < 0 || !twoD ? 0 : centers[donor].x - centers[i].x;
        const y = donor < 0 ? 0 : centers[donor].y - centers[i].y;
        gsap.to(el, { x, y, duration: dur(motionDurations.base), ease: motionEase.out });
      });
    },
    [dur],
  );

  /** Undo every transform and drop the drag state without committing. */
  const cancel = useCallback(() => {
    if (!activeRef.current) return;
    activeRef.current = false;
    gsap.killTweensOf(itemsRef.current);
    gsap.to(itemsRef.current, {
      x: 0,
      y: 0,
      scale: 1,
      boxShadow: REST_SHADOW,
      duration: dur(motionDurations.base),
      ease: motionEase.out,
      onComplete: () => {
        gsap.set(itemsRef.current, { clearProps: 'all' });
      },
    });
    setFrom(null);
    setTarget(null);
  }, [dur]);

  const start = useCallback(
    (index: number, e: React.PointerEvent) => {
      // Never let a right-click or middle-click begin a drag.
      if (e.button !== 0) return;

      e.preventDefault();
      e.currentTarget.setPointerCapture?.(e.pointerId);
      // preventDefault suppressed the native focus, but the grip doubles as the
      // keyboard reorder control — without this it becomes unreachable after a
      // pointer drag.
      (e.currentTarget as HTMLElement).focus?.();

      const els = Array.from(
        listRef.current?.querySelectorAll<HTMLElement>(itemSelector) ?? [],
      );
      if (els.length === 0) return;

      itemsRef.current = els;
      centersRef.current = els.map((el) => {
        const rect = el.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      });

      // Cluster centres into row bands so the rank scalar orders items in
      // reading order. With axis 'y' there is exactly one band, which makes
      // rank === centre.y and the scan identical to the single-column case.
      const bands: number[] = [];
      if (axis === 'xy') {
        centersRef.current.forEach((c) => {
          if (!bands.some((line) => Math.abs(line - c.y) <= BAND_TOLERANCE_PX)) bands.push(c.y);
        });
        bands.sort((a, b) => a - b);
      } else {
        bands.push(0);
      }
      bandsRef.current = bands;
      const scroller = scrollRef.current;
      rowStrideRef.current = (scroller?.scrollWidth ?? 0) + ROW_STRIDE_PAD;
      ranksRef.current = centersRef.current.map((c) => rankOf(c));

      startRef.current = { x: e.clientX, y: e.clientY };
      startScrollRef.current = {
        x: scroller?.scrollLeft ?? 0,
        y: scroller?.scrollTop ?? 0,
      };
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
    [axis, dur, itemSelector, listRef, rankOf, scrollRef],
  );

  useEffect(() => {
    function onPointerMove(e: PointerEvent) {
      if (!activeRef.current) return;
      e.preventDefault();

      const twoD = optsRef.current.axis === 'xy';
      const scroller = scrollRef.current;
      // Only auto-scroll an axis the container actually overflows on, so the
      // vertical mobile list and the horizontal board each get the right one.
      if (scroller) {
        const box = scroller.getBoundingClientRect();
        if (scroller.scrollWidth > scroller.clientWidth) {
          if (e.clientX < box.left + EDGE_PX) scroller.scrollLeft -= EDGE_SCROLL_PX;
          else if (e.clientX > box.right - EDGE_PX) scroller.scrollLeft += EDGE_SCROLL_PX;
        }
        if (scroller.scrollHeight > scroller.clientHeight) {
          if (e.clientY < box.top + EDGE_PX) scroller.scrollTop -= EDGE_SCROLL_PX;
          else if (e.clientY > box.bottom - EDGE_PX) scroller.scrollTop += EDGE_SCROLL_PX;
        }
      }

      // Work in content space: adding the scroll delta keeps the measured
      // centres valid even while the list auto-scrolls under the pointer.
      const scrollDx = (scroller?.scrollLeft ?? 0) - startScrollRef.current.x;
      const scrollDy = (scroller?.scrollTop ?? 0) - startScrollRef.current.y;
      const dx = twoD ? e.clientX - startRef.current.x + scrollDx : 0;
      const dy = e.clientY - startRef.current.y + scrollDy;

      const origin = fromRef.current;
      gsap.set(itemsRef.current[origin], twoD ? { x: dx, y: dy } : { y: dy });

      const centers = centersRef.current;
      const ranks = ranksRef.current;
      const draggedRank = rankOf({ x: centers[origin].x + dx, y: centers[origin].y + dy });

      // Furthest item whose centre the drag has passed, in each direction.
      let next = origin;
      for (let i = origin - 1; i >= 0; i--) {
        if (draggedRank < ranks[i]) next = i;
      }
      for (let i = origin + 1; i < optsRef.current.itemCount; i++) {
        if (draggedRank > ranks[i]) next = i;
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
      const landed = targetRef.current;
      const el = itemsRef.current[origin];
      const opts = optsRef.current;

      if (opts.dropMode === 'handoff') {
        // One synchronous block — no await, no rAF, no render may interleave,
        // or an external FLIP would capture a state nothing else can see.
        // 1. kill in-flight shift tweens: they would keep writing x/y after
        //    clearProps and strand items at half-shifted transforms.
        gsap.killTweensOf(itemsRef.current);
        // 2. drop the lift scale first: a rect captured at scale 1.03 is a
        //    bigger box, and Flip's `absolute` reconciles that as width/height.
        gsap.set(el, { scale: 1 });
        // 3. let the consumer record the current, still-transformed positions.
        opts.onBeforeCommit?.();
        // 4. release the elements before anyone else animates them.
        gsap.set(itemsRef.current, {
          clearProps: 'transform,boxShadow,zIndex,position',
        });
        if (landed !== origin) opts.onCommit(origin, landed);
        setFrom(null);
        setTarget(null);
        return;
      }

      // Settle mode: the layout does not reflow on commit, so the resting slot
      // measured at pickup is still valid and we can tween straight into it.
      const restX =
        opts.axis === 'xy' ? centersRef.current[landed].x - centersRef.current[origin].x : 0;
      const restY = centersRef.current[landed].y - centersRef.current[origin].y;

      gsap.to(el, {
        x: restX,
        y: restY,
        scale: 1,
        boxShadow: REST_SHADOW,
        duration: dur(motionDurations.base),
        ease: motionEase.out,
        onComplete: () => {
          clearPendingRef.current = true;
          if (landed !== origin) opts.onCommit(origin, landed);
          setFrom(null);
          setTarget(null);
        },
      });
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') cancel();
    }

    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    window.addEventListener('keydown', onKeyDown);
    // Losing the window mid-drag must abandon the gesture, not leave it armed.
    window.addEventListener('blur', cancel);
    document.addEventListener('visibilitychange', cancel);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('blur', cancel);
      document.removeEventListener('visibilitychange', cancel);
    };
  }, [applyShifts, cancel, dur, rankOf, scrollRef]);

  // Settle mode only: strip transforms after React has re-rendered the
  // committed order. A layout effect runs before paint, so the swap from
  // "transformed old order" to "untransformed new order" is never visible.
  // Handoff mode clears inline in the drop block and never sets clearPending.
  useLayoutEffect(() => {
    if (from !== null || !clearPendingRef.current) return;
    clearPendingRef.current = false;
    gsap.set(itemsRef.current, { clearProps: 'all' });
  }, [from]);

  useEffect(() => {
    return () => {
      gsap.killTweensOf(itemsRef.current);
    };
  }, []);

  return { from, target, start };
}
