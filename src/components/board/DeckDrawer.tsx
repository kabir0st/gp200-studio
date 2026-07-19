import type { ReactNode } from 'react';
import { Dialog } from '@/components/ui/Dialog';

interface DeckDrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

/**
 * Centered dialog shell for deck features that need more room than a popover
 * (FX loop routing, EXP controller assignment, CTRL footswitches, drums &
 * looper). Built on the shared Dialog primitive so it inherits the focus
 * trap / Escape / aria contract, and matches the centered placement of every
 * other non-sheet dialog (Effect Picker, Loop Station, Select Preset).
 */
export function DeckDrawer({ open, onClose, title, children }: DeckDrawerProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      placement="center"
      maxWidth="max-w-4xl"
      className="max-h-[88dvh] overflow-y-auto"
    >
      <div className="flex items-center justify-between mb-4">
        <span className="font-mono-display text-label font-bold tracking-wider uppercase text-text-secondary">
          {title}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label={`Close ${title}`}
          className="ui-btn font-mono-display text-xs font-bold px-3 py-1.5 -my-1 rounded
            text-text-muted hover:text-text-primary"
        >
          ✕
        </button>
      </div>
      {children}
    </Dialog>
  );
}
