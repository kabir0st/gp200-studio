import { useLayoutEffect, useRef } from 'react';
import type { RefObject } from 'react';

type Placement = 'center' | 'bottom' | 'right';

/** Height of the overlay's content box (its padding is the dialog's margin). */
function contentBoxHeight(overlay: HTMLElement): number {
  const style = getComputedStyle(overlay);
  const padTop = parseFloat(style.paddingTop) || 0;
  const padBottom = parseFloat(style.paddingBottom) || 0;
  return Math.max(0, overlay.clientHeight - padTop - padBottom);
}

/** Height the panel wants, including its own borders (scrollHeight excludes them). */
function desiredHeight(panel: HTMLElement): number {
  const borderY = panel.offsetHeight - panel.clientHeight;
  return panel.scrollHeight + borderY;
}

/** The panel's stylesheet max-height (max-h-[88dvh] & co), in px. */
function styleCap(panel: HTMLElement): number {
  const cap = parseFloat(getComputedStyle(panel).maxHeight);
  if (Number.isNaN(cap)) {
    return Number.POSITIVE_INFINITY;
  }
  return cap;
}

/**
 * Holds a dialog's visible edge still for as long as it stays open.
 *
 * Both placements used to move whenever their content height changed, so
 * switching a tab (Patch Settings), filtering a list (Effect Picker) or adding
 * a looper track slid the dialog under the pointer, taking the control the
 * user had just clicked with it. A centered panel re-centered, shifting by half
 * the delta; a bottom sheet is pinned by its bottom edge, so its header slid
 * instead.
 *
 * The fix is the same rule for both: measure once on open, then only ever move
 * *up*, and only far enough that taller content still fits on screen.
 *
 * - center: the panel is top-aligned and the centering offset is written as a
 *   margin, so shrinking content leaves the top where it is.
 * - bottom: the measured height becomes a floor, so shrinking content can no
 *   longer pull the sheet's header down.
 *
 * A viewport resize drops both measurements and re-centers from scratch, as
 * does closing and reopening the dialog.
 */
export function useDialogAnchor(
  open: boolean,
  placement: Placement,
  overlayRef: RefObject<HTMLDivElement | null>,
  panelRef: RefObject<HTMLDivElement | null>,
): void {
  const anchorRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (!open || placement === 'right') {
      return;
    }
    const overlay = overlayRef.current;
    const panel = panelRef.current;
    if (!overlay || !panel) {
      return;
    }
    // Read before the first write, or we would measure our own inline value.
    const cssCap = styleCap(panel);

    function measureCentered(available: number, height: number) {
      const frozen = anchorRef.current;
      let offset = Math.max(0, Math.round((available - height) / 2));
      if (frozen !== null) {
        offset = Math.min(frozen, Math.max(0, available - height));
      }
      anchorRef.current = offset;
      return offset;
    }

    function measure() {
      if (!overlay || !panel) {
        return;
      }
      const available = contentBoxHeight(overlay);
      const cap = Math.min(cssCap, available);
      const height = Math.min(desiredHeight(panel), cap);
      if (placement === 'bottom') {
        // Bottom sheets are pinned by the bottom edge: a floor is what keeps
        // the header still. The floor can only grow, and the stylesheet's
        // max-height still bounds how tall the sheet gets.
        const floor = Math.max(anchorRef.current ?? 0, height);
        anchorRef.current = floor;
        panel.style.minHeight = `${floor}px`;
        return;
      }
      const offset = measureCentered(available, height);
      panel.style.marginTop = `${offset}px`;
      panel.style.maxHeight = `${Math.min(cap, available - offset)}px`;
    }

    function remeasure() {
      anchorRef.current = null;
      measure();
    }

    measure();

    // Content swaps (tabs, filters, async panels) resize the panel, not the window.
    const observer = new ResizeObserver(measure);
    observer.observe(panel);
    window.addEventListener('resize', remeasure);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', remeasure);
      anchorRef.current = null;
      panel.style.marginTop = '';
      panel.style.maxHeight = '';
      panel.style.minHeight = '';
    };
  }, [open, placement, overlayRef, panelRef]);
}
