import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  classifyFrame,
  extractToggleState,
  fingerprintKey,
  findDuplicateTrigger,
  processLooperFrame,
  loadLooperStore,
  saveLooperStore,
  TRIGGER_DEBOUNCE_MS,
  type LooperFrameInput,
  type LooperTriggerMap,
} from '@/core/looperTriggers';
import { FS_ON_THRESHOLD } from '@/core/midiControlMap';
import type { LooperBindings } from '@/core/looperBindings';

// Synthetic frames built from the byte offsets documented in
// useMidiDevice.onMidiMessage and docs/protocol-capture.md §4.

const GP_HEADER = [0xf0, 0x21, 0x25, 0x7e, 0x47, 0x50, 0x2d, 0x32];

function gpFrame(sub: number, length: number, bytes: Record<number, number>): Uint8Array {
  const frame = new Uint8Array(length);
  frame.set(GP_HEADER);
  frame[8] = 0x12;
  frame[9] = sub;
  for (const [offsetText, value] of Object.entries(bytes)) {
    frame[Number(offsetText)] = value;
  }
  return frame;
}

/** 0x12/0x10 toggle notification: bytes[29..36] non-zero, block@38, state@40. */
function toggleFrame(block: number, state: number): Uint8Array {
  return gpFrame(0x10, 46, { 29: 0x01, 38: block, 40: state });
}

/** 0x12/0x10 knob notification: bytes[29..36] all zero. */
function knobFrame(): Uint8Array {
  return gpFrame(0x10, 46, { 22: 3, 24: 1 });
}

/** 0x12/0x08 FX-state response: data[14] != 0x08, block@22, state@24. */
function fxStateFrame(block: number, state: number): Uint8Array {
  return gpFrame(0x08, 28, { 14: 0x01, 22: block, 24: state });
}

/** 0x12/0x08 change frame: data[14] == 0x08, slot nibble-encoded at [25],[26]. */
function slotChangeFrame(slot: number, extra: Record<number, number> = {}): Uint8Array {
  return gpFrame(0x08, 28, {
    14: 0x08,
    25: (slot >> 4) & 0x0f,
    26: slot & 0x0f,
    ...extra,
  });
}

const RECORD_FS1: LooperBindings = {
  footswitches: { 1: { kind: 'recordToggle' } },
  expTarget: null,
};

function baseInput(overrides: Partial<LooperFrameInput> = {}): LooperFrameInput {
  return {
    data: toggleFrame(2, 1),
    currentSlot: 5,
    suppressed: false,
    panelOpen: true,
    armedFs: null,
    triggers: { 1: { kind: 'toggle', block: 2 } },
    bindings: RECORD_FS1,
    lastMatchAt: new Map<string, number>(),
    now: 10_000,
    ...overrides,
  };
}

describe('classifyFrame', () => {
  it('classifies a CC press edge and ignores the release edge', () => {
    const press = new Uint8Array([0xb0, 80, 127]);
    const release = new Uint8Array([0xb0, 80, FS_ON_THRESHOLD - 1]);
    expect(classifyFrame(press, 5)).toEqual({ kind: 'cc', cc: 80 });
    expect(classifyFrame(release, 5)).toBeNull();
  });

  it('classifies a 0x10 toggle frame by block and rejects knob-shaped frames', () => {
    expect(classifyFrame(toggleFrame(3, 1), 5)).toEqual({ kind: 'toggle', block: 3 });
    expect(classifyFrame(knobFrame(), 5)).toBeNull();
  });

  it('gives 0x08 FX-state frames the SAME fingerprint as 0x10 toggles', () => {
    const viaToggle = classifyFrame(toggleFrame(3, 1), 5);
    const viaFxState = classifyFrame(fxStateFrame(3, 0), 5);
    expect(viaFxState).toEqual({ kind: 'toggle', block: 3 });
    expect(fingerprintKey(viaToggle!)).toBe(fingerprintKey(viaFxState!));
  });

  it('rejects toggle frames with out-of-range blocks', () => {
    expect(classifyFrame(toggleFrame(11, 1), 5)).toBeNull();
    expect(classifyFrame(fxStateFrame(11, 1), 5)).toBeNull();
  });

  it('classifies a same-slot change frame as sysex08', () => {
    const fp = classifyFrame(slotChangeFrame(5), 5);
    expect(fp).toMatchObject({ kind: 'sysex08' });
  });

  it('sysex08 signature ignores the slot nibbles but not the payload prefix', () => {
    const onSlot5 = classifyFrame(slotChangeFrame(5, { 15: 0x22 }), 5);
    const onSlot18 = classifyFrame(slotChangeFrame(18, { 15: 0x22 }), 18);
    const different = classifyFrame(slotChangeFrame(5, { 15: 0x33 }), 5);
    expect(fingerprintKey(onSlot5!)).toBe(fingerprintKey(onSlot18!));
    expect(fingerprintKey(onSlot5!)).not.toBe(fingerprintKey(different!));
  });

  it('never classifies real slot changes or unknown/short frames', () => {
    expect(classifyFrame(slotChangeFrame(7), 5)).toBeNull(); // different slot
    expect(classifyFrame(slotChangeFrame(7), null)).toBeNull(); // slot unknown
    expect(classifyFrame(gpFrame(0x0c, 38, {}), 5)).toBeNull(); // effect change
    expect(classifyFrame(gpFrame(0x10, 20, { 29: 1 }), 5)).toBeNull(); // truncated
    expect(classifyFrame(new Uint8Array([0x90, 60, 100]), 5)).toBeNull(); // note on
  });
});

describe('extractToggleState', () => {
  it('reads the post-stomp state from both toggle-shaped frame families', () => {
    expect(extractToggleState(toggleFrame(2, 1))).toBe(true);
    expect(extractToggleState(toggleFrame(2, 0))).toBe(false);
    expect(extractToggleState(fxStateFrame(2, 1))).toBe(true);
    expect(extractToggleState(fxStateFrame(2, 0))).toBe(false);
  });

  it('returns null for non-toggle frames', () => {
    expect(extractToggleState(knobFrame())).toBeNull();
    expect(extractToggleState(slotChangeFrame(5))).toBeNull();
    expect(extractToggleState(new Uint8Array([0xb0, 80, 127]))).toBeNull();
  });
});

describe('findDuplicateTrigger', () => {
  const triggers: LooperTriggerMap = {
    1: { kind: 'toggle', block: 2 },
    2: { kind: 'cc', cc: 80 },
  };

  it('finds the other row bound to the same fingerprint', () => {
    expect(findDuplicateTrigger(triggers, { kind: 'toggle', block: 2 }, 3)).toBe(1);
  });

  it('ignores the row being (re-)learned and unbound fingerprints', () => {
    expect(findDuplicateTrigger(triggers, { kind: 'toggle', block: 2 }, 1)).toBeNull();
    expect(findDuplicateTrigger(triggers, { kind: 'toggle', block: 9 }, 3)).toBeNull();
  });
});

describe('processLooperFrame', () => {
  it('passes frames it cannot classify', () => {
    const decision = processLooperFrame(baseInput({ data: knobFrame() }));
    expect(decision).toEqual({ type: 'pass' });
  });

  it('passes echo frames while suppression is active, but keeps CC live', () => {
    const echo = processLooperFrame(baseInput({ suppressed: true }));
    expect(echo).toEqual({ type: 'pass' });
    const cc = processLooperFrame(baseInput({
      suppressed: true,
      armedFs: 3,
      data: new Uint8Array([0xb0, 81, 127]),
    }));
    expect(cc).toMatchObject({ type: 'learned', fs: 3, fp: { kind: 'cc', cc: 81 } });
  });

  it('learn wins over hijack and carries the inverted revert toggle', () => {
    const decision = processLooperFrame(baseInput({
      armedFs: 4,
      data: toggleFrame(6, 1),
    }));
    expect(decision).toMatchObject({
      type: 'learned',
      fs: 4,
      fp: { kind: 'toggle', block: 6 },
      revertToggle: { block: 6, enabled: false },
    });
  });

  it('learning a sysex08 frame needs no revert toggle', () => {
    const decision = processLooperFrame(baseInput({
      armedFs: 4,
      data: slotChangeFrame(5),
    }));
    expect(decision).toMatchObject({ type: 'learned', fs: 4, revertToggle: null });
  });

  it('rejects learning a fingerprint already bound to another row', () => {
    const decision = processLooperFrame(baseInput({ armedFs: 4 }));
    expect(decision).toEqual({ type: 'learnRejected', fs: 4, duplicateOfFs: 1 });
  });

  it('allows re-learning the same fingerprint onto its own row', () => {
    const decision = processLooperFrame(baseInput({ armedFs: 1 }));
    expect(decision).toMatchObject({ type: 'learned', fs: 1 });
  });

  it('hijacks a learned + bound frame and reverts the stomped toggle', () => {
    const decision = processLooperFrame(baseInput({ data: toggleFrame(2, 0) }));
    expect(decision).toMatchObject({
      type: 'hijacked',
      fs: 1,
      action: { kind: 'recordToggle' },
      revertToggle: { block: 2, enabled: true },
    });
  });

  it('passes when the looper panel is closed', () => {
    const decision = processLooperFrame(baseInput({ panelOpen: false }));
    expect(decision).toEqual({ type: 'pass' });
  });

  it("passes when the learned row's action is '-' (unbound)", () => {
    const decision = processLooperFrame(baseInput({
      bindings: { footswitches: {}, expTarget: null },
    }));
    expect(decision).toEqual({ type: 'pass' });
  });

  it('passes frames matching no learned trigger', () => {
    const decision = processLooperFrame(baseInput({ data: toggleFrame(9, 1) }));
    expect(decision).toEqual({ type: 'pass' });
  });

  it('debounces a sibling frame of the same stomp inside the window', () => {
    const key = fingerprintKey({ kind: 'toggle', block: 2 });
    const justFired = new Map([[key, 10_000 - TRIGGER_DEBOUNCE_MS + 1]]);
    const longAgo = new Map([[key, 10_000 - TRIGGER_DEBOUNCE_MS]]);
    expect(processLooperFrame(baseInput({ lastMatchAt: justFired })))
      .toEqual({ type: 'debounced' });
    expect(processLooperFrame(baseInput({ lastMatchAt: longAgo })))
      .toMatchObject({ type: 'hijacked' });
  });
});

describe('looper store persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const triggers: LooperTriggerMap = {
    1: { kind: 'toggle', block: 2 },
    2: { kind: 'sysex08', sig: '00 01 02' },
    3: { kind: 'cc', cc: 80 },
  };

  it('round-trips bindings and triggers', () => {
    saveLooperStore(RECORD_FS1, triggers);
    expect(loadLooperStore()).toEqual({ bindings: RECORD_FS1, triggers });
  });

  it('returns null on missing or malformed data', () => {
    expect(loadLooperStore()).toBeNull();
    localStorage.setItem('gp200:looper', 'not json');
    expect(loadLooperStore()).toBeNull();
    localStorage.setItem('gp200:looper', JSON.stringify({ v: 999 }));
    expect(loadLooperStore()).toBeNull();
  });

  it('returns null when a stored action or fingerprint is invalid', () => {
    saveLooperStore(RECORD_FS1, triggers);
    const raw = JSON.parse(localStorage.getItem('gp200:looper')!);
    raw.triggers[1] = { kind: 'toggle', block: 99 };
    localStorage.setItem('gp200:looper', JSON.stringify(raw));
    expect(loadLooperStore()).toBeNull();

    saveLooperStore(RECORD_FS1, triggers);
    const raw2 = JSON.parse(localStorage.getItem('gp200:looper')!);
    raw2.bindings.footswitches[1] = { kind: 'bogus' };
    localStorage.setItem('gp200:looper', JSON.stringify(raw2));
    expect(loadLooperStore()).toBeNull();
  });

  it('swallows storage failures on save', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(() => saveLooperStore(RECORD_FS1, triggers)).not.toThrow();
  });
});
