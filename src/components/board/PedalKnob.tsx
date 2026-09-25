import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { KnobParam } from '@/core/effectParams';
import { KNOB_STYLES, type BodySpec } from './boardPalette';
import { entryText, formatValue, snapValue, stepValue } from './paramValue';
import { KNOB_VIEWBOX, knobAngle, tickPaths } from './knobGeometry';
import { ValueEntry } from './ValueEntry';

interface PedalKnobProps {
  param: KnobParam;
  value: number;
  onChange: (value: number) => void;
  knobStyle: BodySpec['knob'];
  ink: string;
  /** for the accessible label, e.g. "UK 800 Gain" */
  pedalName: string;
  /** its Sync switch is on: the knob picks a note value (core/tempoSync.ts) */
  synced?: boolean;
}

/** pixels of vertical drag for a full min→max sweep (mockup-tested) */
const DRAG_RANGE_PX = 160;
/** Shift slows a drag this many times over, for landing on one exact value */
const FINE_DRAG_FACTOR = 10;
/** movement below this is a click (which may open the value entry), not a turn */
const DEAD_ZONE_PX = 3;
/** Chrome's pixel delta for one mouse-wheel detent */
const WHEEL_NOTCH_DELTA = 100;
/** a violent flick shouldn't slam the param into its rail in one event */
const MAX_NOTCHES_PER_EVENT = 4;
const LINE_DELTA_PX = 16;
const PAGE_DELTA_PX = 400;

const KEY_DIRECTIONS: Record<string, number> = {
  ArrowUp: 1,
  ArrowRight: 1,
  ArrowDown: -1,
  ArrowLeft: -1,
};

/** Wheel deltas in the event's own unit, normalised to pixels. */
function wheelPixels(event: WheelEvent): number {
  // Shift+wheel is horizontal scroll in Chrome, so a fine-turn notch arrives
  // on deltaX with deltaY at zero.
  let delta = event.deltaY;
  if (delta === 0 && event.shiftKey) delta = event.deltaX;
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) return delta * LINE_DELTA_PX;
  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) return delta * PAGE_DELTA_PX;
  return delta;
}

function startedOnReadout(target: EventTarget): boolean {
  return target instanceof Element && target.closest('.k-value') !== null;
}

/**
 * Skeuomorphic rotary knob: 270° sweep, vertical pointer drag, mouse wheel,
 * double-click reset, arrow-key steps. The pointer position IS the value.
 * No value arc.
 *
 * Wheel and arrows move one value per notch (a coarser even step only on a
 * wide knob such as delay Time; see keyStep). Shift makes every gesture fine:
 * one value even there, and a drag ten times slower. Clicking the readout (or Enter
 * on the focused knob) opens a field to type an exact number, or, on a
 * tempo-synced Rate/Time, a list of note values.
 */
export function PedalKnob({
  param,
  value,
  onChange,
  knobStyle,
  ink,
  pedalName,
  synced = false,
}: PedalKnobProps) {
  const style = KNOB_STYLES[knobStyle];
  const [dragging, setDragging] = useState(false);
  const [editing, setEditing] = useState(false);
  /** pointer y at the last move, the unsnapped value it has turned to, whether
   *  it has left the dead zone yet, and whether it went down on the readout */
  const drag = useRef({ y: 0, raw: 0, turned: false, onReadout: false });
  const unitRef = useRef<HTMLDivElement>(null);
  const capRef = useRef<SVGSVGElement>(null);

  const angle = knobAngle(value, param);
  const ticks = tickPaths();
  const label = `${pedalName} ${param.name}`;
  const readout = formatValue(value, param, synced);

  const nudge = (notches: number, fine: boolean) => {
    const next = stepValue(value, param, notches, { synced, fine });
    if (next !== value) onChange(next);
  };
  // the wheel listener below is attached once, so it reads the live handler
  // (and whether a value is being typed) through a ref rather than closing
  // over a stale `value`.
  const live = useRef({ nudge, editing });
  useEffect(() => {
    live.current = { nudge, editing };
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
      // a value being typed is not turned underneath the field
      if (live.current.editing) return;
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
      live.current.nudge(capped, event.shiftKey);
    };
    unit.addEventListener('wheel', onWheel, { passive: false });
    return () => unit.removeEventListener('wheel', onWheel);
  }, []);

  function closeEntry(refocus: boolean) {
    setEditing(false);
    if (refocus) capRef.current?.focus();
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    // the entry field takes its own presses: caret placement, text selection
    if (editing) return;
    e.preventDefault();
    // optional: jsdom has no pointer capture, and losing it only costs moves
    // that stray off the unit
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = {
      y: e.clientY,
      raw: value,
      turned: false,
      onReadout: startedOnReadout(e.target),
    };
    setDragging(true);
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!dragging) return;
    const current = drag.current;
    // Hold still until the pointer clearly means to turn, so a click (or the
    // two of a double-click reset) never also nudges the value by a jitter.
    if (!current.turned && Math.abs(current.y - e.clientY) < DEAD_ZONE_PX) return;
    current.turned = true;
    // Incremental rather than measured from pickup, so pressing or releasing
    // Shift mid-drag changes the rate from here on instead of jumping.
    let sweep = DRAG_RANGE_PX;
    if (e.shiftKey) sweep *= FINE_DRAG_FACTOR;
    current.raw += ((current.y - e.clientY) * (param.max - param.min)) / sweep;
    current.y = e.clientY;
    const next = snapValue(current.raw, param, synced);
    if (next !== value) onChange(next);
  }

  function onPointerUp() {
    if (!dragging) return;
    setDragging(false);
    // a click on the readout, not a turn that happened to start there
    if (!drag.current.turned && drag.current.onReadout) setEditing(true);
  }

  function onKeyDown(e: ReactKeyboardEvent<SVGSVGElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      setEditing(true);
      return;
    }
    const direction = KEY_DIRECTIONS[e.key];
    if (!direction) return;
    e.preventDefault();
    nudge(direction, e.shiftKey);
  }

  const classes = ['knob'];
  if (dragging) classes.push('dragging');
  if (editing) classes.push('editing');
  let readoutHint = 'Click to type a value';
  if (synced) readoutHint = 'Click to pick a note value';

  return (
    // the pointer drag, the wheel and the double-click reset all live on the
    // unit rather than the cap: name and value are part of the same control,
    // and a gesture that dies when the pointer drifts 10px onto the label reads
    // as broken. The cap keeps the slider role, focus and arrow keys -- the
    // labels are static text and would only add duplicate a11y nodes.
    <div
      className={classes.join(' ')}
      ref={unitRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => setDragging(false)}
      onDoubleClick={() => {
        // the second click of a double-click on the readout lands in the field
        if (editing) return;
        onChange(param.default);
      }}
    >
      <svg
        ref={capRef}
        viewBox={`0 0 ${KNOB_VIEWBOX} ${KNOB_VIEWBOX}`}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={param.min}
        aria-valuemax={param.max}
        aria-valuenow={Number(entryText(value, param))}
        aria-valuetext={readout}
        onKeyDown={onKeyDown}
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
      {editing && (
        <ValueEntry
          className="k-entry"
          param={param}
          value={value}
          synced={synced}
          label={label}
          onCommit={onChange}
          onClose={closeEntry}
        />
      )}
      {!editing && (
        <span className="k-value" title={readoutHint}>
          {readout}
        </span>
      )}
    </div>
  );
}
