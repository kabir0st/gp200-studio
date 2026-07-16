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
   *  (e.g. firmware compatibility) — defaults to "dialog" for everything else. */
  role?: 'dialog' | 'alertdialog';
  /** "bottom" anchors the panel to the bottom edge (deck drawers); default centers. */
  placement?: 'center' | 'bottom';
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Shared dialog shell — see docs/design-system.md "Components > Dialog".
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

  if (!open) return null;

  return (
    <div
      className={`fixed inset-0 z-50 bg-black/60 flex justify-center p-4 ${
        placement === 'bottom' ? 'items-end' : 'items-center'
      }`}
      onClick={closeOnOverlayClick ? onClose : undefined}
    >
      <Card
        ref={panelRef}
        role={role}
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`max-w-md w-full p-6 focus:outline-none ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </Card>
    </div>
  );
}
