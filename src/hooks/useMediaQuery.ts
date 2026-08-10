import { useCallback, useSyncExternalStore } from 'react';

/**
 * Subscribe to a CSS media query from React. Used where a layout change is
 * structural (different markup), not just different styling , CSS handles the
 * rest. Kept in sync with the board.css breakpoints (640px chrome, 720px board).
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => {};
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    [query],
  );
  const getSnapshot = useCallback(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  }, [query]);
  // server/jsdom-without-matchMedia fallback: assume the desktop layout
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

/**
 * The board folds its two pedal rows into one swipeable row below this width:
 * two 342px+ rows plus the chain strip and deck don't fit a phone viewport, and
 * a single row keeps the whole chain in one left-to-right reading order.
 */
export function useSingleRowBoard(): boolean {
  return useMediaQuery('(max-width: 720px)');
}

/** True on touch-first devices, where HTML5 drag-and-drop reorder is unavailable. */
export function useCoarsePointer(): boolean {
  return useMediaQuery('(pointer: coarse)');
}

/**
 * Phone cutoff: below this we render a different component tree entirely
 * (`components/mobile/`) instead of the pedalboard, which is built around
 * fixed-width pedal enclosures in a horizontal stage and cannot fold down
 * to ~390px. 639.98px is the exact complement of Tailwind's `sm`
 * (min-width: 640px), so no viewport width can match both.
 */
export function useIsPhone(): boolean {
  return useMediaQuery('(max-width: 639.98px)');
}
