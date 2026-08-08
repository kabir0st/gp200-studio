import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import {
  CONTROL_RECORDS_FILE_OFFSET,
  applyControlRecords,
  buildDefaultTail,
  defaultCtrlAssignments,
  defaultExpAssignments,
  parseControlRecords,
} from '@/core/controlRecords';

// Real device exports (firmware 1.8.0). 01-A and 01-C carry uninitialized
// firmware memory in the CTRL records' unknown windows; 07-D is a clean save
// with zeros there. 06-B and 07-D encode the same assignments, so together
// they prove the garbage bytes never leak into the parsed masks.
function loadFixture(name: string): Uint8Array {
  return new Uint8Array(readFileSync(join(process.cwd(), 'dumps/prts', name)));
}

// dumps/ is gitignored (real device exports, not committed), so these suites
// only run on a machine that has them. Same convention as PRSTEncoder.test.ts.
const HAS_FIXTURES = existsSync(join(process.cwd(), 'dumps/prts', '01-A Start Pedal.prst'));

describe.skipIf(!HAS_FIXTURES)('parseControlRecords', () => {
  it('decodes the CTRL masks of a real device export', () => {
    const bytes = loadFixture('01-A Start Pedal.prst');
    const parsed = parseControlRecords(bytes, CONTROL_RECORDS_FILE_OFFSET);
    expect(parsed).toBeDefined();
    expect(parsed!.ctrl.map((assignment) => assignment.ctrlIndex))
      .toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    // PRE, EQ, DST, MOD, DLY, RVB, none, bit-11 (unmodeled, kept verbatim).
    // Regression: the old parser read the mask at payload+1 — the state byte
    // plus a garbage byte — so CTRL 2 (true mask 0x040 = EQ only) rendered
    // as phantom PRE/DLY/RVB/VOL.
    expect(parsed!.ctrl.map((assignment) => assignment.blockMask))
      .toEqual([0x001, 0x040, 0x004, 0x080, 0x100, 0x200, 0x000, 0x800]);
  });

  it('decodes identical masks from a garbage-laden and a clean save', () => {
    const masksOf = (name: string) =>
      parseControlRecords(loadFixture(name), CONTROL_RECORDS_FILE_OFFSET)!
        .ctrl.map((assignment) => assignment.blockMask);
    const expected = [0x004, 0x080, 0x100, 0, 0, 0, 0, 0]; // DST, MOD, DLY
    expect(masksOf('07-D Scotland Kiss.prst')).toEqual(expected);
    expect(masksOf('06-B Radio Cat.prst')).toEqual(expected);
  });

  it('decodes the default EXP assignments (VOL pedal + WAH position)', () => {
    const bytes = loadFixture('01-A Start Pedal.prst');
    const parsed = parseControlRecords(bytes, CONTROL_RECORDS_FILE_OFFSET);
    expect(parsed!.exp).toHaveLength(9);
    // EXP1 Mode A Para 1 → VOL block param 0
    expect(parsed!.exp[0]).toEqual(
      { page: 0, item: 0, blockIndex: 10, paramIndex: 0, max: 100, min: 0 },
    );
    // EXP1 Mode B Para 1 → WAH block param 3
    const modeB = parsed!.exp.find(
      (assignment) => assignment.page === 1 && assignment.item === 0,
    );
    expect(modeB).toEqual(
      { page: 1, item: 0, blockIndex: 1, paramIndex: 3, max: 100, min: 0 },
    );
    // Everything else unassigned
    const unassigned = parsed!.exp.filter((assignment) => assignment.blockIndex === null);
    expect(unassigned).toHaveLength(7);
  });

  it('returns undefined for a garbage tail', () => {
    const bytes = new Uint8Array(64).fill(0xAB);
    expect(parseControlRecords(bytes, 0)).toBeUndefined();
  });

  it('returns undefined for an all-zero tail (padding runaway)', () => {
    const bytes = new Uint8Array(64);
    expect(parseControlRecords(bytes, 0)).toBeUndefined();
  });

  it('returns undefined when startOffset is past the end of the buffer', () => {
    const bytes = new Uint8Array(16);
    expect(parseControlRecords(bytes, 32)).toBeUndefined();
  });

  it('returns undefined for a truncated record stream', () => {
    const bytes = loadFixture('01-A Start Pedal.prst')
      .subarray(CONTROL_RECORDS_FILE_OFFSET, CONTROL_RECORDS_FILE_OFFSET + 40);
    expect(parseControlRecords(bytes, 0)).toBeUndefined();
  });
});

describe('buildDefaultTail', () => {
  it('parses back to default assignments', () => {
    const parsed = parseControlRecords(buildDefaultTail(), 0);
    expect(parsed).toBeDefined();
    expect(parsed!.ctrl.every((assignment) => assignment.blockMask === 0)).toBe(true);
    expect(parsed!.exp).toEqual(defaultExpAssignments());
  });

  it('round-trips custom assignments through the parser', () => {
    const ctrl = defaultCtrlAssignments();
    ctrl[2] = { ctrlIndex: 2, blockMask: 0x145 };
    const exp = defaultExpAssignments();
    exp[4] = { page: 1, item: 1, blockIndex: 7, paramIndex: 2, min: 10, max: 90 };
    const tail = buildDefaultTail(exp, ctrl);
    const parsed = parseControlRecords(tail, 0);
    expect(parsed!.ctrl[2].blockMask).toBe(0x145);
    expect(parsed!.exp[4]).toEqual(
      { page: 1, item: 1, blockIndex: 7, paramIndex: 2, min: 10, max: 90 },
    );
  });

  // Regression: a single unmodeled value used to abort the whole parse via
  // `return undefined`, silently dropping every EXP *and* CTRL assignment, so
  // the footswitch panel read "nothing assigned" even when CTRLs were mapped.
  it('keeps all records when one EXP targets a special (unmodeled) block byte', () => {
    const exp = defaultExpAssignments();
    exp[0] = { page: 0, item: 0, blockIndex: 0x20, paramIndex: 0, min: 0, max: 100 };
    const ctrl = defaultCtrlAssignments();
    ctrl[3] = { ctrlIndex: 3, blockMask: 0x0F };
    const tail = buildDefaultTail(exp, ctrl);
    const parsed = parseControlRecords(tail, 0);
    expect(parsed).toBeDefined();
    expect(parsed!.exp).toHaveLength(9);
    expect(parsed!.ctrl).toHaveLength(8);
    // The special target is preserved verbatim (round-trips), and the CTRL
    // masks that share the tail survive alongside it.
    expect(parsed!.exp[0].blockIndex).toBe(0x20);
    expect(parsed!.ctrl[3].blockMask).toBe(0x0F);
  });

  it('keeps bit 11 but strips the garbage nibble above the 12-bit mask', () => {
    const ctrl = defaultCtrlAssignments();
    ctrl[1] = { ctrlIndex: 1, blockMask: 0x805 }; // bit 11 + PRE + DST
    ctrl[2] = { ctrlIndex: 2, blockMask: 0x1005 }; // bit 12 = garbage territory
    const tail = buildDefaultTail(undefined, ctrl);
    const parsed = parseControlRecords(tail, 0);
    expect(parsed).toBeDefined();
    expect(parsed!.ctrl[1].blockMask).toBe(0x805);
    expect(parsed!.ctrl[2].blockMask).toBe(0x005);
  });
});

describe.skipIf(!HAS_FIXTURES)('applyControlRecords', () => {
  it('overwrites only the mask low byte in a real device tail', () => {
    const original = loadFixture('01-A Start Pedal.prst');
    const modified = new Uint8Array(original);
    const parsed = parseControlRecords(original, CONTROL_RECORDS_FILE_OFFSET)!;
    const ctrl = parsed.ctrl.map((assignment) => ({ ...assignment }));
    ctrl[1] = { ctrlIndex: 1, blockMask: 0x88 };
    const ok = applyControlRecords(modified, CONTROL_RECORDS_FILE_OFFSET, parsed.exp, ctrl);
    expect(ok).toBe(true);
    const reparsed = parseControlRecords(modified, CONTROL_RECORDS_FILE_OFFSET)!;
    expect(reparsed.ctrl[1].blockMask).toBe(0x88);
    // Exactly one byte differs: the mask low byte at payload+4 of CTRL 2's
    // record. The state byte and the uninitialized windows stay untouched.
    const diffs: number[] = [];
    for (let i = 0; i < original.length; i++) {
      if (original[i] !== modified[i]) diffs.push(i);
    }
    expect(diffs).toEqual([0x474]);
  });

  it('preserves the garbage high nibble when writing high mask bits', () => {
    const original = loadFixture('01-A Start Pedal.prst');
    const modified = new Uint8Array(original);
    const parsed = parseControlRecords(original, CONTROL_RECORDS_FILE_OFFSET)!;
    const ctrl = parsed.ctrl.map((assignment) => ({ ...assignment }));
    ctrl[0] = { ctrlIndex: 0, blockMask: 0x100 }; // PRE → DLY
    applyControlRecords(modified, CONTROL_RECORDS_FILE_OFFSET, parsed.exp, ctrl);
    const reparsed = parseControlRecords(modified, CONTROL_RECORDS_FILE_OFFSET)!;
    expect(reparsed.ctrl[0].blockMask).toBe(0x100);
    // CTRL 1's record: payload at 0x464, mask at 0x468/0x469. The fixture's
    // 0x469 byte is 0xE0 (garbage nibble E); the new bit 8 lands in the low
    // nibble while the E is kept, and the state byte at 0x465 stays 0x01.
    expect(modified[0x468]).toBe(0x00);
    expect(modified[0x469]).toBe(0xE1);
    expect(modified[0x465]).toBe(0x01);
  });

  it('is a no-op when neither exp nor ctrl is provided', () => {
    const original = loadFixture('06-B Radio Cat.prst');
    const modified = new Uint8Array(original);
    expect(applyControlRecords(modified, CONTROL_RECORDS_FILE_OFFSET, undefined, undefined))
      .toBe(true);
    expect(Array.from(modified)).toEqual(Array.from(original));
  });

  it('returns false on an unwalkable stream', () => {
    const bytes = new Uint8Array(64).fill(0xAB);
    expect(applyControlRecords(bytes, 0, defaultExpAssignments(), undefined)).toBe(false);
  });
});
