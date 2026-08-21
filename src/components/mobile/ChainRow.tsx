import type { CSSProperties, KeyboardEvent, PointerEvent } from 'react';
import type { EffectSlot } from '@/core/types';
import { getEffectName, getSlotModule } from '@/core/effectNames';
import { getEffectParams, type EffectParam } from '@/core/effectParams';
import { getBodySpec } from '@/components/board/boardPalette';
import { formatValue } from '@/components/board/paramValue';
import type { PedalArtEntry } from '@/components/board/pedalManifest';
import { PedalArt } from './PedalArt';

interface ChainRowProps {
  slot: EffectSlot;
  /** array position in the chain (0-based); drives handlers */
  index: number;
  /** position to *show* , differs from `index` mid-drag, while the committed
   *  order still stands under the animation */
  displayIndex: number;
  chainLength: number;
  art?: PedalArtEntry;
  onToggle: () => void;
  onOpen: () => void;
  onMove: (from: number, to: number) => void;
  /** grip pointer-down starts a drag */
  onDragHandleDown: (index: number, e: PointerEvent) => void;
  /** true while this row is the one being dragged */
  dragging: boolean;
}

/** The first two knob params, as "Drive 62 · Tone 40" , a glance-level summary. */
function summarize(defs: EffectParam[], params: number[]): string {
  return defs
    .filter((def): def is Extract<EffectParam, { type: 'knob' }> => def.type === 'knob')
    .slice(0, 2)
    .map((def) => `${def.name} ${formatValue(params[def.idx] ?? def.default, def)}`)
    .join(' · ');
}

/**
 * One chain block as a pedal card.
 *
 * The board's 172/310px enclosure cannot tile on a 390px viewport, but the
 * thing it was communicating can: the card wears the same body gradient, gloss
 * sweep and corner screws, carries the effect's own artwork cropped to the
 * pedal itself, and lights the same LED. Only the proportions are the phone's.
 *
 * Three separate targets, so no interaction has to be moded: the grip drags,
 * the body opens the editor, the switch toggles bypass.
 */
export function ChainRow({
  slot,
  index,
  displayIndex,
  chainLength,
  art,
  onToggle,
  onOpen,
  onMove,
  onDragHandleDown,
  dragging,
}: ChainRowProps) {
  const effectName = getEffectName(slot.effectId);
  // module identity is the physical block, never the effectId (slot 5 is always CAB)
  const moduleName = getSlotModule(slot.slotIndex);
  const spec = art?.colors ?? getBodySpec(moduleName);
  const summary = summarize(getEffectParams(slot.effectId), slot.params);

  const vars = {
    '--body': spec.body,
    '--body-deep': spec.bodyDeep,
    '--ink': spec.ink,
    '--led': spec.led,
  } as CSSProperties;

  // Dragging is pointer-only, so the grip doubles as a keyboard control —
  // otherwise reordering would be unreachable without a pointing device.
  function onGripKeyDown(e: KeyboardEvent) {
    if (e.key === 'ArrowUp' && index > 0) {
      e.preventDefault();
      onMove(index, index - 1);
    } else if (e.key === 'ArrowDown' && index < chainLength - 1) {
      e.preventDefault();
      onMove(index, index + 1);
    }
  }

  return (
    // data-drag-row sits on the card, not the <li> that wraps it: the card is
    // what GSAP transforms, and the cable in the gap below has to stay put.
    <div
      className={`m-pedal-card${slot.enabled ? '' : ' bypassed'}${dragging ? ' dragging' : ''}`}
      style={vars}
      data-drag-row=""
    >
      <button
        type="button"
        className="m-grip"
        aria-label={`Reorder ${effectName}, position ${displayIndex + 1} of ${chainLength}. Use arrow keys to move.`}
        onPointerDown={(e) => onDragHandleDown(index, e)}
        onKeyDown={onGripKeyDown}
      >
        <span className="m-grip-dots" aria-hidden="true" />
      </button>

      <button type="button" className="m-card-main" onClick={onOpen}>
        <span className="m-card-pos">{displayIndex + 1}</span>
        {/* Fixed box, so eleven cards of wildly different shapes — a tall
            stompbox, a wide amp head — still line up as one list. The artwork
            is letterboxed inside it by pedals.css. */}
        <span className="m-card-thumb">{art && <PedalArt art={art} />}</span>
        {/* The name owns its own line. Sharing one with the module chip cost it
            most of the column on a 320px screen — "Green OD" came out as
            "Gr…" — and the chip pairs more naturally with the values anyway. */}
        <span className="m-card-text">
          <span className="m-card-name">{effectName}</span>
          <span className="m-card-bottom">
            <span className="m-card-module">{moduleName}</span>
            {summary && <span className="m-card-summary">{summary}</span>}
          </span>
        </span>
      </button>

      <span className="m-card-led" aria-hidden="true" />

      <button
        type="button"
        className={`m-switch${slot.enabled ? ' on' : ''}`}
        role="switch"
        aria-checked={slot.enabled}
        aria-label={`${effectName} ${slot.enabled ? 'on' : 'bypassed'}`}
        onClick={onToggle}
      >
        <span className="m-switch-knob" aria-hidden="true" />
      </button>
    </div>
  );
}
