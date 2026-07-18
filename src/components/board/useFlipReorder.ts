import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import gsap from 'gsap';
import { Flip } from 'gsap/Flip';
import { motionDurations, motionEase, prefersReducedMotion } from '@/lib/motion';

gsap.registerPlugin(Flip);

/**
 * FLIP animation for chain reorder: pedals spring to their new positions instead
 * of snapping. Call `capture()` synchronously *before* the reorder mutation (while
 * the DOM still holds the old order); when `orderKey` then changes, a layout effect
 * replays the position delta. Effect swaps also bump `orderKey` but never call
 * `capture()`, so they animate nothing (their bays don't move, see isWideSlot).
 *
 * `prefers-reduced-motion` short-circuits `capture()` → no animation, instant reflow.
 * GSAP-driven props aren't covered by the CSS reduced-motion block, so this is the
 * gate (mirrors src/hooks/useGsapTimeline.ts).
 */
export function useFlipReorder<T extends HTMLElement = HTMLDivElement>(
  orderKey: string,
  selector = '.pedal',
) {
  const scopeRef = useRef<T | null>(null);
  const stateRef = useRef<Flip.FlipState | null>(null);
  const tweenRef = useRef<gsap.core.Timeline | null>(null);

  /**
   * `absolute: true` takes the pedals out of flow for the duration of the tween.
   * If a tween is interrupted (a second reorder lands mid-flight) the elements can
   * keep that absolute positioning forever — the board collapses and the pedals
   * pile up at stale coordinates. So every path out of an animation ends here.
   */
  const release = useCallback(() => {
    const scope = scopeRef.current;
    if (!scope) return;
    gsap.set(scope.querySelectorAll(selector), {
      clearProps: 'position,left,top,width,height,transform',
    });
    scope.querySelectorAll<HTMLElement>('.board-row').forEach((row) => {
      row.style.removeProperty('height');
    });
  }, [selector]);

  /**
   * Hold each row open at its current height for the duration of the tween.
   *
   * `absolute: true` takes every pedal out of flow, and a bay reserves no height
   * of its own (that reservation was removed because it left ~140px of dead air
   * above short pedals). So the moment the pedals go absolute, the bays collapse
   * to zero and the whole board implodes — measured live at 672px → 72px, with
   * pedals piled up at stale coordinates. Pinning the height is what the old
   * per-bay min-height was accidentally doing, minus the dead air at rest.
   */
  const lockRowHeights = useCallback(() => {
    const scope = scopeRef.current;
    if (!scope) return;
    scope.querySelectorAll<HTMLElement>('.board-row').forEach((row) => {
      row.style.height = `${row.getBoundingClientRect().height}px`;
    });
  }, []);

  const capture = useCallback(() => {
    const scope = scopeRef.current;
    if (!scope || prefersReducedMotion()) return;
    // Never let two Flips overlap: the in-flight one still holds its targets
    // absolute, so its state is already stale for the order we're about to commit.
    if (tweenRef.current) {
      tweenRef.current.kill();
      tweenRef.current = null;
      release();
    }
    stateRef.current = Flip.getState(scope.querySelectorAll(selector));
  }, [release, selector]);

  useLayoutEffect(() => {
    const state = stateRef.current;
    stateRef.current = null;
    if (!state) return;
    // Measure before Flip.from: React has committed the new order and the pedals
    // are still in flow, so this captures the true resting height of each row.
    lockRowHeights();
    tweenRef.current = Flip.from(state, {
      duration: motionDurations.base,
      ease: motionEase.out,
      absolute: true,
      onComplete: () => {
        tweenRef.current = null;
        release();
      },
      onInterrupt: release,
      // a small settle so the pedal visibly "reacts" as it lands
      onEnter: (targets) =>
        gsap.fromTo(
          targets,
          { scale: 0.94, opacity: 0.6 },
          { scale: 1, opacity: 1, duration: motionDurations.base, ease: motionEase.out },
        ),
    });
  }, [lockRowHeights, orderKey, release]);

  // A reorder that unmounts mid-tween must not leave the board absolutely positioned.
  useEffect(() => {
    return () => {
      tweenRef.current?.kill();
      tweenRef.current = null;
    };
  }, []);

  return { scopeRef, capture };
}
