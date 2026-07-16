import { useLayoutEffect, type RefObject } from 'react';

/**
 * Fit-to-viewport zoom for the pedal grid. Measures the stage's available height
 * and the grid's natural height, then sets `--board-zoom` on the grid so both
 * rows + the deck fit without scrolling — full size when there's room, shrinking
 * only as much as needed on shorter screens (never below `floor`). Chrome/Edge
 * only, like the rest of the app (Web MIDI); `zoom` scales layout, so the cables
 * inside the grid scale in step.
 *
 * @param stageRef  the scroll region (`.stage`)
 * @param gridRef   the element carrying `--board-zoom` (`.board-rows`)
 * @param depKey    re-fit when this changes (e.g. the chain order key); resize is
 *                  handled by a ResizeObserver regardless
 */
export function useFitZoom(
  stageRef: RefObject<HTMLElement | null>,
  gridRef: RefObject<HTMLElement | null>,
  depKey: string,
) {
  useLayoutEffect(() => {
    const stage = stageRef.current;
    const grid = gridRef.current;
    if (!stage || !grid) return;

    const fit = () => {
      // measure natural (unzoomed) sizes first, without painting the reset
      grid.style.setProperty('--board-zoom', '1');
      const natural = grid.offsetHeight;
      if (natural === 0) return;
      const overhead = stage.scrollHeight - natural; // deck, paddings, margins
      const available = stage.clientHeight;
      const zoom = Math.max(0.5, Math.min(1, (available - overhead) / natural));
      grid.style.setProperty('--board-zoom', String(zoom));
    };

    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(stage);
    return () => ro.disconnect();
  }, [depKey, stageRef, gridRef]);
}
