import type { KnobParam } from '@/core/effectParams';

/** Clamp to the param's range and snap to its step. */
export function clampSnap(raw: number, param: KnobParam): number {
  const clamped = Math.min(param.max, Math.max(param.min, raw));
  const step = param.step > 0 ? param.step : 1;
  return Math.round(clamped / step) * step;
}

/** Readout text: decimals inferred from step, `+` prefix on bipolar params. */
export function formatValue(value: number, param: KnobParam): string {
  const dp = param.step > 0 && param.step < 1 ? 1 : 0;
  const v = Number(value.toFixed(dp));
  return `${param.min < 0 && v > 0 ? '+' : ''}${v}`;
}
