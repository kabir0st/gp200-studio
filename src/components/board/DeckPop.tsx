import { useEffect, useRef } from 'react';

interface DeckPopProps {
  label: string;
  onClose: () => void;
  children: React.ReactNode;
  /** Wider variant for popovers with side-by-side controls (sliders + buttons). */
  wide?: boolean;
}

/**
 * Small anchored popover: click-outside and Escape close it. Shared by the deck
 * (patch settings, anchored upward) and the top bar (patch name, anchored down
 * via the `.board-topbar .deck-pop` override in board.css).
 */
export function DeckPop({ label, onClose, children, wide }: DeckPopProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onDown(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  let popClass = 'deck-pop';
  if (wide) popClass = 'deck-pop wide';
  return (
    <div ref={ref} className={popClass} role="group" aria-label={label}>
      {children}
    </div>
  );
}
