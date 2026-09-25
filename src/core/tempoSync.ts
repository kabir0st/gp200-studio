/**
 * Tempo-synced Rate/Time knobs.
 *
 * With its Sync switch on, a mod Rate or delay Time knob stops meaning Hz/ms
 * and selects a note value against the patch tempo instead. Nothing about the
 * stored float changes: it stays in the knob's own min..max range, and the
 * note is read off where it sits in that range. This is Valeton's own mapping,
 * taken from the label routine in the official editor (GP-200.exe, file offset
 * 0x1a2765): the range is cut into ten equal parts and the value rounded to the
 * nearest of the eleven marks, `round((value - min) / (max - min) * 10)`, with
 * 1/1 at the minimum end.
 *
 * Which knob belongs to which switch comes from the generated SYNC_BINDS.
 */
import { getEffectParams, type KnobParam, type SwitchParam } from './effectParams';
import { SYNC_BINDS } from './effectSyncBinds';

/** Note values in knob order, minimum end first. */
export const SYNC_NOTES = [
  '1/1',
  '1/2',
  '1/2D',
  '1/2T',
  '1/4',
  '1/4D',
  '1/4T',
  '1/8',
  '1/8D',
  '1/8T',
  '1/16',
] as const;

const LAST_NOTE = SYNC_NOTES.length - 1;

/** The Sync switch that turns `knob` into a note-value knob, if it has one. */
export function syncSwitchFor(effectId: number, knob: KnobParam): SwitchParam | null {
  const switchName = SYNC_BINDS[effectId]?.[knob.name];
  if (!switchName) return null;
  const found = getEffectParams(effectId).find(
    (param): param is SwitchParam => param.type === 'switch' && param.name === switchName,
  );
  return found ?? null;
}

/** True when `knob` currently selects a note value rather than Hz/ms. */
export function isKnobSynced(
  effectId: number,
  knob: KnobParam,
  params: readonly number[],
): boolean {
  const syncSwitch = syncSwitchFor(effectId, knob);
  if (!syncSwitch) return false;
  return (params[syncSwitch.idx] ?? syncSwitch.default) !== 0;
}

/** Which of SYNC_NOTES `value` selects. */
export function noteIndex(value: number, knob: KnobParam): number {
  const range = knob.max - knob.min;
  if (range <= 0) return 0;
  const index = Math.round(((value - knob.min) / range) * LAST_NOTE);
  return Math.min(LAST_NOTE, Math.max(0, index));
}

/**
 * The value to store for note `index`: the centre of its bucket, snapped to the
 * knob's step so it is also a value the unsynced knob could hold.
 */
export function noteValue(index: number, knob: KnobParam): number {
  const clamped = Math.min(LAST_NOTE, Math.max(0, Math.round(index)));
  const centre = knob.min + (clamped * (knob.max - knob.min)) / LAST_NOTE;
  let step = 1;
  if (knob.step > 0) step = knob.step;
  return Math.round(centre / step) * step;
}

export function noteLabel(value: number, knob: KnobParam): string {
  return SYNC_NOTES[noteIndex(value, knob)];
}
