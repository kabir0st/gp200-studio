import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { KnobParam } from '@/core/effectParams';
import { KNOB_STYLES, type BodySpec } from '@/components/board/boardPalette';
import { clampSnap, formatValue } from '@/components/board/paramValue';
import { KNOB_VIEWBOX, keyStep, knobAngle, tickPaths } from '@/components/board/knobGeometry';

interface MobileKnobProps {
  param: KnobParam;
  value: number;
  onChange: (value: number) => void;
  knobStyle: BodySpec['knob'];
  /** the pedal body's ink, for ticks and labels */
  ink: string;
  /** for the accessible label, e.g. "UK 800 Gain" */
  pedalName: string;
  /** touching a knob points the focus rail at it */
  onFocus: (paramIdx: number) => void;
  /** inert: no gesture, no keyboard, and announced as unavailable */
  disabled?: boolean;
}

/** Pixels of horizontal drag for a full min→max sweep. */
const DRAG_RANGE_PX = 200;
/** Movement below this is a tap, not a turn. */
const DEAD_ZONE_PX = 4;
const DOUBLE_TAP_MS = 300;

/**
 * The board's rotary knob, re-gestured for a thumb on a scrolling screen.
 *
 * The board drags vertically and takes `touch-action: none` to do it. That is
 * precisely what a phone cannot afford here: the param list scrolls on the same
 * axis, and a control that swallows vertical movement traps the page. So this
 * one turns on **horizontal** drag under `touch-action: pan-y`, which hands the
 * browser the vertical axis and keeps only the horizontal one. The list scrolls
 * normally with a finger anywhere, including across a knob, and if the browser
 * resolves an ambiguous drag as a scroll it sends `pointercancel` and the turn
 * simply never starts.
 *
 * For the same reason `pointerdown` must NOT call `preventDefault()`: that
 * would cancel the browser's pan before it could begin, which is the whole
 * thing this design is buying.
 *
 * A 72px cap cannot resolve a 0..100 param to single units, so precision lives
 * in the focus rail (see PedalEditorScreen) rather than in a pair of steppers
 * hung off every knob.
 */
export function MobileKnob({
  param,
  value,
  onChange,
  knobStyle,
  ink,
  pedalName,
  onFocus,
  disabled = false,
}: MobileKnobProps) {
  const style = KNOB_STYLES[knobStyle];
  const [dragging, setDragging] = useState(false);
  /** pointer x and value at pickup, plus whether this has become a turn yet */
  const drag = useRef({ x: 0, value: 0, turned: false });
  // -Infinity, not 0: event timeStamps are measured from the page's time
  // origin, so a 0 seed would make the very first tap on a freshly loaded page
  // read as the second half of a double-tap and reset the param.
  const lastTap = useRef(-Infinity);

  const angle = knobAngle(value, param);
  const step = keyStep(param);

  function nudge(notches: number) {
    const next = clampSnap(value + notches * step, param);
    if (next !== value) onChange(next);
  }

  function onPointerDown(e: ReactPointerEvent) {
    if (disabled) return;
    // optional: jsdom has no pointer capture, and losing it only costs us moves
    // that stray off the cap — the same allowance useDragReorder makes
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { x: e.clientX, value, turned: false };
    setDragging(true);
    onFocus(param.idx);
  }

  function onPointerMove(e: ReactPointerEvent) {
    if (!dragging) return;
    const dx = e.clientX - drag.current.x;
    // Hold still until the finger clearly means to turn, so the tap that opens
    // the focus rail never also nudges the value.
    if (!drag.current.turned && Math.abs(dx) < DEAD_ZONE_PX) return;
    drag.current.turned = true;

    const range = param.max - param.min;
    const next = clampSnap(drag.current.value + (dx * range) / DRAG_RANGE_PX, param);
    if (next !== value) onChange(next);
  }

  function onPointerUp(e: ReactPointerEvent) {
    if (!dragging) return;
    setDragging(false);
    if (drag.current.turned) return;

    // A tap. Two inside the window reset to the default — the same gesture the
    // board spells as a double-click. Detected by hand rather than through
    // onDoubleClick, which touch engines fire inconsistently (and not at all
    // once a pointer has been captured).
    if (e.timeStamp - lastTap.current < DOUBLE_TAP_MS) {
      lastTap.current = -Infinity;
      if (value !== param.default) onChange(param.default);
      return;
    }
    lastTap.current = e.timeStamp;
  }

  return (
    <div
      className={`m-knob${dragging ? ' dragging' : ''}${disabled ? ' disabled' : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => setDragging(false)}
    >
      <svg
        viewBox={`0 0 ${KNOB_VIEWBOX} ${KNOB_VIEWBOX}`}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={`${pedalName} ${param.name}`}
        aria-disabled={disabled || undefined}
        aria-valuemin={param.min}
        aria-valuemax={param.max}
        aria-valuenow={Number(value.toFixed(param.step < 1 ? 1 : 0))}
        aria-valuetext={formatValue(value, param)}
        onFocus={() => onFocus(param.idx)}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
            e.preventDefault();
            nudge(1);
          } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
            e.preventDefault();
            nudge(-1);
          }
        }}
      >
        {tickPaths().map((tick) => (
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
      <span className="m-knob-label" title={param.name}>
        {param.name}
      </span>
      <span className="m-knob-value">{formatValue(value, param)}</span>
    </div>
  );
}
