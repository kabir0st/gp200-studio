import { useEffect, useRef, useState } from 'react';
import type { KnobParam } from '@/core/effectParams';
import { KNOB_STYLES, type BodySpec } from './boardPalette';
import { clampSnap, formatValue } from './paramValue';

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
/** wheel notches (and arrow-key presses) for a full min→max sweep */
const NOTCHES_PER_SWEEP = 50;
/** Chrome's pixel delta for one mouse-wheel detent */
const WHEEL_NOTCH_DELTA = 100;
/** a violent flick shouldn't slam the param into its rail in one event */
const MAX_NOTCHES_PER_EVENT = 4;
const LINE_DELTA_PX = 16;
const PAGE_DELTA_PX = 400;

/** Wheel deltas in the event's own unit, normalised to pixels. */
function wheelPixels(event: WheelEvent): number {
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) return event.deltaY * LINE_DELTA_PX;
  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) return event.deltaY * PAGE_DELTA_PX;
  return event.deltaY;
}

function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const rad = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}


/**
 * Skeuomorphic rotary knob: 270° sweep, vertical pointer drag, mouse wheel,
 * double-click reset, arrow-key steps. The pointer position IS the value.
 * No value arc.
 */
export function PedalKnob({ param, value, onChange, knobStyle, ink, pedalName }: PedalKnobProps) {
  const style = KNOB_STYLES[knobStyle];
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ y: 0, value: 0 });
  const unitRef = useRef<HTMLDivElement>(null);

  const pct = param.max > param.min ? (value - param.min) / (param.max - param.min) : 0;
  const angle = START_ANGLE + SWEEP * pct;

  const ticks: string[] = [];
  for (let i = 0; i <= 10; i++) {
    const a = START_ANGLE + (SWEEP * i) / 10;
    const [x0, y0] = polar(50, 50, 42, a);
    const [x1, y1] = polar(50, 50, 48, a);
    ticks.push(`M ${x0} ${y0} L ${x1} ${y1}`);
  }

  // never below the param's own step, or clampSnap would round a nudge straight
  // back to the current value and the knob would sit dead under the wheel.
  const rawStep = (param.max - param.min) / NOTCHES_PER_SWEEP;
  const keyStep = Math.max(rawStep, param.step);

  const nudge = (notches: number) => {
    const next = clampSnap(value + notches * keyStep, param);
    if (next !== value) onChange(next);
  };
  // the wheel listener below is attached once, so it reads the live handler
  // through a ref rather than closing over a stale `value`.
  const nudgeRef = useRef(nudge);
  useEffect(() => {
    nudgeRef.current = nudge;
  });

  useEffect(() => {
    const unit = unitRef.current;
    if (!unit) return;
    // Leftover sub-notch scroll. A trackpad emits many tiny deltas that would
    // each round to zero on their own, so they bank here until they add up.
    let carried = 0;
    // On the whole unit, not the cap: the name and value are part of the same
    // control, and a wheel that dies the moment the pointer drifts onto the
    // label reads as broken. React also registers `onWheel` passively at the
    // root container, so preventDefault() from a JSX handler is a no-op and the
    // board scrolls behind the knob -- hence the native non-passive listener.
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const scrolled = -wheelPixels(event);
      if (scrolled === 0) return;
      // a reversal is a new gesture; banked delta from the old direction
      // would otherwise have to be paid off before the knob turned back.
      if (Math.sign(scrolled) !== Math.sign(carried)) carried = 0;
      carried += scrolled;
      const notches = Math.trunc(carried / WHEEL_NOTCH_DELTA);
      if (notches === 0) return;
      carried -= notches * WHEEL_NOTCH_DELTA;
      const capped = Math.max(-MAX_NOTCHES_PER_EVENT, Math.min(MAX_NOTCHES_PER_EVENT, notches));
      nudgeRef.current(capped);
    };
    unit.addEventListener('wheel', onWheel, { passive: false });
    return () => unit.removeEventListener('wheel', onWheel);
  }, []);

  return (
    // the pointer drag, the wheel and the double-click reset all live on the
    // unit rather than the cap: name and value are part of the same control,
    // and a gesture that dies when the pointer drifts 10px onto the label reads
    // as broken. The cap keeps the slider role, focus and arrow keys -- the
    // labels are static text and would only add duplicate a11y nodes.
    <div
      className={`knob${dragging ? ' dragging' : ''}`}
      ref={unitRef}
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        dragStart.current = { y: e.clientY, value };
        setDragging(true);
      }}
      onPointerMove={(e) => {
        if (!dragging) return;
        const range = param.max - param.min;
        const travel = dragStart.current.y - e.clientY;
        const raw = dragStart.current.value + (travel * range) / DRAG_RANGE_PX;
        const next = clampSnap(raw, param);
        if (next !== value) onChange(next);
      }}
      onPointerUp={() => setDragging(false)}
      onPointerCancel={() => setDragging(false)}
      onDoubleClick={() => onChange(param.default)}
    >
      <svg
        viewBox="0 0 100 100"
        role="slider"
        tabIndex={0}
        aria-label={`${pedalName} ${param.name}`}
        aria-valuemin={param.min}
        aria-valuemax={param.max}
        aria-valuenow={Number(value.toFixed(param.step < 1 ? 1 : 0))}
        aria-valuetext={formatValue(value, param)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
            e.preventDefault();
            nudge(1);
          } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
            e.preventDefault();
            nudge(-1);
          }
        }}
      >
        {ticks.map((tick) => (
          <path
            key={tick}
            d={tick}
            stroke={ink}
            strokeOpacity={0.35}
            strokeWidth={2.5}
            strokeLinecap="round"
          />
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
