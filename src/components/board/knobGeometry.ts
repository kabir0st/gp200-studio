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
/** Wheel notches (and arrow-key presses) for a full min→max sweep. */
export const NOTCHES_PER_SWEEP = 50;

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

/**
 * How far one keyboard press or wheel notch moves the value.
 *
 * Never below the param's own step, or clampSnap would round a nudge straight
 * back to the current value and the knob would sit dead under the wheel.
 */
export function keyStep(param: KnobParam): number {
  return Math.max((param.max - param.min) / NOTCHES_PER_SWEEP, param.step);
}
