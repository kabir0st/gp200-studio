import { useRef, type RefObject } from 'react';
import type { GP200Preset } from '@/core/types';
import type { ManifestIndex } from '@/components/board/pedalManifest';
import { lookupPedalArt } from '@/components/board/pedalManifest';
import { useDragReorder } from '@/hooks/useDragReorder';
import { ChainRow } from './ChainRow';

interface ChainScreenProps {
  preset: GP200Preset;
  artIndex: ManifestIndex | null;
  /** the scrolling <main>, so a drag near the edge can follow the finger */
  scrollRef: RefObject<HTMLElement | null>;
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
 *
 * Reorder is always available from each row's grip — there is no edit mode,
 * because a mode would put a tap between the user and the most physical
 * operation in the app.
 */
export function ChainScreen({
  preset,
  artIndex,
  scrollRef,
  onToggle,
  onMove,
  onOpenSlot,
  onOpenFxLoop,
}: ChainScreenProps) {
  const listRef = useRef<HTMLUListElement>(null);
  const chain = preset.effects;

  const drag = useDragReorder({
    scrollRef,
    listRef,
    itemCount: chain.length,
    onCommit: onMove,
  });

  // Preview the reordered list while dragging so it reads as direct
  // manipulation rather than a value that only lands on release.
  const ordered = [...chain];
  if (drag.from !== null && drag.target !== null && drag.from !== drag.target) {
    const [moved] = ordered.splice(drag.from, 1);
    ordered.splice(drag.target, 0, moved);
  }

  return (
    <div className="m-screen">
      <div className="m-screen-head">
        <h2 className="m-screen-title">SIGNAL CHAIN</h2>
        <span className="m-screen-hint">DRAG ⠿ TO REORDER</span>
      </div>

      <ul className={`m-list${drag.from !== null ? ' dragging' : ''}`} ref={listRef}>
        <li className="m-marker">
          <span>IN</span>
        </li>

        {ordered.map((slot, position) => (
          <div key={slot.slotIndex} className="m-row-wrap">
            <ChainRow
              slot={slot}
              index={position}
              chainLength={chain.length}
              art={lookupPedalArt(artIndex, slot.effectId)}
              onToggle={() => onToggle(slot.slotIndex, slot.enabled)}
              onOpen={() => onOpenSlot(position)}
              onMove={onMove}
              onDragHandleDown={drag.start}
              /* In the previewed array the dragged row already sits at its
                 target position, so this keys off `target`, not `from`. */
              dragging={drag.target === position}
            />

            {/* FX loop send/return are chain positions (1..10), so they render
                between rows exactly where they sit in the signal path. They are
                hidden mid-drag: they aren't drag targets, and leaving them in
                place while rows move around them reads as broken. */}
            {drag.from === null && preset.fxLoopSend === position + 1 && (
              <button type="button" className="m-marker fx" onClick={onOpenFxLoop}>
                <span>↗ FX SEND</span>
                <span className="m-marker-edit">EDIT</span>
              </button>
            )}
            {drag.from === null && preset.fxLoopReturn === position + 1 && (
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
