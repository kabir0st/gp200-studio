import { useEffect, useRef, useState } from 'react';
import type { KnobParam } from '@/core/effectParams';
import { formatValue, stepValue } from '@/components/board/paramValue';
import { ValueEntry } from '@/components/board/ValueEntry';

interface FocusRailProps {
  /** the knob last touched, or null when nothing has been */
  param: KnobParam | null;
  value: number;
  onChange: (paramIdx: number, value: number) => void;
  /** that knob's Sync switch is on: step and pick by note value */
  synced?: boolean;
}

/**
 * Single-step precision for the last knob a thumb touched.
 *
 * A 72px cap turned by a 200px sweep resolves a 0..100 param to about half a
 * unit per pixel — fine for finding a sound, useless for landing on exactly 63.
 * The board answers that with a mouse wheel and arrow keys; a phone has
 * neither, so the steppers have to exist somewhere. One rail shared by every
 * knob on screen, rather than a pair of buttons hung off each of them, is what
 * keeps the face looking like a pedal instead of a form.
 *
 * The steppers move by the param's own resolution (one unit, 0.1 Hz, 1 ms),
 * and tapping the value opens a field to type it outright, or the note list
 * on a tempo-synced Rate/Time.
 */
export function FocusRail({ param, value, onChange, synced = false }: FocusRailProps) {
  const [editing, setEditing] = useState(false);
  const valueRef = useRef<HTMLButtonElement>(null);
  // The value button is not mounted while the field is, so focus goes back to
  // it after the render that brings it back rather than from the close handler.
  const refocus = useRef(false);

  useEffect(() => {
    if (editing || !refocus.current) return;
    refocus.current = false;
    valueRef.current?.focus();
  }, [editing]);

  if (!param) return null;

  const readout = formatValue(value, param, synced);
  const lower = stepValue(value, param, -1, { synced, fine: true });
  const higher = stepValue(value, param, 1, { synced, fine: true });
  // Compared as text: a synced value off its note's centre would otherwise
  // leave − live at 1/1, where it can only move the value within the same note.
  const atFloor = formatValue(lower, param, synced) === readout;
  const atCeiling = formatValue(higher, param, synced) === readout;

  let pickVerb = 'Type a value for';
  if (synced) pickVerb = 'Pick a note value for';

  return (
    <div className="m-rail">
      <button
        type="button"
        className="m-rail-reset"
        aria-label={`Reset ${param.name} to default`}
        onClick={() => onChange(param.idx, param.default)}
      >
        ⟲
      </button>
      <span className="m-rail-name">{param.name}</span>
      {editing && (
        <ValueEntry
          className="m-rail-entry"
          param={param}
          value={value}
          synced={synced}
          label={param.name}
          onCommit={(next, edited) => onChange(edited.idx, next)}
          onClose={(backToRail) => {
            refocus.current = backToRail;
            setEditing(false);
          }}
        />
      )}
      {!editing && (
        <button
          ref={valueRef}
          type="button"
          className="m-rail-value"
          aria-label={`${pickVerb} ${param.name}, now ${readout}`}
          onClick={() => setEditing(true)}
        >
          {readout}
        </button>
      )}
      <button
        type="button"
        className="m-nudge"
        aria-label={`Decrease ${param.name}`}
        disabled={atFloor}
        onClick={() => onChange(param.idx, lower)}
      >
        −
      </button>
      <button
        type="button"
        className="m-nudge"
        aria-label={`Increase ${param.name}`}
        disabled={atCeiling}
        onClick={() => onChange(param.idx, higher)}
      >
        +
      </button>
    </div>
  );
}
