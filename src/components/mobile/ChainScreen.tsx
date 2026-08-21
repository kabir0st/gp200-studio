import { useRef, type RefObject } from 'react';
import type { GP200Preset } from '@/core/types';
import type { ManifestIndex } from '@/components/board/pedalManifest';
import { lookupPedalArt } from '@/components/board/pedalManifest';
import { displayPosition, useDragReorder } from '@/hooks/useDragReorder';
import { ChainRow } from './ChainRow';
import { ChainCable } from './ChainCable';

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
 * Reorder is always available from each row's grip , there is no edit mode,
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

  return (
    <div className="m-screen">
      <div className="m-screen-head">
        <h2 className="m-screen-title">SIGNAL CHAIN</h2>
        <span className="m-screen-hint">DRAG ⠿ TO REORDER</span>
      </div>

      {/* Rows render in plain chain order at all times. During a drag, GSAP
          moves them by transform and the real reorder is committed once, on
          drop , so layout stays frozen and the animation geometry stays exact
          (see useDragReorder). */}
      <ul className={`m-list${drag.from !== null ? ' dragging' : ''}`} ref={listRef}>
        <li className="m-marker">
          <span>IN</span>
        </li>

        {chain.map((slot, position) => (
          <li key={slot.slotIndex} className="m-row-wrap">
            <ChainRow
              slot={slot}
              index={position}
              displayIndex={displayPosition(position, drag.from, drag.target)}
              chainLength={chain.length}
              art={lookupPedalArt(artIndex, slot.effectId)}
              onToggle={() => onToggle(slot.slotIndex, slot.enabled)}
              onOpen={() => onOpenSlot(position)}
              onMove={onMove}
              onDragHandleDown={drag.start}
              dragging={drag.from === position}
            />

            {/* The patch cable out of this block. Drawn before any FX marker at
                this position so every card visibly has a lead leaving it —
                a marker is a label on the run, not a break in it. The last
                block runs to OUT, which the marker below already draws. */}
            {position < chain.length - 1 && <ChainCable />}

            {/* FX loop send/return are chain positions (1..11), so they render
                between rows exactly where they sit in the signal path. They
                stay mounted during a drag: a marker belongs to a position, not
                to a block, so it correctly holds still while blocks move past
                it , and keeping it in the flow is what makes the measured slot
                geometry valid for the whole gesture. */}
            {preset.fxLoopSend === position + 1 && (
              <button type="button" className="m-marker fx" onClick={onOpenFxLoop}>
                <span>↗ FX SEND</span>
                <span className="m-marker-edit">EDIT</span>
              </button>
            )}
            {preset.fxLoopReturn === position + 1 && (
              <button type="button" className="m-marker fx" onClick={onOpenFxLoop}>
                <span>↘ FX RETURN</span>
                <span className="m-marker-edit">EDIT</span>
              </button>
            )}
          </li>
        ))}

        <li className="m-marker">
          <span>OUT</span>
        </li>
      </ul>
    </div>
  );
}
