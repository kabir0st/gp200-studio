import { useCallback, useLayoutEffect, useRef } from 'react';
import gsap from 'gsap';
import { Flip } from 'gsap/Flip';
import { motionDurations, motionEase, prefersReducedMotion } from '@/lib/motion';

gsap.registerPlugin(Flip);

/**
 * FLIP animation for chain reorder: pedals spring to their new positions instead
 * of snapping. Call `capture()` synchronously *before* the reorder mutation (while
 * the DOM still holds the old order); when `orderKey` then changes, a layout effect
 * replays the position delta. Effect swaps also bump `orderKey` but never call
 * `capture()`, so they animate nothing (their bays don't move — see isWideSlot).
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

  const capture = useCallback(() => {
    const scope = scopeRef.current;
    if (!scope || prefersReducedMotion()) return;
    stateRef.current = Flip.getState(scope.querySelectorAll(selector));
  }, [selector]);

  useLayoutEffect(() => {
    const state = stateRef.current;
    stateRef.current = null;
    if (!state) return;
    Flip.from(state, {
      duration: motionDurations.base,
      ease: motionEase.out,
      absolute: true,
      // a small settle so the pedal visibly "reacts" as it lands
      onEnter: (targets) =>
        gsap.fromTo(
          targets,
          { scale: 0.94, opacity: 0.6 },
          { scale: 1, opacity: 1, duration: motionDurations.base, ease: motionEase.out },
        ),
    });
  }, [orderKey]);

  return { scopeRef, capture };
}
