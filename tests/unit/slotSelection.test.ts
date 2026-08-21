import { describe, it, expect } from 'vitest';
import {
  EMPTY_SELECTION,
  collapseToAnchor,
  selectAll,
  selectSlot,
  selectedSlots,
} from '@/core/slotSelection';

const sel = (anchor: number | null, ...extra: number[]) => ({ anchor, extra: new Set(extra) });

describe('slotSelection', () => {
  it('a plain click selects exactly one slot', () => {
    const next = selectSlot(sel(9, 10, 11), 3);
    expect(selectedSlots(next)).toEqual([3]);
    expect(next.anchor).toBe(3);
  });

  it('shift-click selects the inclusive range from the anchor', () => {
    const next = selectSlot(sel(4), 7, { shift: true, toggle: false });
    expect(selectedSlots(next)).toEqual([4, 5, 6, 7]);
    expect(next.anchor).toBe(4);
  });

  it('shift-click ranges backwards too', () => {
    const next = selectSlot(sel(7), 4, { shift: true, toggle: false });
    expect(selectedSlots(next)).toEqual([4, 5, 6, 7]);
  });

  it('a second shift-click replaces the range rather than growing it', () => {
    const first = selectSlot(sel(4), 9, { shift: true, toggle: false });
    const second = selectSlot(first, 6, { shift: true, toggle: false });
    expect(selectedSlots(second)).toEqual([4, 5, 6]);
  });

  it('ctrl-click adds a slot and moves the anchor to it', () => {
    const next = selectSlot(sel(4), 20, { shift: false, toggle: true });
    expect(selectedSlots(next)).toEqual([4, 20]);
    expect(next.anchor).toBe(20);
  });

  it('ctrl-click on a selected slot removes it', () => {
    const two = selectSlot(sel(4), 20, { shift: false, toggle: true });
    const one = selectSlot(two, 20, { shift: false, toggle: true });
    expect(selectedSlots(one)).toEqual([4]);
    expect(one.anchor).toBe(4);
  });

  it('ctrl-clicking away the last slot clears the selection', () => {
    const cleared = selectSlot(sel(4), 4, { shift: false, toggle: true });
    expect(cleared).toEqual(EMPTY_SELECTION);
    expect(selectedSlots(cleared)).toEqual([]);
  });

  it('never leaves an anchor outside the selection', () => {
    // Removing the anchor itself has to hand the anchor to a surviving row,
    // otherwise the single-slot buttons would act on an unselected patch.
    const three = selectSlot(selectSlot(sel(4), 8, { shift: false, toggle: true }), 12, { shift: false, toggle: true });
    const without = selectSlot(three, 12, { shift: false, toggle: true });
    expect(without.anchor).not.toBeNull();
    expect(selectedSlots(without)).toContain(without.anchor);
    expect(selectedSlots(without)).toEqual([4, 8]);
  });

  it('selectAll keeps the current anchor when it is in the set', () => {
    const next = selectAll(sel(6), [4, 5, 6, 7]);
    expect(next.anchor).toBe(6);
    expect(selectedSlots(next)).toEqual([4, 5, 6, 7]);
  });

  it('selectAll adopts the lowest slot when the anchor is elsewhere', () => {
    const next = selectAll(sel(99), [4, 5, 6, 7]);
    expect(next.anchor).toBe(4);
    expect(selectedSlots(next)).toEqual([4, 5, 6, 7]);
  });

  it('collapseToAnchor leaves one slot selected', () => {
    const next = collapseToAnchor(selectAll(sel(6), [4, 5, 6, 7]));
    expect(selectedSlots(next)).toEqual([6]);
  });

  it('modifier clicks with nothing selected behave like a plain click', () => {
    expect(selectedSlots(selectSlot(EMPTY_SELECTION, 12, { shift: true, toggle: false }))).toEqual([12]);
    expect(selectedSlots(selectSlot(EMPTY_SELECTION, 12, { shift: false, toggle: true }))).toEqual([12]);
  });
});
