import { useEffect, useRef, type ReactNode } from 'react';
import { Card } from './Card';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  closeOnOverlayClick?: boolean;
  className?: string;
  /** Use "alertdialog" for interruptive warnings that demand a decision
   *  (e.g. firmware compatibility); defaults to "dialog" for everything else. */
  role?: 'dialog' | 'alertdialog';
  /** "bottom" anchors the panel to the bottom edge (deck drawers); "right"
   *  makes it a full-height side sheet (patch manager); default centers. */
  placement?: 'center' | 'bottom' | 'right';
  /** Tailwind max-width utility for the panel. Appending a max-w-* via
   *  className does NOT reliably override the default (stylesheet order
   *  wins, not class order); wide dialogs must set it here. */
  maxWidth?: string;
  /** Tailwind padding utilities for the panel; same stylesheet-order caveat
   *  as maxWidth, so padding overrides must come through here. */
  padding?: string;
}

/* Mobile-first placements: bottom sheets hug the screen edges below sm
 * (native-sheet feel, square bottom corners, safe-area padding for the iOS
 * home indicator); center dialogs cap their height and scroll internally. */
const OVERLAY_PLACEMENT: Record<'center' | 'bottom' | 'right', string> = {
  center: 'justify-center items-center p-3 sm:p-4',
  bottom: 'justify-center items-end p-0 sm:p-4',
  right: 'justify-end items-stretch',
};

const PANEL_PLACEMENT: Record<'center' | 'bottom' | 'right', string> = {
  center: 'max-h-[90dvh] overflow-y-auto',
  bottom:
    'rounded-b-none sm:rounded-b-lg pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-6',
  right: 'h-full rounded-none overflow-y-auto',
};

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Shared dialog shell (see docs/design-system.md "Components > Dialog").
 *  Owns overlay, Escape-to-close, and a focus trap so every dialog in the
 *  app (confirm, warn, save, firmware-compat, ...) shares one a11y contract
 *  instead of reimplementing it. */
export function Dialog({
  open,
  onClose,
  title,
  children,
  closeOnOverlayClick = true,
  className = '',
  role = 'dialog',
  placement = 'center',
  maxWidth = 'max-w-md',
  padding = 'p-4 sm:p-6',
}: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const focusable = panel?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    (focusable?.[0] ?? panel)?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !panel) return;
      const items = panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previouslyFocused.current?.focus();
    };
  }, [open, onClose]);

  // Lock background page scroll while open so wheel/touch stays inside the modal.
  // The page scroller is <html>, so lock it there; compensate for the vanished
  // scrollbar with padding so the layout behind the overlay doesn't shift.
  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    const scrollbarWidth = window.innerWidth - root.clientWidth;
    const prevOverflow = root.style.overflow;
    const prevPaddingRight = root.style.paddingRight;
    root.style.overflow = 'hidden';
    if (scrollbarWidth > 0) root.style.paddingRight = `${scrollbarWidth}px`;
    return () => {
      root.style.overflow = prevOverflow;
      root.style.paddingRight = prevPaddingRight;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className={`fixed inset-0 z-50 bg-black/60 flex ${OVERLAY_PLACEMENT[placement]}`}
      onClick={closeOnOverlayClick ? onClose : undefined}
    >
      <Card
        ref={panelRef}
        role={role}
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`${maxWidth} w-full ${padding} focus:outline-none ${PANEL_PLACEMENT[placement]} ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </Card>
    </div>
  );
}
