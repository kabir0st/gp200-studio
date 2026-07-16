import { useRef, useState } from 'react';
import type { KnobParam } from '@/core/effectParams';
import { KNOB_STYLES, type BodySpec } from './boardPalette';

interface PedalKnobProps {
  param: KnobParam;
  value: number;
  onChange: (value: number) => void;
  knobStyle: BodySpec['knob'];
  ink: string;
  /** for the accessible label, e.g. "UK 800 Gain" */
  pedalName: string;
}

const START_ANGLE = -135;
const SWEEP = 270;
/** pixels of vertical drag for a full min→max sweep (mockup-tested) */
const DRAG_RANGE_PX = 160;

function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const rad = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

function clampSnap(raw: number, param: KnobParam): number {
  const clamped = Math.min(param.max, Math.max(param.min, raw));
  const step = param.step > 0 ? param.step : 1;
  return Math.round(clamped / step) * step;
}

function formatValue(value: number, param: KnobParam): string {
  const dp = param.step > 0 && param.step < 1 ? 1 : 0;
  const v = Number(value.toFixed(dp));
  return `${param.min < 0 && v > 0 ? '+' : ''}${v}`;
}

/**
 * Skeuomorphic rotary knob: 270° sweep, vertical pointer drag, double-click
 * reset, arrow-key steps. The pointer position IS the value — no value arc.
 */
export function PedalKnob({ param, value, onChange, knobStyle, ink, pedalName }: PedalKnobProps) {
  const style = KNOB_STYLES[knobStyle];
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ y: 0, value: 0 });

  const pct = param.max > param.min ? (value - param.min) / (param.max - param.min) : 0;
  const angle = START_ANGLE + SWEEP * pct;

  const ticks: string[] = [];
  for (let i = 0; i <= 10; i++) {
    const a = START_ANGLE + (SWEEP * i) / 10;
    const [x0, y0] = polar(50, 50, 42, a);
    const [x1, y1] = polar(50, 50, 48, a);
    ticks.push(`M ${x0} ${y0} L ${x1} ${y1}`);
  }

  const keyStep = (param.max - param.min) / 50;

  return (
    <div className={`knob${dragging ? ' dragging' : ''}`}>
      <svg
        viewBox="0 0 100 100"
        role="slider"
        tabIndex={0}
        aria-label={`${pedalName} ${param.name}`}
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
          const range = param.max - param.min;
          const raw = dragStart.current.value + ((dragStart.current.y - e.clientY) * range) / DRAG_RANGE_PX;
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
        {ticks.map((d, i) => (
          <path key={i} d={d} stroke={ink} strokeOpacity={0.35} strokeWidth={2.5} strokeLinecap="round" />
        ))}
        <circle cx={50} cy={50} r={34} fill={style.cap1} />
        <circle cx={46} cy={44} r={30} fill={style.cap0} />
        <circle cx={50} cy={50} r={34} fill="none" stroke="rgba(0,0,0,.45)" strokeWidth={2} />
        <line
          x1={50}
          y1={48}
          x2={50}
          y2={20}
          stroke={style.pointer}
          strokeWidth={6}
          strokeLinecap="round"
          transform={`rotate(${angle} 50 50)`}
        />
      </svg>
      <span className="k-label" title={param.name}>{param.name}</span>
      <span className="k-value">{formatValue(value, param)}</span>
    </div>
  );
}
