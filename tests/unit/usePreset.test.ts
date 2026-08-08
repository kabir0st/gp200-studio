import { describe, it, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { usePreset } from '@/hooks/usePreset';
import { createDefaultPreset } from '@/core/defaultPreset';
import type { GP200Preset } from '@/core/types';

/** A preset whose CTRL 1 mask carries bit 11 — the device-written, unmodeled
 *  bit that no pedal maps to but that the codec round-trips verbatim. */
function presetWithMask(ctrlIndex: number, blockMask: number): GP200Preset {
  const base = createDefaultPreset();
  const ctrlAssignments = Array.from({ length: 8 }, (_, i) => ({
    ctrlIndex: i,
    blockMask: i === ctrlIndex ? blockMask : 0,
  }));
  return { ...base, ctrlAssignments };
}

describe('usePreset CTRL mask mutators', () => {
  it('setCtrlBlock sets and clears a single block bit', () => {
    const { result } = renderHook(() => usePreset());
    act(() => result.current.loadPreset(presetWithMask(0, 0)));

    act(() => result.current.setCtrlBlock(0, 2, true));  // DST
    expect(result.current.preset!.ctrlAssignments![0].blockMask).toBe(0x004);

    act(() => result.current.setCtrlBlock(0, 10, true)); // VOL
    expect(result.current.preset!.ctrlAssignments![0].blockMask).toBe(0x404);

    act(() => result.current.setCtrlBlock(0, 2, false));
    expect(result.current.preset!.ctrlAssignments![0].blockMask).toBe(0x400);
  });

  it('setCtrlBlock preserves the unmodeled bit 11', () => {
    const { result } = renderHook(() => usePreset());
    act(() => result.current.loadPreset(presetWithMask(3, 0x800)));

    act(() => result.current.setCtrlBlock(3, 0, true));  // PRE
    expect(result.current.preset!.ctrlAssignments![3].blockMask).toBe(0x801);
  });

  it('setCtrlMask keeps bit 11 instead of clamping it away', () => {
    // Regression: the clamp was `& 0x7FF`, which dropped bit 11 on any
    // whole-mask write — while parseControlRecords keeps it (& 0x0FFF) and
    // applyControlRecords writes it back, so the editor and the file disagreed.
    const { result } = renderHook(() => usePreset());
    act(() => result.current.loadPreset(presetWithMask(1, 0)));

    act(() => result.current.setCtrlMask(1, 0x805));
    expect(result.current.preset!.ctrlAssignments![1].blockMask).toBe(0x805);
  });

  it('setCtrlMask still strips the garbage high nibble', () => {
    const { result } = renderHook(() => usePreset());
    act(() => result.current.loadPreset(presetWithMask(1, 0)));

    act(() => result.current.setCtrlMask(1, 0xF005));
    expect(result.current.preset!.ctrlAssignments![1].blockMask).toBe(0x005);
  });

  it('setCtrlMask(i, 0) clears the whole mask', () => {
    const { result } = renderHook(() => usePreset());
    act(() => result.current.loadPreset(presetWithMask(7, 0x145)));

    act(() => result.current.setCtrlMask(7, 0));
    expect(result.current.preset!.ctrlAssignments![7].blockMask).toBe(0);
  });

  it('ignores out-of-range ctrl and block indices', () => {
    const { result } = renderHook(() => usePreset());
    act(() => result.current.loadPreset(presetWithMask(0, 0x001)));

    act(() => result.current.setCtrlBlock(8, 0, true));
    act(() => result.current.setCtrlBlock(0, 11, true));
    act(() => result.current.setCtrlMask(-1, 0x0FF));
    expect(result.current.preset!.ctrlAssignments![0].blockMask).toBe(0x001);
  });
});
