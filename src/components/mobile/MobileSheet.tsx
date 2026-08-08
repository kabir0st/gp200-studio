import type { ReactNode } from 'react';
import { Dialog } from '@/components/ui/Dialog';

interface MobileSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

/**
 * Full-height sheet for the panels the phone borrows from the desktop tree
 * (EXP, CTRL, FX loop, patch metadata).
 *
 * Dialog locks page scroll while open, so never stack two of these — one sheet
 * depth maximum, or the restore double-fires.
 */
export function MobileSheet({ open, onClose, title, children }: MobileSheetProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      placement="bottom"
      maxWidth="max-w-none"
      padding="p-0"
      className="m-sheet"
    >
      {/* Dialog's `title` is only the aria-label, so the visible header is ours. */}
      <div className="m-sheet-head">
        <h2 className="m-sheet-title">{title}</h2>
        <button type="button" className="m-sheet-close" aria-label="Close" onClick={onClose}>
          ✕
        </button>
      </div>
      <div className="m-sheet-body">{children}</div>
    </Dialog>
  );
}
