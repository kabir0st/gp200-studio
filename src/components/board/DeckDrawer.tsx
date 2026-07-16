import type { ReactNode } from 'react';
import { Dialog } from '@/components/ui/Dialog';

interface DeckDrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

/**
 * Bottom-anchored sheet for deck features that need more room than a popover
 * (FX loop routing, EXP controller assignment). Built on the shared Dialog
 * primitive so it inherits the focus trap / Escape / aria contract.
 */
export function DeckDrawer({ open, onClose, title, children }: DeckDrawerProps) {
  return (
    <Dialog open={open} onClose={onClose} title={title} placement="bottom" className="max-w-4xl">
      <div className="flex items-center justify-between mb-4">
        <span className="font-mono-display text-label font-bold tracking-wider uppercase text-text-secondary">
          {title}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label={`Close ${title}`}
          className="font-mono-display text-xs font-bold px-2 py-1 rounded text-text-muted hover:text-text-primary"
        >
          ✕
        </button>
      </div>
      {children}
    </Dialog>
  );
}
