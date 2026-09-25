import type { KnobParam } from '@/core/effectParams';
import { noteIndex, noteLabel, noteValue } from '@/core/tempoSync';
import { fineStep, keyStep } from './knobGeometry';

/**
 * How a knob moves right now. `synced`: its Sync switch is on, so it steps
 * through note values (core/tempoSync.ts). `fine`: Shift is held, so a step is
 * the param's own resolution even on a wide knob (see keyStep).
 */
export interface KnobMode {
  synced?: boolean;
  fine?: boolean;
}

/** Clamp to the param's range and snap to its step. */
export function clampSnap(raw: number, param: KnobParam): number {
  const clamped = Math.min(param.max, Math.max(param.min, raw));
  const step = fineStep(param);
  return Math.round(clamped / step) * step;
}

/** Snap a raw drag position: to the step, or to the nearest note when synced. */
export function snapValue(raw: number, param: KnobParam, synced = false): number {
  if (synced) return noteValue(noteIndex(raw, param), param);
  return clampSnap(raw, param);
}

/** Move `notches` keyboard presses / wheel notches from `value`. */
export function stepValue(
  value: number,
  param: KnobParam,
  notches: number,
  mode: KnobMode = {},
): number {
  if (mode.synced) return noteValue(noteIndex(value, param) + notches, param);
  const step = keyStep(param, mode.fine);
  return clampSnap(value + notches * step, param);
}

/** Readout text: decimals inferred from step, `+` prefix on bipolar params. */
export function formatValue(value: number, param: KnobParam, synced = false): string {
  if (synced) return noteLabel(value, param);
  let dp = 0;
  if (param.step > 0 && param.step < 1) dp = 1;
  const v = Number(value.toFixed(dp));
  let sign = '';
  if (param.min < 0 && v > 0) sign = '+';
  return `${sign}${v}`;
}

/** The plain number a value entry field starts from (no `+`, no note label). */
export function entryText(value: number, param: KnobParam): string {
  let dp = 0;
  if (param.step > 0 && param.step < 1) dp = 1;
  return String(Number(value.toFixed(dp)));
}

/**
 * A typed value, clamped and snapped, or null if the text holds no number.
 * Forgiving about what people actually type: a decimal comma, a leading `+`,
 * and a trailing unit (`350ms`, `0.5 Hz`) all parse.
 */
export function parseEntry(text: string, param: KnobParam): number | null {
  const parsed = parseFloat(text.trim().replace(',', '.'));
  if (!Number.isFinite(parsed)) return null;
  return clampSnap(parsed, param);
}
