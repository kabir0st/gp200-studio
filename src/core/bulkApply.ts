// Scope model for bulk patch operations (apply CTRL assignments / patch
// volume across many slots at once). Pure helpers; the device loop lives in
// useMidiDevice.bulkApply.

import type { CtrlAssignment } from './types';

export const SLOT_COUNT = 256;
export const BANK_COUNT = 64;

/** Which saved patches a bulk operation targets. Banks are 1-based (1..64). */
export type BulkScope =
  | { kind: 'all' }
  | { kind: 'banks'; fromBank: number; toBank: number };

/** What a bulk operation writes into each target patch. */
export interface BulkApplyOptions {
  /** Full CTRL 1–8 assignment set to copy into every target patch. */
  ctrlAssignments?: CtrlAssignment[];
  /** Patch volume 0..100 to set on every target patch. */
  volume?: number;
}

export interface BulkApplyProgress {
  done: number;
  total: number;
  /** Slot currently being written. */
  slot: number;
}

function clampBank(bank: number): number {
  return Math.min(Math.max(Math.round(bank), 1), BANK_COUNT);
}

/** Expand a scope into an ordered slot list. Bank bounds are clamped and
 *  swapped if reversed, so any numeric input yields a valid range. */
export function slotsForScope(scope: BulkScope): number[] {
  if (scope.kind === 'all') {
    return [...Array(SLOT_COUNT).keys()];
  }
  let from = clampBank(scope.fromBank);
  let to = clampBank(scope.toBank);
  if (from > to) [from, to] = [to, from];
  const slots: number[] = [];
  for (let slot = (from - 1) * 4; slot < to * 4; slot++) slots.push(slot);
  return slots;
}

/** Human summary for confirmation UI: "all 256 patches" / "banks 3–7 (20 patches)". */
export function describeScope(scope: BulkScope): string {
  const slots = slotsForScope(scope);
  if (scope.kind === 'all') return `all ${slots.length} patches`;
  let from = clampBank(scope.fromBank);
  let to = clampBank(scope.toBank);
  if (from > to) [from, to] = [to, from];
  if (from === to) return `bank ${from} (${slots.length} patches)`;
  return `banks ${from}–${to} (${slots.length} patches)`;
}
