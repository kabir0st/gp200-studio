import type { CSSProperties, KeyboardEvent, PointerEvent } from 'react';
import type { EffectSlot } from '@/core/types';
import { getEffectName, getSlotModule } from '@/core/effectNames';
import { getEffectParams, type EffectParam } from '@/core/effectParams';
import { getBodySpec } from '@/components/board/boardPalette';
import { formatValue } from '@/components/board/paramValue';
import type { PedalArtEntry } from '@/components/board/pedalManifest';

interface ChainRowProps {
  slot: EffectSlot;
  /** array position in the chain (0-based) */
  index: number;
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

/** The first two knob params, as "Drive 62 · Tone 40" — a glance-level summary. */
function summarize(defs: EffectParam[], params: number[]): string {
  return defs
    .filter((def): def is Extract<EffectParam, { type: 'knob' }> => def.type === 'knob')
    .slice(0, 2)
    .map((def) => `${def.name} ${formatValue(params[def.idx] ?? def.default, def)}`)
    .join(' · ');
}

/**
 * One chain block as a list row.
 *
 * The phone drops the pedal enclosure entirely — a 172/310px body cannot tile
 * on a 390px viewport without a horizontal scroller. What the enclosure
 * communicated survives: module color as a left edge band, the LED as the
 * bypass switch state, and the effect name at reading size.
 *
 * Three separate targets, so no interaction has to be moded: the grip drags,
 * the body opens the editor, the switch toggles bypass.
 */
export function ChainRow({
  slot,
  index,
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
    <li
      className={`m-row${slot.enabled ? '' : ' bypassed'}${dragging ? ' dragging' : ''}`}
      style={vars}
      data-drag-row=""
    >
      <button
        type="button"
        className="m-grip"
        aria-label={`Reorder ${effectName}, position ${index + 1} of ${chainLength}. Use arrow keys to move.`}
        onPointerDown={(e) => onDragHandleDown(index, e)}
        onKeyDown={onGripKeyDown}
      >
        <span className="m-grip-dots" aria-hidden="true" />
      </button>

      <button type="button" className="m-row-main" onClick={onOpen}>
        <span className="m-row-band" aria-hidden="true" />
        <span className="m-row-pos">{index + 1}</span>
        <span className="m-row-text">
          <span className="m-row-top">
            <span className="m-row-module">{moduleName}</span>
            <span className="m-row-name">{effectName}</span>
          </span>
          {summary && <span className="m-row-summary">{summary}</span>}
        </span>
        <span className="m-row-chevron" aria-hidden="true">
          ›
        </span>
      </button>

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
    </li>
  );
}
