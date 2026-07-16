import type { EffectSlot } from '@/core/types';
import { getEffectParams } from '@/core/effectParams';

/** Wide-format enclosure (amp-style panel): 5+ knobs don't fit a compact body. */
export function isWidePedal(effectId: number): boolean {
  return getEffectParams(effectId).filter((d) => d.type === 'knob').length >= 5;
}

/**
 * Split the chain into the two visual rows, balancing by rendered width
 * (wide pedal = 2 units, compact = 1) instead of a fixed 6/5 count — a
 * double-width AMP would otherwise push the front row past the stage edge.
 * Chain order is preserved; only the break point moves.
 */
export function splitRows(effects: EffectSlot[]): { front: EffectSlot[]; back: EffectSlot[] } {
  const unit = (slot: EffectSlot) => (isWidePedal(slot.effectId) ? 2 : 1);
  const total = effects.reduce((sum, slot) => sum + unit(slot), 0);
  const half = Math.ceil(total / 2);

  const front: EffectSlot[] = [];
  const back: EffectSlot[] = [];
  let frontUnits = 0;
  for (const slot of effects) {
    if (back.length === 0 && (front.length === 0 || frontUnits + unit(slot) <= half)) {
      front.push(slot);
      frontUnits += unit(slot);
    } else {
      back.push(slot);
    }
  }
  return { front, back };
}
