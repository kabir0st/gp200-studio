import { useState } from 'react';
import type { GP200Preset } from '@/core/types';
import type { ManifestIndex } from '@/components/board/pedalManifest';
import { lookupPedalArt } from '@/components/board/pedalManifest';
import { useLongPressDrag } from '@/hooks/useLongPressDrag';
import { ChainRow } from './ChainRow';
import { ChainReorderRow } from './ChainReorderRow';

/** Keep in sync with `.m-row` height in mobile.css — the drag math needs it. */
const ROW_HEIGHT = 72;

interface ChainScreenProps {
  preset: GP200Preset;
  artIndex: ManifestIndex | null;
  onToggle: (slotIndex: number, currentlyEnabled: boolean) => void;
  onMove: (from: number, to: number) => void;
  onOpenSlot: (index: number) => void;
  onOpenFxLoop: () => void;
}

/**
 * The chain as a vertical list, in signal order, top to bottom.
 *
 * This replaces the board's horizontal stage outright. The stage needs ~2200px
 * for eleven fixed-width enclosures, which on a phone means a horizontal
 * scroller whose axis collides with every knob drag inside it. A vertical list
 * removes the conflict rather than tuning it, and puts the whole chain in one
 * reading order.
 */
export function ChainScreen({
  preset,
  artIndex,
  onToggle,
  onMove,
  onOpenSlot,
  onOpenFxLoop,
}: ChainScreenProps) {
  const [editing, setEditing] = useState(false);
  const chain = preset.effects;

  const drag = useLongPressDrag({
    rowHeight: ROW_HEIGHT,
    itemCount: chain.length,
    onCommit: onMove,
  });

  // While a row is lifted, preview the reordered list so the drag reads as
  // direct manipulation rather than a value that only lands on release.
  const ordered = [...chain];
  if (drag.lifted !== null && drag.target !== null && drag.lifted !== drag.target) {
    const [moved] = ordered.splice(drag.lifted, 1);
    ordered.splice(drag.target, 0, moved);
  }

  return (
    <div className="m-screen">
      <div className="m-screen-head">
        <h2 className="m-screen-title">SIGNAL CHAIN</h2>
        <button
          type="button"
          className={`m-btn small${editing ? ' active' : ''}`}
          aria-pressed={editing}
          onClick={() => setEditing((on) => !on)}
        >
          {editing ? 'DONE' : 'REORDER'}
        </button>
      </div>

      <ul className="m-list">
        <li className="m-marker">
          <span>IN</span>
        </li>

        {ordered.map((slot, position) => (
          <div key={slot.slotIndex} className="m-row-wrap">
            {editing ? (
              <ChainReorderRow
                slot={slot}
                index={position}
                chainLength={chain.length}
                art={lookupPedalArt(artIndex, slot.effectId)}
                onMove={onMove}
                onDragHandleDown={drag.start}
                /* In the previewed array the dragged row already sits at its
                   target position, so the highlight keys off `target`, not the
                   original `lifted` index. */
                lifted={drag.target === position}
              />
            ) : (
              <ChainRow
                slot={slot}
                index={position}
                art={lookupPedalArt(artIndex, slot.effectId)}
                onToggle={() => onToggle(slot.slotIndex, slot.enabled)}
                onOpen={() => onOpenSlot(position)}
              />
            )}

            {/* FX loop send/return are chain positions (1..10), so they render
                between rows exactly where they sit in the signal path. */}
            {!editing && preset.fxLoopSend === position + 1 && (
              <button type="button" className="m-marker fx" onClick={onOpenFxLoop}>
                <span>↗ FX SEND</span>
                <span className="m-marker-edit">EDIT</span>
              </button>
            )}
            {!editing && preset.fxLoopReturn === position + 1 && (
              <button type="button" className="m-marker fx" onClick={onOpenFxLoop}>
                <span>↘ FX RETURN</span>
                <span className="m-marker-edit">EDIT</span>
              </button>
            )}
          </div>
        ))}

        <li className="m-marker">
          <span>OUT</span>
        </li>
      </ul>
    </div>
  );
}
