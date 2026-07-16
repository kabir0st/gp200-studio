import { useRef, useState } from 'react';
import type { KnobParam } from '@/core/effectParams';
import { clampSnap, formatValue } from './paramValue';

interface PedalFaderProps {
  param: KnobParam;
  value: number;
  onChange: (value: number) => void;
  /** for the accessible label, e.g. "Guitar EQ 1 125Hz" */
  pedalName: string;
}

/** track height minus cap height — full travel = full min→max range */
const TRAVEL_PX = 40;

/**
 * Vertical fader for EQ-module params — a graphic EQ should look like a
 * graphic EQ, not a row of knobs. Same interaction contract as PedalKnob:
 * pointer drag, double-click reset, arrow keys, role="slider".
 */
export function PedalFader({ param, value, onChange, pedalName }: PedalFaderProps) {
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ y: 0, value: 0 });

  const range = param.max - param.min;
  const pct = range > 0 ? (value - param.min) / range : 0;
  const keyStep = range / 50;

  return (
    <div className={`fader${dragging ? ' dragging' : ''}`}>
      <div
        className="f-track"
        role="slider"
        tabIndex={0}
        aria-label={`${pedalName} ${param.name}`}
        aria-orientation="vertical"
        aria-valuemin={param.min}
        aria-valuemax={param.max}
        aria-valuenow={Number(value.toFixed(param.step < 1 ? 1 : 0))}
        aria-valuetext={formatValue(value, param)}
        onPointerDown={(e) => {
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          dragStart.current = { y: e.clientY, value };
          setDragging(true);
        }}
        onPointerMove={(e) => {
          if (!dragging) return;
          const raw = dragStart.current.value + ((dragStart.current.y - e.clientY) * range) / TRAVEL_PX;
          const next = clampSnap(raw, param);
          if (next !== value) onChange(next);
        }}
        onPointerUp={() => setDragging(false)}
        onDoubleClick={() => onChange(param.default)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
            e.preventDefault();
            onChange(clampSnap(value + keyStep, param));
          } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
            e.preventDefault();
            onChange(clampSnap(value - keyStep, param));
          }
        }}
      >
        <span className="f-cap" style={{ bottom: `${pct * TRAVEL_PX}px` }} />
      </div>
      <span className="k-label" title={param.name}>{param.name}</span>
      <span className="k-value">{formatValue(value, param)}</span>
    </div>
  );
}
