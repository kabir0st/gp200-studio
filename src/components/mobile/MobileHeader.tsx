import { SysExCodec } from '@/core/SysExCodec';
import type { PushProgress } from '@/core/devicePush';

interface MobileHeaderProps {
  connected: boolean;
  patchName: string;
  currentSlot: number | null;
  pushProgress: PushProgress | null;
  onActivateSlot: (slot: number) => void;
  /** open the name/author sheet */
  onEditMeta: () => void;
}

/** Wrap 0..255 so stepping past either end lands on the other. */
function stepSlot(slot: number, delta: number): number {
  return (slot + delta + 256) % 256;
}

/**
 * Sticky top strip: connection state, patch stepper, patch name. The desktop
 * top bar also carries LOOP/DRUMS/TUNER and the whole device session; on a
 * phone those live in the tab bar and the DEVICE tab, so the header stays a
 * single row of the things you read rather than press.
 */
export function MobileHeader({
  connected,
  patchName,
  currentSlot,
  pushProgress,
  onActivateSlot,
  onEditMeta,
}: MobileHeaderProps) {
  const slotLabel = currentSlot === null ? null : SysExCodec.slotToLabel(currentSlot);
  const canStep = connected && currentSlot !== null;

  return (
    <header className="m-header">
      <button
        type="button"
        className="m-step"
        aria-label="Previous patch"
        disabled={!canStep}
        onClick={() => currentSlot !== null && onActivateSlot(stepSlot(currentSlot, -1))}
      >
        ‹
      </button>

      <button type="button" className="m-header-patch" onClick={onEditMeta}>
        <span className={`m-dot${connected ? ' on' : ''}`} aria-hidden="true" />
        <span className="m-header-name">{patchName || 'Untitled'}</span>
        {slotLabel && <span className="m-header-slot">{slotLabel}</span>}
        <span className="m-header-edit" aria-hidden="true">
          ✎
        </span>
      </button>

      <button
        type="button"
        className="m-step"
        aria-label="Next patch"
        disabled={!canStep}
        onClick={() => currentSlot !== null && onActivateSlot(stepSlot(currentSlot, 1))}
      >
        ›
      </button>

      {/* Push progress as a determinate bar along the header's bottom edge —
          there is no room for the desktop's SYNC readout, and a bar reads
          faster than a fraction while a multi-pass send is in flight. */}
      {pushProgress && (
        <div
          className="m-header-sync"
          role="progressbar"
          aria-label="Sending patch to device"
          aria-valuemin={0}
          aria-valuemax={pushProgress.total}
          aria-valuenow={pushProgress.completed}
        >
          <span
            className="m-header-sync-fill"
            style={{
              width: `${pushProgress.total > 0 ? (pushProgress.completed / pushProgress.total) * 100 : 0}%`,
            }}
          />
        </div>
      )}
    </header>
  );
}
