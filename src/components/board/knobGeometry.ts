/**
 * The shape of a rotary knob, shared by the board's PedalKnob and the phone's
 * MobileKnob.
 *
 * The two controls are driven very differently — the board drags vertically and
 * claims the gesture outright, the phone drags horizontally so a scrolling list
 * can keep the other axis — but they are the same knob, and a 270° sweep that
 * started at a different angle in one of them would read as a bug. Only the
 * geometry lives here; interaction stays with each component.
 */
import type { KnobParam } from '@/core/effectParams';

/** Seven o'clock, where a real pot's minimum sits. */
export const START_ANGLE = -135;
export const SWEEP = 270;
/**
 * The most wheel notches (and arrow-key presses) a full min→max sweep may take.
 * Every 0..100 or ±100 knob fits in one step per notch; only a wide knob such
 * as delay Time (3980 ms) is stepped coarser to stay under it.
 */
export const NOTCHES_PER_SWEEP = 200;

/** The knob is drawn on a 100×100 viewBox, centred. */
export const KNOB_VIEWBOX = 100;
const CENTRE = KNOB_VIEWBOX / 2;

export function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const rad = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

/** Where the pointer sits for `value`, in degrees. */
export function knobAngle(value: number, param: KnobParam): number {
  const pct = param.max > param.min ? (value - param.min) / (param.max - param.min) : 0;
  return START_ANGLE + SWEEP * pct;
}

/** The eleven tick marks around the sweep, as path `d` strings. */
export function tickPaths(inner = 42, outer = 48): string[] {
  const ticks: string[] = [];
  for (let i = 0; i <= 10; i++) {
    const a = START_ANGLE + (SWEEP * i) / 10;
    const [x0, y0] = polar(CENTRE, CENTRE, inner, a);
    const [x1, y1] = polar(CENTRE, CENTRE, outer, a);
    ticks.push(`M ${x0} ${y0} L ${x1} ${y1}`);
  }
  return ticks;
}

/** The param's own resolution: its step, or 1 where the table gives none. */
export function fineStep(param: KnobParam): number {
  if (param.step > 0) return param.step;
  return 1;
}

/**
 * How far one keyboard press or wheel notch moves the value.
 *
 * One step of the param's own resolution wherever NOTCHES_PER_SWEEP allows it,
 * so a 0..100 knob goes 70 → 71 and never skips a value (it used to move two,
 * which made 70 unreachable from 71). A wider knob moves a whole number of
 * steps, so delay Time goes in even 20 ms rather than alternating 19 and 20;
 * `fine` (Shift held) brings even that down to one.
 *
 * Always at least one step, or clampSnap would round a nudge straight back to
 * the current value and the knob would sit dead under the wheel.
 */
export function keyStep(param: KnobParam, fine = false): number {
  const resolution = fineStep(param);
  if (fine) return resolution;
  const steps = Math.round((param.max - param.min) / NOTCHES_PER_SWEEP / resolution);
  return Math.max(steps, 1) * resolution;
}
