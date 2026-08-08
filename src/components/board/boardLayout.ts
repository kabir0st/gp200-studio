import type { EffectSlot } from '@/core/types';
import { getEffectParams } from '@/core/effectParams';
import { getEffectsByModule, getSlotModule } from '@/core/effectNames';

/** Knob-type params for an effect, the density that drives enclosure width. */
function knobCount(effectId: number): number {
  return getEffectParams(effectId).filter((d) => d.type === 'knob').length;
}

/**
 * Wide-format enclosure (amp-style panel): 5+ knobs don't fit a compact body.
 * This is the *pedal's own* size and stays per-effect, so every effect keeps its
 * natural look. Neighbours don't reflow because the fixed-size bay (isWideSlot)
 * absorbs the difference, not because the pedal itself is forced to a size.
 */
export function isWidePedal(effectId: number): boolean {
  return knobCount(effectId) >= 5;
}

// The *bay* (fixed slot cell) is keyed to the module, not the current effect. A
// slot's module (getSlotModule) is fixed, so the bay size is invariant across
// effect switches; swapping effects only changes the padding inside the bay,
// never a neighbour's position.
//
// A module's bay is wide if any of its effects is wide. This keeps the tall,
// knob-heavy effects (compressors, amps, delays) laid out in 2 rows instead of
// squeezing them into 3 rows of a compact body, so bays stay shorter and both
// rows + the deck fit a 1080p viewport. The board fills its width and scrolls
// horizontally, so the extra wide bays never overflow the two-row layout.
const wideModuleCache = new Map<string, boolean>();
function isWideModule(module: string): boolean {
  const cached = wideModuleCache.get(module);
  if (cached !== undefined) return cached;
  const wide = getEffectsByModule(module).some((e) => isWidePedal(e.effectId));
  wideModuleCache.set(module, wide);
  return wide;
}

/** Wide bay for a slot, stable across effect changes (see above). */
export function isWideSlot(slotIndex: number): boolean {
  return isWideModule(getSlotModule(slotIndex));
}

/**
 * Whether the pedal body renders wide. A pedal is wide only when its own effect
 * is wide *and* its bay is wide, so a rare wide effect in a mostly-compact
 * module (bay is compact) renders compact instead of overflowing/overlapping its
 * neighbours. In a wide bay, compact effects still render compact and float with
 * padding. Either way the body never exceeds its bay, so nothing reflows.
 */
export function pedalIsWide(slotIndex: number, effectId: number): boolean {
  return isWideSlot(slotIndex) && isWidePedal(effectId);
}

/**
 * Split the chain into the two visual rows, balancing by rendered width
 * (wide pedal = 2 units, compact = 1) instead of a fixed 6/5 count, a
 * double-width AMP would otherwise push the front row past the stage edge.
 * Chain order is preserved; only the break point moves. Width is slot-derived,
 * so the split is stable when an effect is swapped (only reorder moves it).
 */
export function splitRows(effects: EffectSlot[]): { front: EffectSlot[]; back: EffectSlot[] } {
  const unit = (slot: EffectSlot) => (isWideSlot(slot.slotIndex) ? 2 : 1);
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
