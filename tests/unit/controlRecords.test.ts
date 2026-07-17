import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  CONTROL_RECORDS_FILE_OFFSET,
  applyControlRecords,
  buildDefaultTail,
  defaultCtrlAssignments,
  defaultExpAssignments,
  parseControlRecords,
} from '@/core/controlRecords';

function loadFixture(name: string): Uint8Array {
  return new Uint8Array(readFileSync(join(process.cwd(), 'prst', name)));
}

describe('parseControlRecords', () => {
  it('decodes the CTRL masks of a preset with real footswitch assignments', () => {
    const bytes = loadFixture('63-B American Idiot.prst');
    const parsed = parseControlRecords(bytes, CONTROL_RECORDS_FILE_OFFSET);
    expect(parsed).toBeDefined();
    const masks = parsed!.ctrl.map((assignment) => assignment.blockMask);
    expect(parsed!.ctrl.map((assignment) => assignment.ctrlIndex))
      .toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(masks).toEqual([0x01, 0, 0, 0, 0x83, 0x82, 0x86, 0x8C]);
  });

  it('decodes the default EXP assignments (VOL pedal + WAH position)', () => {
    const bytes = loadFixture('63-B American Idiot.prst');
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

  it('decodes all-zero CTRL masks for an untouched preset', () => {
    const bytes = loadFixture('63-C claude1.prst');
    const parsed = parseControlRecords(bytes, CONTROL_RECORDS_FILE_OFFSET);
    expect(parsed!.ctrl.every((assignment) => assignment.blockMask === 0)).toBe(true);
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
    const bytes = loadFixture('63-B American Idiot.prst')
      .subarray(CONTROL_RECORDS_FILE_OFFSET, CONTROL_RECORDS_FILE_OFFSET + 40);
    expect(parseControlRecords(bytes, 0)).toBeUndefined();
  });
});

describe('buildDefaultTail', () => {
  it('matches the byte-exact tail of a factory-fresh export', () => {
    const bytes = loadFixture('63-C claude1.prst');
    const realTail = bytes.subarray(CONTROL_RECORDS_FILE_OFFSET, 0x4C6);
    expect(Array.from(buildDefaultTail())).toEqual(Array.from(realTail));
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

  it('keeps a CTRL mask with high bits beyond the 11 modeled blocks', () => {
    const ctrl = defaultCtrlAssignments();
    ctrl[1] = { ctrlIndex: 1, blockMask: 0x1005 }; // bit 12 set + PRE + DST
    const tail = buildDefaultTail(undefined, ctrl);
    const parsed = parseControlRecords(tail, 0);
    expect(parsed).toBeDefined();
    expect(parsed!.ctrl[1].blockMask).toBe(0x1005);
  });
});

describe('applyControlRecords', () => {
  it('overwrites only the targeted mask byte in a real file tail', () => {
    const original = loadFixture('63-B American Idiot.prst');
    const modified = new Uint8Array(original);
    const parsed = parseControlRecords(original, CONTROL_RECORDS_FILE_OFFSET)!;
    const ctrl = parsed.ctrl.map((assignment) => ({ ...assignment }));
    ctrl[1] = { ctrlIndex: 1, blockMask: 0x88 };
    const ok = applyControlRecords(modified, CONTROL_RECORDS_FILE_OFFSET, parsed.exp, ctrl);
    expect(ok).toBe(true);
    const reparsed = parseControlRecords(modified, CONTROL_RECORDS_FILE_OFFSET)!;
    expect(reparsed.ctrl[1].blockMask).toBe(0x88);
    // Exactly one byte differs (mask low byte of CTRL 2's record)
    const diffs: number[] = [];
    for (let i = 0; i < original.length; i++) {
      if (original[i] !== modified[i]) diffs.push(i);
    }
    expect(diffs).toHaveLength(1);
  });

  it('is a no-op when neither exp nor ctrl is provided', () => {
    const original = loadFixture('63-C claude1.prst');
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
