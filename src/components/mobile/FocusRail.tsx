import type { KnobParam } from '@/core/effectParams';
import { clampSnap, formatValue } from '@/components/board/paramValue';
import { keyStep } from '@/components/board/knobGeometry';

interface FocusRailProps {
  /** the knob last touched, or null when nothing has been */
  param: KnobParam | null;
  value: number;
  onChange: (paramIdx: number, value: number) => void;
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
 */
export function FocusRail({ param, value, onChange }: FocusRailProps) {
  if (!param) return null;

  const nudge = (direction: -1 | 1) => {
    const next = clampSnap(value + direction * keyStep(param), param);
    if (next !== value) onChange(param.idx, next);
  };

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
      <span className="m-rail-value">{formatValue(value, param)}</span>
      <button
        type="button"
        className="m-nudge"
        aria-label={`Decrease ${param.name}`}
        disabled={value <= param.min}
        onClick={() => nudge(-1)}
      >
        −
      </button>
      <button
        type="button"
        className="m-nudge"
        aria-label={`Increase ${param.name}`}
        disabled={value >= param.max}
        onClick={() => nudge(1)}
      >
        +
      </button>
    </div>
  );
}
