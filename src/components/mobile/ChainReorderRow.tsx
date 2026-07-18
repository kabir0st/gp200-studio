import type { CSSProperties } from 'react';
import type { EffectSlot } from '@/core/types';
import { getEffectName, getSlotModule } from '@/core/effectNames';
import { getBodySpec } from '@/components/board/boardPalette';
import type { PedalArtEntry } from '@/components/board/pedalManifest';

interface ChainReorderRowProps {
  slot: EffectSlot;
  index: number;
  chainLength: number;
  art?: PedalArtEntry;
  onMove: (from: number, to: number) => void;
  /** long-press drag handle wiring (pointer down starts a lift) */
  onDragHandleDown: (index: number, e: React.PointerEvent) => void;
  lifted: boolean;
}

/**
 * Edit-mode row: a drag handle plus explicit ▲▼.
 *
 * The arrows are the primary control, not a fallback — they are unambiguous,
 * keyboard- and screen-reader-operable, and can't be lost to a mis-timed
 * gesture. Long-press drag is layered on the handle for speed.
 */
export function ChainReorderRow({
  slot,
  index,
  chainLength,
  art,
  onMove,
  onDragHandleDown,
  lifted,
}: ChainReorderRowProps) {
  const effectName = getEffectName(slot.effectId);
  const moduleName = getSlotModule(slot.slotIndex);
  const spec = art?.colors ?? getBodySpec(moduleName);
  const vars = { '--body': spec.body, '--ink': spec.ink } as CSSProperties;

  return (
    <li className={`m-row edit${lifted ? ' lifted' : ''}`} style={vars}>
      {/* touch-action:none lives on the handle only (see mobile.css) — putting
          it on the row would swallow vertical page scroll. */}
      <span
        className="m-grip"
        role="button"
        tabIndex={-1}
        aria-hidden="true"
        onPointerDown={(e) => onDragHandleDown(index, e)}
      >
        ⠿
      </span>

      <span className="m-row-band" aria-hidden="true" />
      <span className="m-row-pos">{index + 1}</span>
      <span className="m-row-text">
        <span className="m-row-top">
          <span className="m-row-module">{moduleName}</span>
          <span className="m-row-name">{effectName}</span>
        </span>
      </span>

      <span className="m-move">
        <button
          type="button"
          className="m-move-btn"
          aria-label={`Move ${effectName} earlier`}
          disabled={index === 0}
          onClick={() => onMove(index, index - 1)}
        >
          ▲
        </button>
        <button
          type="button"
          className="m-move-btn"
          aria-label={`Move ${effectName} later`}
          disabled={index === chainLength - 1}
          onClick={() => onMove(index, index + 1)}
        >
          ▼
        </button>
      </span>
    </li>
  );
}
