/**
 * Selection model for the patch manager's 256-slot list.
 *
 * One slot is the *anchor* — the row every single-slot action (ACTIVATE, OPEN,
 * RENAME, …) works on, and the row a shift-click ranges from. Any further rows
 * picked with shift or ctrl/cmd live alongside it. Keeping the anchor separate
 * is what lets multi-select sit on top of the existing single-select actions
 * without changing them.
 */

export interface SlotSelection {
  /** The row single-slot actions act on. null when nothing is selected. */
  anchor: number | null;
  /** Selected rows other than the anchor. */
  extra: ReadonlySet<number>;
}

export interface SelectModifiers {
  shift: boolean;
  toggle: boolean;
}

export const EMPTY_SELECTION: SlotSelection = { anchor: null, extra: new Set() };

/** Every selected slot, anchor included, in ascending order. */
export function selectedSlots(selection: SlotSelection): number[] {
  if (selection.anchor === null) return [];
  const all = new Set(selection.extra);
  all.add(selection.anchor);
  return [...all].sort((first, second) => first - second);
}

/** Applies a click on `slot` to the current selection. */
export function selectSlot(
  selection: SlotSelection,
  slot: number,
  modifiers?: SelectModifiers,
): SlotSelection {
  const { anchor, extra } = selection;

  if (modifiers?.shift && anchor !== null) {
    const from = Math.min(anchor, slot);
    const to = Math.max(anchor, slot);
    const range = new Set<number>();
    for (let s = from; s <= to; s++) if (s !== anchor) range.add(s);
    return { anchor, extra: range };
  }

  if (modifiers?.toggle && anchor !== null) {
    const next = new Set(extra);
    next.add(anchor);
    if (next.has(slot)) next.delete(slot);
    else next.add(slot);
    if (next.size === 0) return EMPTY_SELECTION;
    // The anchor must stay selected, so it follows the clicked slot when that
    // slot survived the toggle, and otherwise falls back to the lowest
    // remaining row.
    const nextAnchor = next.has(slot) ? slot : Math.min(...next);
    next.delete(nextAnchor);
    return { anchor: nextAnchor, extra: next };
  }

  return { anchor: slot, extra: new Set() };
}

/** Selects every slot in `slots`, keeping the current anchor if it is among them. */
export function selectAll(selection: SlotSelection, slots: number[]): SlotSelection {
  if (slots.length === 0) return EMPTY_SELECTION;
  const all = new Set(slots);
  const anchor = selection.anchor !== null && all.has(selection.anchor)
    ? selection.anchor
    : Math.min(...all);
  all.delete(anchor);
  return { anchor, extra: all };
}

/** Drops everything but the anchor. */
export function collapseToAnchor(selection: SlotSelection): SlotSelection {
  return { anchor: selection.anchor, extra: new Set() };
}
